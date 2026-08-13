/**
 * Data collection into the local store.
 *
 * Each sync exists for a different reason:
 *  - rank history: Search Console's window is rolling, so unsnapshotted days are
 *    lost permanently. This is the one that must run daily.
 *  - sitemap discovery: cheap, and needed to know what SHOULD be indexed.
 *  - index status: URL Inspection is 2,000/day/property and one URL per call, so
 *    spend is budgeted and prioritised (never-seen first, then stalest).
 *  - SERP positions: billed per Serper call and retained by nobody else.
 */
import * as cheerio from 'cheerio';
import { getDb, isoDate, nowIso, toDomain } from './db.js';
import { listProfiles, getProfile, type SiteProfile } from './profiles.js';
import { queryAnalytics } from '../google/tools/analytics.js';
import { listSitemaps } from '../google/tools/sitemaps.js';
import { inspectUrl } from '../google/tools/inspection.js';
import { fetchSerp, isOwnResult } from '../serp/client.js';
import { limitConcurrency } from '../common/concurrency.js';

/** Google's documented URL Inspection ceiling per property per day. */
export const INSPECTION_DAILY_QUOTA = 2000;
/** Leave headroom so interactive inspections still work after a sync. */
export const DEFAULT_INSPECTION_BUDGET = 1500;

export interface SyncResult {
    siteUrl: string;
    task: string;
    ok: boolean;
    detail: string;
    counts?: Record<string, number>;
}

// ---------------------------------------------------------------- rank history

/**
 * Snapshot daily Search Console rows into rank_daily.
 *
 * @param siteUrl - GSC property.
 * @param days - How many days back to request. GSC finalises data on a ~2-3 day
 *   lag, so a window wider than the gap since the last run repairs late arrivals.
 */
export async function syncRankHistory(siteUrl: string, days = 10): Promise<SyncResult> {
    const db = getDb();
    const end = new Date();
    // GSC finalises with a lag; ending "today" just returns empty recent days.
    end.setDate(end.getDate() - 2);
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const insert = db.prepare(
        `INSERT INTO rank_daily (site_url, date, query, page, clicks, impressions, ctr, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(site_url, date, query, page) DO UPDATE SET
           clicks = excluded.clicks, impressions = excluded.impressions,
           ctr = excluded.ctr, position = excluded.position`
    );

    let written = 0;
    let startRow = 0;
    const PAGE = 25000;

    try {
        // Paginate: a busy property easily exceeds one page for a 10-day window.
        for (;;) {
            const rows = await queryAnalytics({
                siteUrl,
                startDate: fmt(start),
                endDate: fmt(end),
                dimensions: ['date', 'query', 'page'],
                limit: PAGE,
                startRow,
            });
            if (!rows.length) break;

            const tx = db.transaction((batch: typeof rows) => {
                for (const r of batch) {
                    const [date, query, page] = r.keys ?? [];
                    if (!date || !query) continue;
                    insert.run(
                        siteUrl, date, query, page ?? '',
                        Number(r.clicks ?? 0), Number(r.impressions ?? 0),
                        Number(r.ctr ?? 0), Number(r.position ?? 0)
                    );
                    written++;
                }
            });
            tx(rows);

            if (rows.length < PAGE) break;
            startRow += PAGE;
        }
    } catch (e) {
        return { siteUrl, task: 'rank', ok: false, detail: (e as Error).message };
    }

    setSyncState(`rank:${siteUrl}`, nowIso());
    return {
        siteUrl,
        task: 'rank',
        ok: true,
        detail: `${written} rows for ${fmt(start)}..${fmt(end)}`,
        counts: { rows: written },
    };
}

// ----------------------------------------------------------- sitemap discovery

