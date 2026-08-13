/**
 * Keyword opportunity mining.
 *
 * Search Console records every query a site has appeared for, including ones
 * nobody targeted. That archive is the best candidate source available and it
 * costs nothing — unlike keyword tools, it is evidence that Google already
 * associates the site with the term.
 *
 * What this CANNOT tell you: total search demand. Impressions are demand
 * filtered through your current visibility, so a term you rank #90 for shows a
 * fraction of its real volume, and a term you have never appeared for shows
 * nothing at all. Absolute volume needs Google Ads Keyword Planner or a paid
 * tool; see docs. Treat impressions as "demand we can already see".
 */
import { query } from '../store/db.js';

/** Rough organic CTR by position. Used to spot ranking-fine-but-not-clicked. */
const EXPECTED_CTR: Record<number, number> = {
    1: 0.27, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.06,
    6: 0.05, 7: 0.04, 8: 0.033, 9: 0.03, 10: 0.025,
};
function expectedCtr(position: number): number {
    if (position <= 10) return EXPECTED_CTR[Math.max(1, Math.round(position))] ?? 0.025;
    if (position <= 20) return 0.01;
    return 0.003;
}

export type Opportunity =
    | 'striking_distance'
    | 'low_ctr'
    | 'rising'
    | 'falling'
    | 'cannibalised'
    | 'deep_potential';

export interface Candidate {
    query: string;
    opportunity: Opportunity;
    /** 0-100. Comparable only within a site. */
    score: number;
    impressions: number;
    clicks: number;
    position: number;
    /** Weighted position in the earlier half of the window, when available. */
    positionBefore: number | null;
    movement: number | null;
    /** Page Google currently associates with the query. */
    page: string | null;
    pagesCompeting: number;
    ctr: number;
    expectedCtr: number;
    /** Estimated extra monthly clicks if the fix lands. */
    clickUpside: number;
    reason: string;
}

interface Row {
    query: string;
    span_days: string | null;
    impressions: string;
    clicks: string;
    position: string;
    pos_before: string | null;
    pos_after: string | null;
    pages: string;
    top_page: string | null;
}

export interface MineOptions {
    siteUrl: string;
    days?: number;
    minImpressions?: number;
    limit?: number;
    /** Restrict to one opportunity class. */
    opportunity?: Opportunity;
}

/**
 * Mine candidates from the rank archive and classify each by the action it
 * implies. One row per query — the highest-value classification wins, so the
 * output is a worklist rather than a pile of overlapping observations.
 */
