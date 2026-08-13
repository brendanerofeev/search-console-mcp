/**
 * JSON API for the reporting UI.
 *
 * Reads come straight from the Postgres archive rather than from Google, so the
 * dashboard is fast, free, and shows history that Google itself no longer holds.
 */
import { query } from '../store/db.js';
import { listProfiles, getProfile, upsertProfile } from '../store/profiles.js';

export interface ApiResult {
    status: number;
    body: unknown;
}

const notFound: ApiResult = { status: 404, body: { error: 'Not found' } };

/** Overview row per site for the dashboard index. */
async function sitesOverview(): Promise<ApiResult> {
    const profiles = await listProfiles(true);
    const rows = await query<{
        site_url: string;
        clicks: string;
        impressions: string;
        position: string;
        queries: string;
        prev_clicks: string;
        prev_position: string;
    }>(
        `SELECT site_url,
                SUM(clicks) FILTER (WHERE date >= CURRENT_DATE - 28)                       AS clicks,
                SUM(impressions) FILTER (WHERE date >= CURRENT_DATE - 28)                  AS impressions,
                COUNT(DISTINCT query) FILTER (WHERE date >= CURRENT_DATE - 28)             AS queries,
                CASE WHEN SUM(impressions) FILTER (WHERE date >= CURRENT_DATE - 28) > 0
                     THEN SUM(position * impressions) FILTER (WHERE date >= CURRENT_DATE - 28)
                        / SUM(impressions) FILTER (WHERE date >= CURRENT_DATE - 28) END    AS position,
                SUM(clicks) FILTER (WHERE date >= CURRENT_DATE - 56 AND date < CURRENT_DATE - 28) AS prev_clicks,
                CASE WHEN SUM(impressions) FILTER (WHERE date >= CURRENT_DATE - 56 AND date < CURRENT_DATE - 28) > 0
                     THEN SUM(position * impressions) FILTER (WHERE date >= CURRENT_DATE - 56 AND date < CURRENT_DATE - 28)
                        / SUM(impressions) FILTER (WHERE date >= CURRENT_DATE - 56 AND date < CURRENT_DATE - 28) END AS prev_position
           FROM rank_daily
          GROUP BY site_url`
    );
    const stats = new Map(rows.map((r) => [r.site_url, r]));

    const coverage = await query<{ site_url: string; indexed: string; total: string; discovered: string }>(
        `SELECT d.site_url,
                COUNT(s.url) FILTER (WHERE s.verdict = 'PASS')::text AS indexed,
                COUNT(s.url)::text                                   AS total,
                COUNT(d.url)::text                                   AS discovered
           FROM url_discovery d
           LEFT JOIN url_status s ON s.site_url = d.site_url AND s.url = d.url
          GROUP BY d.site_url`
    );
    const cov = new Map(coverage.map((c) => [c.site_url, c]));

    return {
        status: 200,
        body: profiles.map((p) => {
            const s = stats.get(p.siteUrl);
            const c = cov.get(p.siteUrl);
            const position = s?.position != null ? Number(Number(s.position).toFixed(1)) : null;
            const prevPosition = s?.prev_position != null ? Number(Number(s.prev_position).toFixed(1)) : null;
            return {
                siteUrl: p.siteUrl,
                domain: p.domain,
                customer: p.customer ?? null,
                primaryLocation: p.primaryLocation ?? null,
                trackedQueries: p.trackedQueries.length,
                clicks: Number(s?.clicks ?? 0),
                impressions: Number(s?.impressions ?? 0),
                queries: Number(s?.queries ?? 0),
                position,
                // Lower position is better, so improvement is a decrease.
                positionChange: position != null && prevPosition != null
                    ? Number((prevPosition - position).toFixed(1))
                    : null,
                clicksChange: Number(s?.clicks ?? 0) - Number(s?.prev_clicks ?? 0),
                indexed: Number(c?.indexed ?? 0),
                inspected: Number(c?.total ?? 0),
                discovered: Number(c?.discovered ?? 0),
            };
        }),
    };
}