/** Fetch and parse a sitemap or sitemap index, following nested indexes once. */
async function fetchSitemapUrls(feedUrl: string, depth = 0): Promise<{ url: string; lastmod?: string }[]> {
    if (depth > 2) return [];
    let xml: string;
    try {
        const res = await fetch(feedUrl, {
            headers: { 'User-Agent': 'SearchConsoleMCP/2.0 (+sitemap-sync)' },
            signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) return [];
        xml = await res.text();
    } catch {
        return [];
    }

    const $ = cheerio.load(xml, { xmlMode: true });

    // A <sitemapindex> points at more sitemaps; recurse into them.
    const nested = $('sitemapindex > sitemap > loc')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean);
    if (nested.length) {
        const batches = await limitConcurrency(nested, 4, (u) => fetchSitemapUrls(u, depth + 1));
        return batches.flat();
    }

    const out: { url: string; lastmod?: string }[] = [];
    $('urlset > url').each((_, el) => {
        const $el = $(el);
        const loc = $el.find('loc').first().text().trim();
        if (!loc) return;
        const lastmod = $el.find('lastmod').first().text().trim();
        out.push(lastmod ? { url: loc, lastmod } : { url: loc });
    });
    return out;
}

/** Record every URL advertised in the property's sitemaps. */
export async function syncSitemapUrls(siteUrl: string): Promise<SyncResult> {
    const db = getDb();
    let feeds: string[];
    try {
        feeds = (await listSitemaps(siteUrl)).map((s) => s.path).filter((p): p is string => Boolean(p));
    } catch (e) {
        return { siteUrl, task: 'sitemap', ok: false, detail: (e as Error).message };
    }
    if (!feeds.length) {
        return { siteUrl, task: 'sitemap', ok: true, detail: 'no sitemaps registered in Search Console' };
    }

    const found = (await limitConcurrency(feeds, 3, (f) => fetchSitemapUrls(f))).flat();
    const now = nowIso();
    const insert = db.prepare(
        `INSERT INTO url_discovery (site_url, url, source, lastmod, first_seen, last_seen)
         VALUES (?, ?, 'sitemap', ?, ?, ?)
         ON CONFLICT(site_url, url) DO UPDATE SET
           lastmod = excluded.lastmod, last_seen = excluded.last_seen`
    );
    const seen = new Set<string>();
    const tx = db.transaction(() => {
        for (const { url, lastmod } of found) {
            if (seen.has(url)) continue;
            seen.add(url);
            insert.run(siteUrl, url, lastmod ?? null, now, now);
        }
    });
    tx();

    return {
        siteUrl,
        task: 'sitemap',
        ok: true,
        detail: `${seen.size} URLs across ${feeds.length} sitemap(s)`,
        counts: { urls: seen.size, sitemaps: feeds.length },
    };
}

// --------------------------------------------------------------- index status

/** Calls already spent against this property today. */
function quotaUsedToday(siteUrl: string): number {
    const row = getDb()
        .prepare('SELECT calls FROM quota_usage WHERE site_url = ? AND day = ?')
        .get(siteUrl, isoDate()) as { calls: number } | undefined;
    return row?.calls ?? 0;
}

function recordQuota(siteUrl: string, calls: number): void {
    getDb()
        .prepare(
            `INSERT INTO quota_usage (site_url, day, calls) VALUES (?, ?, ?)
             ON CONFLICT(site_url, day) DO UPDATE SET calls = calls + excluded.calls`
        )
        .run(siteUrl, isoDate(), calls);
}

/**
 * Inspect URLs that are new or stale, within the daily quota.
 *
 * Priority: never-inspected first, then oldest inspection. Pages that failed to
 * index are re-checked sooner than healthy ones, since those are the ones being
 * actively worked on.
 */
