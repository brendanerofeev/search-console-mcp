/**
 * Off-page analysis: the half of SEO this server was previously blind to.
 *
 * Snapshots into backlink_daily rather than only answering live, because link
 * building is slow and a single reading is meaningless — the question is always
 * "more than last month?" and "closing on them or not?".
 */
import { call } from './client.js';
import { query } from '../store/db.js';
import { getProfile } from '../store/profiles.js';

export interface LinkProfile {
    target: string;
    rank: number;
    backlinks: number;
    referringDomains: number;
    referringMainDomains: number;
    brokenBacklinks: number;
    isCompetitor: boolean;
}

function hostOf(siteUrl: string): string {
    return siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}

async function summary(target: string): Promise<Omit<LinkProfile, 'isCompetitor'>> {
    const { result } = await call<Array<Record<string, number>>>(
        '/backlinks/summary/live',
        { target, internal_list_limit: 1, backlinks_status_type: 'live' },
        { siteUrl: target }
    );
    const s = result?.[0] ?? {};
    return {
        target,
        rank: Number(s.rank ?? 0),
        backlinks: Number(s.backlinks ?? 0),
        referringDomains: Number(s.referring_domains ?? 0),
        referringMainDomains: Number(s.referring_main_domains ?? 0),
        brokenBacklinks: Number(s.broken_backlinks ?? 0),
    };
}

export interface BacklinkReport {
    siteUrl: string;
    site: LinkProfile;
    competitors: LinkProfile[];
    /** Referring-domain gap to the strongest competitor. Negative = behind. */
    domainGap: number | null;
    verdict: string;
    notes: string[];
}

/**
 * Snapshot a site's link profile alongside its competitors.
 *
 * Competitors come from the site profile so the comparison set is a recorded
 * decision rather than whatever happened to be in a SERP that day.
 */
export async function backlinkReport(siteUrl: string, extraCompetitors: string[] = []): Promise<BacklinkReport> {
    const profile = await getProfile(siteUrl);
    const host = hostOf(siteUrl);
    const competitors = [...new Set([...(profile?.competitors ?? []), ...extraCompetitors].map(hostOf))]
        .filter((c) => c && c !== host);

    const site = { ...(await summary(host)), isCompetitor: false };
    const comps: LinkProfile[] = [];
    for (const c of competitors) {
        comps.push({ ...(await summary(c)), isCompetitor: true });
    }

    const today = new Date().toISOString().slice(0, 10);
    for (const p of [site, ...comps]) {
        await query(
            `INSERT INTO backlink_daily
               (site_url, target, date, rank, backlinks, referring_domains,
                referring_main_domains, broken_backlinks, is_competitor)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (site_url, target, date) DO UPDATE SET
               rank = EXCLUDED.rank, backlinks = EXCLUDED.backlinks,
               referring_domains = EXCLUDED.referring_domains,
               referring_main_domains = EXCLUDED.referring_main_domains,
               broken_backlinks = EXCLUDED.broken_backlinks`,
            [siteUrl, p.target, today, p.rank, p.backlinks, p.referringDomains,
             p.referringMainDomains, p.brokenBacklinks, p.isCompetitor]
        );
    }

    const strongest = comps.length ? Math.max(...comps.map((c) => c.referringMainDomains)) : null;
    const domainGap = strongest === null ? null : site.referringMainDomains - strongest;

    const notes: string[] = [];
    let verdict: string;
    if (strongest === null) {
        verdict = 'No competitors recorded on the site profile, so there is nothing to compare against. ' +
                  'Add competitors before reading this as good or bad — a link profile only means something relative.';
    } else if (domainGap !== null && domainGap < -20) {
        verdict =
            `Behind by ${Math.abs(domainGap)} referring domains against the strongest competitor ` +
            `(${site.referringMainDomains} vs ${strongest}). A gap this size is not closable by on-page work: ` +
            'better content and clean indexing will lift a page into contention, but the last few positions ' +
            'against an established profile need links.';
        const weakWinner = comps.filter((c) => c.referringMainDomains <= 5);
        if (weakWinner.length) {
            notes.push(
                `Not purely authority-driven though: ${weakWinner.map((c) => c.target).join(', ')} ` +
                'compete with almost no links, so a well-built, indexed, focused page can still win here.'
            );
        }
    } else if (domainGap !== null && domainGap < 0) {
        verdict = `Slightly behind (${site.referringMainDomains} vs ${strongest} referring domains) — within range of on-page work.`;
    } else {
        verdict = `Level or ahead on referring domains (${site.referringMainDomains} vs ${strongest}). ` +
                  'If pages still are not ranking, the cause is on-page or indexing, not authority.';
    }

    return { siteUrl, site, competitors: comps, domainGap, verdict, notes };
}

export interface GapDomain {
    domain: string;
    rank: number;
    competitorsLinked: number;
}

/**
 * Domains linking to competitors but not to us — the link-building shortlist.
 *
 * An empty result is a finding, not a failure: it means the niche has no shared
 * link ecosystem to mine, and outreach there is manual rather than systematic.
 */
export async function linkGap(
    siteUrl: string,
    competitors: string[],
    limit = 40
): Promise<{ siteUrl: string; total: number; domains: GapDomain[]; note: string }> {
    const host = hostOf(siteUrl);
    const targets: Record<string, string> = {};
    competitors.map(hostOf).slice(0, 20).forEach((c, i) => { targets[String(i + 1)] = c; });

    if (!Object.keys(targets).length) {
        return { siteUrl, total: 0, domains: [], note: 'No competitors supplied or recorded on the site profile.' };
    }

    const { result } = await call<Array<{ total_count?: number; items?: Array<Record<string, unknown>> }>>(
        '/backlinks/domain_intersection/live',
        { targets, exclude_targets: [host], limit, order_by: ['1.rank,desc'], backlinks_status_type: 'live' },
        { siteUrl }
    );

    const r = result?.[0];
    const items = r?.items ?? [];
    const domains: GapDomain[] = items.map((it) => {
        const inter = (it.intersections ?? {}) as Record<string, { rank?: number }>;
        const ranks = Object.values(inter).map((v) => Number(v?.rank ?? 0));
        return {
            domain: String(it.domain ?? it.target ?? ''),
            rank: Number(it.rank ?? (ranks.length ? Math.max(...ranks) : 0)),
            competitorsLinked: Object.keys(inter).length,
        };
    });

    return {
        siteUrl,
        total: Number(r?.total_count ?? domains.length),
        domains,
        note: domains.length
            ? 'Domains already linking to competitors. Those linking to several are the warmest — they demonstrably link to businesses like this one.'
            : 'No shared referring domains across these competitors. That is a finding rather than an error: this niche has no common link ecosystem to mine, so link building here is manual outreach, not list extraction.',
    };
}