/** Everything the site detail view needs, in one round trip. */
async function siteDetail(siteUrl: string, days: number): Promise<ApiResult> {
    const profile = await getProfile(siteUrl);
    if (!profile) return notFound;

    const [trend, topQueries, topPages, coverage, problems, movers, competitors] = await Promise.all([
        query(
            `SELECT date::text AS date, SUM(clicks) AS clicks, SUM(impressions) AS impressions,
                    CASE WHEN SUM(impressions) > 0
                         THEN SUM(position * impressions) / SUM(impressions) END AS position
               FROM rank_daily WHERE site_url = $1 AND date >= CURRENT_DATE - $2::int
              GROUP BY date ORDER BY date`,
            [siteUrl, days]
        ),
        query(
            `SELECT query, SUM(clicks) AS clicks, SUM(impressions) AS impressions,
                    CASE WHEN SUM(impressions) > 0
                         THEN SUM(position * impressions) / SUM(impressions) END AS position
               FROM rank_daily WHERE site_url = $1 AND date >= CURRENT_DATE - $2::int
              GROUP BY query ORDER BY SUM(impressions) DESC LIMIT 100`,
            [siteUrl, days]
        ),
        query(
            `SELECT page, SUM(clicks) AS clicks, SUM(impressions) AS impressions,
                    CASE WHEN SUM(impressions) > 0
                         THEN SUM(position * impressions) / SUM(impressions) END AS position
               FROM rank_daily WHERE site_url = $1 AND date >= CURRENT_DATE - $2::int AND page <> ''
              GROUP BY page ORDER BY SUM(impressions) DESC LIMIT 50`,
            [siteUrl, days]
        ),
        query(
            `SELECT verdict, coverage_state, COUNT(*)::int AS count
               FROM url_status WHERE site_url = $1
              GROUP BY verdict, coverage_state ORDER BY count DESC`,
            [siteUrl]
        ),
        query(
            `SELECT url, coverage_state, last_crawl_time
               FROM url_status WHERE site_url = $1 AND verdict IS DISTINCT FROM 'PASS'
              ORDER BY coverage_state, url LIMIT 200`,
            [siteUrl]
        ),
        // Climbers/fallers: weighted position in each half of the window.
        //
        // The midpoint comes from the data actually present, not from the
        // requested window. Splitting a 90-day window at day 45 when the archive
        // only holds 11 days puts every row in the "after" half, so nothing ever
        // qualifies as a mover and the panel looks broken while history builds.
        query(
            `WITH span AS (
               SELECT MIN(date) AS lo, MAX(date) AS hi
                 FROM rank_daily
                WHERE site_url = $1 AND date >= CURRENT_DATE - $2::int
             ), mid AS (
               SELECT (lo + ((hi - lo) / 2))::date AS m FROM span
             )
             SELECT query,
                    SUM(impressions) AS impressions,
                    CASE WHEN SUM(impressions) FILTER (WHERE date < m.m) > 0
                         THEN SUM(position*impressions) FILTER (WHERE date < m.m)
                            / SUM(impressions) FILTER (WHERE date < m.m) END AS pos_before,
                    CASE WHEN SUM(impressions) FILTER (WHERE date >= m.m) > 0
                         THEN SUM(position*impressions) FILTER (WHERE date >= m.m)
                            / SUM(impressions) FILTER (WHERE date >= m.m) END AS pos_after
               FROM rank_daily, mid m
              WHERE site_url = $1 AND date >= CURRENT_DATE - $2::int
              GROUP BY query HAVING SUM(impressions) >= 5`,
            [siteUrl, days]
        ),
        query(
            `SELECT domain, COUNT(*)::int AS appearances, AVG(position)::numeric(10,1) AS avg_position
               FROM serp_daily
              WHERE site_url = $1 AND NOT is_ours AND date >= CURRENT_DATE - $2::int
              GROUP BY domain ORDER BY appearances DESC, avg_position ASC LIMIT 20`,
            [siteUrl, days]
        ),
    ]);

    const shapedMovers = movers
        .filter((m: any) => m.pos_before != null && m.pos_after != null)
        .map((m: any) => ({
            query: m.query,
            impressions: Number(m.impressions),
            before: Number(Number(m.pos_before).toFixed(1)),
            after: Number(Number(m.pos_after).toFixed(1)),
            movement: Number((Number(m.pos_before) - Number(m.pos_after)).toFixed(1)),
        }))
        .sort((a, b) => b.movement - a.movement);

    const num = (v: any) => (v == null ? null : Number(Number(v).toFixed(1)));

    return {
        status: 200,
        body: {
            profile,
            days,
            trend: trend.map((t: any) => ({
                date: t.date,
                clicks: Number(t.clicks),
                impressions: Number(t.impressions),
                position: num(t.position),
            })),
            topQueries: topQueries.map((q: any) => ({
                query: q.query,
                clicks: Number(q.clicks),
                impressions: Number(q.impressions),
                position: num(q.position),
            })),
            topPages: topPages.map((p: any) => ({
                page: p.page,
                clicks: Number(p.clicks),
                impressions: Number(p.impressions),
                position: num(p.position),
            })),
            coverage,
            problems,
            climbers: shapedMovers.filter((m) => m.movement > 0).slice(0, 15),
            fallers: shapedMovers.filter((m) => m.movement < 0).slice(-15).reverse(),
            competitors: competitors.map((c: any) => ({
                domain: c.domain,
                appearances: c.appearances,
                avgPosition: Number(c.avg_position),
            })),
        },
    };
}