export async function syncIndexStatus(
    siteUrl: string,
    opts: { budget?: number; freshDays?: number; staleDays?: number } = {}
): Promise<SyncResult> {
    const db = getDb();
    const budget = Math.max(0, Math.min(opts.budget ?? DEFAULT_INSPECTION_BUDGET, INSPECTION_DAILY_QUOTA));
    const used = quotaUsedToday(siteUrl);
    const remaining = Math.max(0, budget - used);
    if (remaining === 0) {
        return { siteUrl, task: 'index', ok: true, detail: `daily budget exhausted (${used}/${budget})` };
    }

    // Healthy pages are re-checked rarely; problem pages often.
    const freshCutoff = new Date(Date.now() - (opts.freshDays ?? 30) * 86_400_000).toISOString();
    const staleCutoff = new Date(Date.now() - (opts.staleDays ?? 7) * 86_400_000).toISOString();

    const candidates = db
        .prepare(
            `SELECT d.url,
                    s.inspected_at,
                    s.verdict
               FROM url_discovery d
               LEFT JOIN url_status s ON s.site_url = d.site_url AND s.url = d.url
              WHERE d.site_url = @site
                AND (
                      s.url IS NULL
                   OR (s.verdict = 'PASS' AND s.inspected_at < @fresh)
                   OR (s.verdict IS NOT 'PASS' AND s.inspected_at < @stale)
                )
              ORDER BY (s.url IS NULL) DESC, s.inspected_at ASC
              LIMIT @limit`
        )
        .all({ site: siteUrl, fresh: freshCutoff, stale: staleCutoff, limit: remaining }) as {
        url: string;
    }[];

    if (!candidates.length) {
        return { siteUrl, task: 'index', ok: true, detail: 'all discovered URLs are fresh' };
    }

    const upsert = db.prepare(
        `INSERT INTO url_status (
            site_url, url, verdict, coverage_state, robots_txt_state, indexing_state,
            page_fetch_state, google_canonical, user_canonical, crawled_as,
            last_crawl_time, sitemaps, referring_urls, rich_results, inspected_at, raw
         ) VALUES (
            @site_url, @url, @verdict, @coverage_state, @robots_txt_state, @indexing_state,
            @page_fetch_state, @google_canonical, @user_canonical, @crawled_as,
            @last_crawl_time, @sitemaps, @referring_urls, @rich_results, @inspected_at, @raw
         )
         ON CONFLICT(site_url, url) DO UPDATE SET
            verdict = excluded.verdict, coverage_state = excluded.coverage_state,
            robots_txt_state = excluded.robots_txt_state, indexing_state = excluded.indexing_state,
            page_fetch_state = excluded.page_fetch_state, google_canonical = excluded.google_canonical,
            user_canonical = excluded.user_canonical, crawled_as = excluded.crawled_as,
            last_crawl_time = excluded.last_crawl_time, sitemaps = excluded.sitemaps,
            referring_urls = excluded.referring_urls, rich_results = excluded.rich_results,
            inspected_at = excluded.inspected_at, raw = excluded.raw`
    );

    let inspected = 0;
    let failed = 0;

    // Modest concurrency: the quota is daily, not per-second, so there is nothing
    // to gain from hammering and plenty to lose if Google rate-limits us.
    const results = await limitConcurrency(candidates.map((c) => c.url), 4, async (url) => {
        try {
            const res = await inspectUrl(siteUrl, url);
            return { url, res };
        } catch (e) {
            return { url, error: (e as Error).message };
        }
    });

    const now = nowIso();
    const tx = db.transaction(() => {
        for (const r of results) {
            if ('error' in r && r.error) {
                failed++;
                continue;
            }
            const idx = (r as any).res?.inspectionResult?.indexStatusResult ?? {};
            upsert.run({
                site_url: siteUrl,
                url: r.url,
                verdict: idx.verdict ?? null,
                coverage_state: idx.coverageState ?? null,
                robots_txt_state: idx.robotsTxtState ?? null,
                indexing_state: idx.indexingState ?? null,
                page_fetch_state: idx.pageFetchState ?? null,
                google_canonical: idx.googleCanonical ?? null,
                user_canonical: idx.userCanonical ?? null,
                crawled_as: idx.crawledAs ?? null,
                last_crawl_time: idx.lastCrawlTime ?? null,
                sitemaps: idx.sitemap ? JSON.stringify(idx.sitemap) : null,
                referring_urls: idx.referringUrls ? JSON.stringify(idx.referringUrls) : null,
                rich_results: (r as any).res?.inspectionResult?.richResultsResult
                    ? JSON.stringify((r as any).res.inspectionResult.richResultsResult)
                    : null,
                inspected_at: now,
                raw: JSON.stringify((r as any).res ?? {}),
            });
            inspected++;
        }
    });
    tx();

    recordQuota(siteUrl, inspected + failed);

    return {
        siteUrl,
        task: 'index',
        ok: true,
        detail: `${inspected} inspected, ${failed} failed; quota ${used + inspected + failed}/${budget} today`,
        counts: { inspected, failed },
    };
}

