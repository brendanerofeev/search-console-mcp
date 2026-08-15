/**
 * Real Google Ads search volume, without the Basic-access approval queue.
 *
 * This is the missing half of keyword selection. Search Console shows demand
 * filtered through current visibility, and the business profile supplies terms
 * we have never ranked for — but neither says how many people actually search
 * them. Until now that made profile-derived keywords hypotheses that could not
 * be ranked against measured ones.
 */
import { call } from './client.js';
import { query } from '../store/db.js';

export interface KeywordVolume {
    keyword: string;
    searchVolume: number | null;
    competition: string | null;
    /** Competition as 0-1, where Google provides it. */
    competitionIndex: number | null;
    lowBid: number | null;
    highBid: number | null;
    /** Last 12 months, oldest first — reveals seasonality. */
    monthly: Array<{ year: number; month: number; volume: number }>;
}

/**
 * Look up volume for a batch of keywords.
 *
 * DataForSEO accepts up to 1,000 keywords per call and bills per call, not per
 * keyword, so batching is the entire cost story: 1,000 keywords in one call
 * costs what 1 keyword costs.
 */
export async function keywordVolumes(
    keywords: string[],
    opts: { locationName?: string; languageName?: string } = {}
): Promise<{ volumes: KeywordVolume[]; cost: number }> {
    const unique = [...new Set(keywords.map((k) => k.toLowerCase().trim()).filter(Boolean))].slice(0, 1000);
    if (!unique.length) return { volumes: [], cost: 0 };

    const { result, cost } = await call<Array<Record<string, unknown>>>(
        '/keywords_data/google_ads/search_volume/live',
        {
            keywords: unique,
            location_name: opts.locationName ?? 'Australia',
            language_name: opts.languageName ?? 'English',
            search_partners: false,
        }
    );

    const volumes: KeywordVolume[] = (result ?? []).map((r) => ({
        keyword: String(r.keyword ?? ''),
        searchVolume: r.search_volume === null || r.search_volume === undefined ? null : Number(r.search_volume),
        competition: r.competition === null || r.competition === undefined ? null : String(r.competition),
        competitionIndex: r.competition_index === null || r.competition_index === undefined
            ? null : Number(r.competition_index),
        lowBid: r.low_top_of_page_bid === null || r.low_top_of_page_bid === undefined
            ? null : Number(r.low_top_of_page_bid),
        highBid: r.high_top_of_page_bid === null || r.high_top_of_page_bid === undefined
            ? null : Number(r.high_top_of_page_bid),
        monthly: Array.isArray(r.monthly_searches)
            ? (r.monthly_searches as Array<Record<string, number>>)
                .map((m) => ({ year: Number(m.year), month: Number(m.month), volume: Number(m.search_volume) }))
                .sort((a, b) => a.year - b.year || a.month - b.month)
            : [],
    }));

    return { volumes, cost };
}

/**
 * Attach volume to stored candidates so the report can rank hypotheses against
 * measured terms instead of guessing which matters more.
 */
export async function enrichCandidates(
    siteUrl: string,
    opts: { locationName?: string; limit?: number } = {}
): Promise<{ enriched: number; withVolume: number; cost: number; zeroVolume: string[] }> {
    const rows = await query<{ keyword: string }>(
        `SELECT DISTINCT keyword FROM keyword_candidate
          WHERE site_url = $1 AND (search_volume IS NULL)
          ORDER BY keyword LIMIT $2`,
        [siteUrl, opts.limit ?? 1000]
    );
    if (!rows.length) return { enriched: 0, withVolume: 0, cost: 0, zeroVolume: [] };

    const { volumes, cost } = await keywordVolumes(rows.map((r) => r.keyword), {
        locationName: opts.locationName,
    });

    let withVolume = 0;
    const zeroVolume: string[] = [];
    for (const v of volumes) {
        if (v.searchVolume && v.searchVolume > 0) withVolume++;
        // Zero and null are different: zero means Google measured it and nobody
        // searches; null means no data. Both are recorded, but only zero is
        // evidence against a keyword.
        else if (v.searchVolume === 0) zeroVolume.push(v.keyword);
        await query(
            `UPDATE keyword_candidate
                SET search_volume = $3, competition = $4, low_bid = $5, high_bid = $6
              WHERE site_url = $1 AND keyword = $2`,
            [siteUrl, v.keyword, v.searchVolume, v.competition, v.lowBid, v.highBid]
        );
    }

    return { enriched: volumes.length, withVolume, cost, zeroVolume: zeroVolume.slice(0, 40) };
}
