import { fetchSerp, isOwnResult } from '../../serp/client.js';
import { analyzePage } from '../../serp/page-analysis.js';
import { analyzeCompetitorGap } from '../../serp/competitors.js';
import { resolveSerpSettings } from '../../store/profiles.js';

/**
 * Rank is location-dependent, and these properties belong to different customers
 * in different markets, so SERP settings resolve from the site's profile unless
 * the caller overrides them explicitly.
 */
async function settingsFor(
    siteUrl: string | undefined,
    args: { location?: string; country?: string; language?: string; device?: 'desktop' | 'mobile' }
) {
    if (!siteUrl) {
        return {
            location: args.location,
            country: args.country ?? 'au',
            language: args.language ?? 'en',
            device: args.device ?? ('mobile' as const),
            profileFound: false,
        };
    }
    return resolveSerpSettings(siteUrl, args);
}

/**
 * serp_lookup: Live Google results for a query, flagging our own listings.
 */
export async function serpLookupHandler(args: {
    query: string;
    siteUrl?: string;
    location?: string;
    country?: string;
    language?: string;
    device?: 'desktop' | 'mobile';
    num?: number;
}) {
    const settings = await settingsFor(args.siteUrl, args);
    const serp = await fetchSerp({ ...args, ...settings });

    const organic = serp.organic.map((r) => ({
        position: r.position,
        title: r.title,
        link: r.link,
        snippet: r.snippet,
        ...(args.siteUrl ? { isYours: isOwnResult(r.link, args.siteUrl) } : {}),
    }));

    const yours = args.siteUrl ? organic.filter((r) => (r as any).isYours) : [];

    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(
                    {
                        query: serp.query,
                        location: settings.location ?? null,
                        country: settings.country,
                        device: settings.device,
                        profileFound: settings.profileFound,
                        yourPositions: yours.map((r) => ({ position: r.position, link: r.link })),
                        organic,
                        peopleAlsoAsk: serp.peopleAlsoAsk,
                        relatedSearches: serp.relatedSearches,
                        creditsUsed: serp.credits,
                    },
                    null,
                    2
                ),
            },
        ],
    };
}

/**
 * serp_competitor_gap: Why the pages above us rank above us, for one query.
 */
export async function serpCompetitorGapHandler(args: {
    siteUrl: string;
    query: string;
    location?: string;
    country?: string;
    language?: string;
    device?: 'desktop' | 'mobile';
    num?: number;
    compareTop?: number;
    skipPageAnalysis?: boolean;
}) {
    const settings = await settingsFor(args.siteUrl, args);
    const result = await analyzeCompetitorGap({ ...args, ...settings });
    return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ...result, profileFound: settings.profileFound }, null, 2) }],
    };
}

/**
 * page_analyze: On-page signals for any URL, ours or a competitor's. No API key needed.
 */
export async function pageAnalyzeHandler(args: { urls: string[]; keyword?: string }) {
    const results = [];
    for (const url of args.urls) {
        results.push(await analyzePage(url, args.keyword));
    }
    return {
        content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
    };
}