// -------------------------------------------------------------- SERP positions

/**
 * Record live SERP positions for a site's tracked queries, from its own market.
 */
export async function syncSerpPositions(siteUrl: string, maxQueries = 25): Promise<SyncResult> {
    const profile = getProfile(siteUrl);
    if (!profile) return { siteUrl, task: 'serp', ok: false, detail: 'no site profile' };

    const queries = profile.trackedQueries.slice(0, maxQueries);
    if (!queries.length) {
        return { siteUrl, task: 'serp', ok: true, detail: 'no tracked queries configured' };
    }
    if (!process.env.SERPER_API_KEY) {
        return { siteUrl, task: 'serp', ok: false, detail: 'SERPER_API_KEY not set' };
    }

    const db = getDb();
    const date = isoDate();
    const insert = db.prepare(
        `INSERT INTO serp_daily (site_url, date, query, location, device, position, url, domain, is_ours, title)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(site_url, date, query, location, device, position) DO UPDATE SET
           url = excluded.url, domain = excluded.domain,
           is_ours = excluded.is_ours, title = excluded.title`
    );

    const location = profile.primaryLocation ?? '';
    let rows = 0;
    let credits = 0;
    const failures: string[] = [];

    for (const query of queries) {
        try {
            const serp = await fetchSerp({
                query,
                country: profile.country,
                language: profile.language,
                device: profile.device,
                location: profile.primaryLocation,
                num: 20,
            });
            credits += serp.credits ?? 1;
            const tx = db.transaction(() => {
                for (const r of serp.organic) {
                    insert.run(
                        siteUrl, date, query, location, profile.device, r.position,
                        r.link, toDomain(r.link), isOwnResult(r.link, siteUrl) ? 1 : 0, r.title ?? null
                    );
                    rows++;
                }
            });
            tx();
        } catch (e) {
            failures.push(`${query}: ${(e as Error).message}`);
        }
    }

    return {
        siteUrl,
        task: 'serp',
        ok: failures.length < queries.length,
        detail: `${rows} positions for ${queries.length - failures.length}/${queries.length} queries, ~${credits} credits` +
            (failures.length ? `; failures: ${failures.slice(0, 3).join('; ')}` : ''),
        counts: { rows, credits, failed: failures.length },
    };
}

// ------------------------------------------------------------------ orchestrate

export interface SyncAllOptions {
    /** Restrict to one property. */
    siteUrl?: string;
    tasks?: ('rank' | 'sitemap' | 'index' | 'serp')[];
    rankDays?: number;
    inspectionBudget?: number;
}

/** Run the configured syncs across every active site profile. */
export async function syncAll(opts: SyncAllOptions = {}): Promise<SyncResult[]> {
    const tasks = opts.tasks ?? ['rank', 'sitemap', 'index', 'serp'];
    const profiles: SiteProfile[] = opts.siteUrl
        ? ([getProfile(opts.siteUrl)].filter(Boolean) as SiteProfile[])
        : listProfiles();

    const results: SyncResult[] = [];
    for (const profile of profiles) {
        // Sequential per site: these share the same API quotas, and a sync that
        // finishes slowly is strictly better than one that gets rate-limited.
        if (tasks.includes('rank')) results.push(await syncRankHistory(profile.siteUrl, opts.rankDays));
        if (tasks.includes('sitemap')) results.push(await syncSitemapUrls(profile.siteUrl));
        if (tasks.includes('index')) {
            results.push(await syncIndexStatus(profile.siteUrl, { budget: opts.inspectionBudget }));
        }
        if (tasks.includes('serp')) results.push(await syncSerpPositions(profile.siteUrl));
    }
    setSyncState('lastRun', nowIso());
    return results;
}

export function setSyncState(key: string, value: string): void {
    getDb()
        .prepare('INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .run(key, value);
}

export function getSyncState(key: string): string | undefined {
    const row = getDb().prepare('SELECT value FROM sync_state WHERE key = ?').get(key) as
        | { value: string }
        | undefined;
    return row?.value;
}
