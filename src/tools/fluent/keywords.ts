import { mineCandidates, archiveSpan, type Opportunity } from '../../seo/candidates.js';

/**
 * keyword_candidates: mine the rank archive for keyword opportunities,
 * classified by the action each one implies.
 */
export async function keywordCandidatesHandler(args: {
    siteUrl: string;
    days?: number;
    minImpressions?: number;
    limit?: number;
    opportunity?: Opportunity;
    groupByOpportunity?: boolean;
}) {
    const [candidates, span] = await Promise.all([mineCandidates(args), archiveSpan(args.siteUrl)]);

    const body: Record<string, unknown> = {
        siteUrl: args.siteUrl,
        days: args.days ?? 90,
        // Surfaced because every rate estimate below is extrapolated from it;
        // a short archive means confident-looking numbers built on little data.
        archive: { daysHeld: span.days, from: span.from, to: span.to },
        found: candidates.length,
        // Stated explicitly so the number is never mistaken for search volume.
        note:
            'Impressions are demand filtered through current visibility, not total search volume. ' +
            'A term you rank ~90 for shows a fraction of its real demand, and terms you have never ' +
            'appeared for do not show at all.',
    };

    if (args.groupByOpportunity) {
        const grouped: Record<string, unknown[]> = {};
        for (const c of candidates) (grouped[c.opportunity] ??= []).push(c);
        body.byOpportunity = Object.fromEntries(
            Object.entries(grouped).map(([k, v]) => [
                k,
                { count: v.length, totalUpside: v.reduce((a, c: any) => a + c.clickUpside, 0), items: v },
            ])
        );
    } else {
        body.candidates = candidates;
    }

    body.totalClickUpside = candidates.reduce((a, c) => a + c.clickUpside, 0);

    return { content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }] };
}
