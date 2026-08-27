/**
 * Search-volume tools.
 *
 * WHY these exist as tools at all: `src/dataforseo/volume.ts` has been
 * implemented and correct since the DataForSEO account was bought, but nothing
 * imported it — the same failure that left the backlink module unreachable
 * until 2026-08-20. `seo_keywords_research` advertises "search volume
 * estimates" in its description while only ever reading Search Console, so
 * asking this server for volume returned an empty array and looked like "no
 * demand" rather than "not wired up".
 *
 * That distinction matters more here than almost anywhere else in the server.
 * Search Console shows demand filtered through current visibility, and a term
 * the site has never ranked for is invisible in it (D-007). Without volume,
 * profile-derived keywords stay hypotheses that cannot be ranked against
 * measured terms, which is exactly the decision these tools exist to support.
 */
import { keywordVolumes, enrichCandidates } from '../../dataforseo/volume.js';

/**
 * keyword_volume: real Google Ads volume for a batch of terms.
 *
 * DataForSEO bills per CALL, not per keyword, up to 1,000 keywords. So the
 * response reports the cost and the per-keyword cost, to make the batching
 * incentive visible: looking up a shortlist of five costs the same as looking
 * up the whole candidate list.
 *
 * Null and zero are reported separately and never collapsed. Zero means Google
 * measured the term and nobody searches it, which is evidence against a
 * keyword. Null means Google returned no data, which is not evidence of
 * anything. Treating them alike turns "unknown" into "rejected".
 */
export async function keywordVolumeHandler(args: {
    keywords: string[];
    locationName?: string;
    languageName?: string;
}) {
    const { volumes, cost } = await keywordVolumes(args.keywords, {
        locationName: args.locationName,
        languageName: args.languageName,
    });

    const measured = volumes.filter((v) => typeof v.searchVolume === 'number');
    const withDemand = measured.filter((v) => (v.searchVolume ?? 0) > 0);
    const zero = measured.filter((v) => v.searchVolume === 0).map((v) => v.keyword);
    const noData = volumes.filter((v) => v.searchVolume === null).map((v) => v.keyword);

    // Highest volume first: the whole point of the call is picking what to chase.
    const ranked = [...volumes].sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1));

    const totalVolume = withDemand.reduce((sum, v) => sum + (v.searchVolume ?? 0), 0);

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                requested: args.keywords.length,
                returned: volumes.length,
                location: args.locationName ?? 'Australia',
                language: args.languageName ?? 'English',
                summary: {
                    withDemand: withDemand.length,
                    zeroVolume: zero.length,
                    noData: noData.length,
                    totalMonthlyVolume: totalVolume,
                },
                cost,
                note:
                    'Billed per call, not per keyword, up to 1,000 keywords. Zero volume is evidence ' +
                    'against a keyword; null is missing data and is not. Volume is Google Ads data ' +
                    'and is not the same thing as Search Console impressions (D-007).',
                keywords: ranked,
                zeroVolume: zero,
                noData,
            }, null, 2),
        }],
    };
}

/**
 * keyword_volume_enrich: attach volume to a site's stored candidates.
 *
 * The batch version above answers "how big is this term". This one answers
 * "rank everything we are already considering", writing search_volume back onto
 * keyword_candidate so keyword_report can order hypotheses against measured
 * terms instead of guessing which matters more.
 */
export async function keywordVolumeEnrichHandler(args: {
    siteUrl: string;
    locationName?: string;
    limit?: number;
}) {
    const result = await enrichCandidates(args.siteUrl, {
        locationName: args.locationName,
        limit: args.limit,
    });

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                siteUrl: args.siteUrl,
                ...result,
                note: result.enriched === 0
                    ? 'No candidates were missing volume, so nothing was requested and nothing was charged. ' +
                      'Run keyword_report first if there are no candidates stored yet.'
                    : 'zeroVolume lists terms Google measured at zero searches, capped at 40. Those are ' +
                      'evidence against a keyword, unlike terms that simply returned no data.',
            }, null, 2),
        }],
    };
}