export async function mineCandidates(opts: MineOptions): Promise<Candidate[]> {
    const days = opts.days ?? 90;
    const minImpressions = opts.minImpressions ?? 10;

    const rows = await query<Row>(
        `WITH span AS (
           SELECT MIN(date) AS lo, MAX(date) AS hi
             FROM rank_daily WHERE site_url = $1 AND date >= CURRENT_DATE - $2::int
         ), mid AS (SELECT (lo + ((hi - lo) / 2))::date AS m FROM span)
         SELECT r.query,
                (SELECT (hi - lo) + 1 FROM span)                AS span_days,
                SUM(r.impressions)                              AS impressions,
                SUM(r.clicks)                                   AS clicks,
                CASE WHEN SUM(r.impressions) > 0
                     THEN SUM(r.position * r.impressions) / SUM(r.impressions) END AS position,
                CASE WHEN SUM(r.impressions) FILTER (WHERE r.date <  m.m) > 0
                     THEN SUM(r.position * r.impressions) FILTER (WHERE r.date <  m.m)
                        / SUM(r.impressions) FILTER (WHERE r.date <  m.m) END      AS pos_before,
                CASE WHEN SUM(r.impressions) FILTER (WHERE r.date >= m.m) > 0
                     THEN SUM(r.position * r.impressions) FILTER (WHERE r.date >= m.m)
                        / SUM(r.impressions) FILTER (WHERE r.date >= m.m) END      AS pos_after,
                COUNT(DISTINCT r.page) FILTER (WHERE r.page <> '' AND r.impressions > 0) AS pages,
                (ARRAY_AGG(r.page ORDER BY r.impressions DESC) FILTER (WHERE r.page <> ''))[1] AS top_page
           FROM rank_daily r, mid m
          WHERE r.site_url = $1 AND r.date >= CURRENT_DATE - $2::int
          GROUP BY r.query
         HAVING SUM(r.impressions) >= $3`,
        [opts.siteUrl, days, minImpressions]
    );

    // Normalise impressions to a monthly rate so upside figures are comparable.
    //
    // Scale by the days actually PRESENT, not the days requested. The archive is
    // younger than most windows people ask for, and using the requested window
    // silently understates every estimate (11 days of data asked for over 90
    // reports ~1/8th of the real rate) — which would distort the prioritisation
    // these numbers exist to drive.
    const spanDays = Math.max(1, Number(rows[0]?.span_days ?? days) || days);
    const monthScale = 30 / spanDays;

    const candidates = rows.map((r): Candidate => {
        const impressions = Number(r.impressions);
        const clicks = Number(r.clicks);
        const position = Number(r.position);
        const before = r.pos_before == null ? null : Number(r.pos_before);
        const after = r.pos_after == null ? null : Number(r.pos_after);
        const movement = before != null && after != null ? before - after : null;
        const pages = Number(r.pages);
        const ctr = impressions > 0 ? clicks / impressions : 0;
        const expected = expectedCtr(position);
        const monthlyImpressions = impressions * monthScale;

        let opportunity: Opportunity;
        let score: number;
        let clickUpside: number;
        let reason: string;

        if (pages > 1 && position > 5) {
            // Two of our own pages splitting authority for one query.
            opportunity = 'cannibalised';
            clickUpside = monthlyImpressions * (expectedCtr(Math.max(1, position - 5)) - ctr);
            score = Math.min(100, Math.log10(impressions + 1) * 22 + pages * 6);
            reason = `${pages} of your pages compete for this query (avg position ${position.toFixed(1)}); Google is splitting signals between them.`;
        } else if (position >= 11 && position <= 20) {
            // The classic quick win: page 2, one push from page 1.
            opportunity = 'striking_distance';
            clickUpside = monthlyImpressions * (expectedCtr(8) - ctr);
            score = Math.min(100, Math.log10(impressions + 1) * 26 + (20 - position) * 2.5);
            reason = `Position ${position.toFixed(1)} — page 2. Reaching the top 10 would be worth roughly ${Math.round(clickUpside)} clicks/month.`;
        } else if (position <= 10 && ctr < expected * 0.5 && impressions >= minImpressions * 2) {
            // Ranking is fine; the listing is not being clicked.
            opportunity = 'low_ctr';
            clickUpside = monthlyImpressions * (expected - ctr);
            score = Math.min(100, Math.log10(impressions + 1) * 24 + 20);
            reason = `Ranking ${position.toFixed(1)} but CTR is ${(ctr * 100).toFixed(1)}% vs ~${(expected * 100).toFixed(0)}% expected — a title/meta problem, not a ranking problem.`;
        } else if (movement != null && movement <= -5) {
            opportunity = 'falling';
            clickUpside = monthlyImpressions * (expectedCtr(after ?? position) - ctr);
            score = Math.min(100, Math.log10(impressions + 1) * 20 + Math.abs(movement) * 1.5);
            reason = `Dropped ${Math.abs(movement).toFixed(1)} positions (${before?.toFixed(1)} → ${after?.toFixed(1)}). Regressions are usually cheaper to reverse than new ground.`;
        } else if (movement != null && movement >= 5) {
            opportunity = 'rising';
            clickUpside = monthlyImpressions * (expectedCtr(Math.max(1, position - 10)) - ctr);
            score = Math.min(100, Math.log10(impressions + 1) * 20 + movement);
            reason = `Climbing ${movement.toFixed(1)} positions (${before?.toFixed(1)} → ${after?.toFixed(1)}) — momentum worth reinforcing.`;
        } else {
            opportunity = 'deep_potential';
            clickUpside = monthlyImpressions * (expectedCtr(8) - ctr);
            score = Math.min(100, Math.log10(impressions + 1) * 16 + Math.max(0, (60 - position) / 4));
            reason = `Position ${position.toFixed(1)} with ${Math.round(monthlyImpressions)} impressions/month — Google sees the relevance but ranks you far down. Needs real content work.`;
        }

        return {
            query: r.query,
            opportunity,
            score: Math.round(score),
            impressions,
            clicks,
            position: Number(position.toFixed(1)),
            positionBefore: before == null ? null : Number(before.toFixed(1)),
            movement: movement == null ? null : Number(movement.toFixed(1)),
            page: r.top_page,
            pagesCompeting: pages,
            ctr: Number(ctr.toFixed(4)),
            expectedCtr: expected,
            clickUpside: Math.max(0, Math.round(clickUpside)),
            reason,
        };
    });

    const filtered = opts.opportunity
        ? candidates.filter((c) => c.opportunity === opts.opportunity)
        : candidates;

    // Rank by score, then by the clicks actually on the table.
    return filtered
        .sort((a, b) => b.score - a.score || b.clickUpside - a.clickUpside)
        .slice(0, opts.limit ?? 50);
}

/** Days of history actually held for a site — context for any rate estimate. */
export async function archiveSpan(siteUrl: string): Promise<{ days: number; from: string | null; to: string | null }> {
    const [row] = await query<{ lo: string | null; hi: string | null; d: string | null }>(
        `SELECT MIN(date)::text AS lo, MAX(date)::text AS hi, (MAX(date) - MIN(date)) + 1 AS d
           FROM rank_daily WHERE site_url = $1`,
        [siteUrl]
    );
    return { days: Number(row?.d ?? 0), from: row?.lo ?? null, to: row?.hi ?? null };
}