/** Daily series for one query, for the drill-down chart. */
async function queryDetail(siteUrl: string, q: string, days: number): Promise<ApiResult> {
    const rows = await query(
        `SELECT date::text AS date, SUM(clicks) AS clicks, SUM(impressions) AS impressions,
                CASE WHEN SUM(impressions) > 0
                     THEN SUM(position * impressions) / SUM(impressions) END AS position
           FROM rank_daily WHERE site_url = $1 AND query = $2 AND date >= CURRENT_DATE - $3::int
          GROUP BY date ORDER BY date`,
        [siteUrl, q, days]
    );
    const pages = await query(
        `SELECT page, SUM(impressions) AS impressions,
                CASE WHEN SUM(impressions) > 0
                     THEN SUM(position * impressions) / SUM(impressions) END AS position
           FROM rank_daily WHERE site_url = $1 AND query = $2 AND date >= CURRENT_DATE - $3::int AND page <> ''
          GROUP BY page ORDER BY SUM(impressions) DESC LIMIT 10`,
        [siteUrl, q, days]
    );
    return {
        status: 200,
        body: {
            query: q,
            series: rows.map((r: any) => ({
                date: r.date,
                clicks: Number(r.clicks),
                impressions: Number(r.impressions),
                position: r.position == null ? null : Number(Number(r.position).toFixed(1)),
            })),
            pages: pages.map((p: any) => ({
                page: p.page,
                impressions: Number(p.impressions),
                position: p.position == null ? null : Number(Number(p.position).toFixed(1)),
            })),
        },
    };
}

/**
 * Route an API request. `path` is everything after /api.
 */
export async function handleApi(
    path: string,
    params: URLSearchParams,
    method: string,
    body: unknown
): Promise<ApiResult> {
    const days = Math.min(Math.max(Number(params.get('days') ?? 90), 7), 480);

    if (path === '/sites' && method === 'GET') return sitesOverview();

    if (path === '/site' && method === 'GET') {
        const siteUrl = params.get('siteUrl');
        if (!siteUrl) return { status: 400, body: { error: 'siteUrl is required' } };
        return siteDetail(siteUrl, days);
    }

    if (path === '/query' && method === 'GET') {
        const siteUrl = params.get('siteUrl');
        const q = params.get('query');
        if (!siteUrl || !q) return { status: 400, body: { error: 'siteUrl and query are required' } };
        return queryDetail(siteUrl, q, days);
    }

    if (path === '/profile' && method === 'POST') {
        const input = body as Record<string, unknown>;
        if (!input?.siteUrl) return { status: 400, body: { error: 'siteUrl is required' } };
        return { status: 200, body: await upsertProfile(input as any) };
    }

    if (path === '/sync-state' && method === 'GET') {
        const rows = await query('SELECT key, value FROM sync_state ORDER BY key');
        return { status: 200, body: rows };
    }

    return notFound;
}
