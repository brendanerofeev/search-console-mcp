/**
 * Off-page tools.
 *
 * WHY these exist as tools at all: `src/dataforseo/backlinks.ts` has been
 * implemented and correct since the DataForSEO account was bought, but nothing
 * imported it. It was unreachable through the MCP surface and through the CLI
 * (which only dispatches registered tools), so the only way anyone ever got
 * numbers out of it was running the module by hand. That is not reproducible,
 * and it meant `seo_audit` kept reporting "we currently have no off-page data
 * at all" while the capability sat there paid for.
 */
import { backlinkReport, linkGap, linkProspects } from '../../dataforseo/backlinks.js';
import { getProfile } from '../../store/profiles.js';

/**
 * backlink_report: a site's link profile next to its recorded competitors.
 *
 * Snapshots into `backlink_daily` on every call, because link building is slow
 * and one reading answers nothing. The useful question is always "better than
 * last month?" and "closing on them or not?".
 */
export async function backlinkReportHandler(args: {
    siteUrl: string;
    competitors?: string[];
}) {
    const result = await backlinkReport(args.siteUrl, args.competitors ?? []);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

/**
 * link_gap: domains linking to competitors but not to us.
 *
 * Competitors fall back to the site profile so the comparison set is a recorded
 * decision rather than whatever happened to be in a SERP that day. If neither
 * the argument nor the profile supplies any, say so plainly instead of
 * returning an empty list that reads like "no opportunities".
 */
export async function linkGapHandler(args: {
    siteUrl: string;
    competitors?: string[];
    limit?: number;
}) {
    let competitors = args.competitors ?? [];
    if (!competitors.length) {
        const profile = await getProfile(args.siteUrl);
        competitors = profile?.competitors ?? [];
    }

    if (!competitors.length) {
        return {
            content: [{
                type: 'text' as const,
                text: JSON.stringify({
                    siteUrl: args.siteUrl,
                    total: 0,
                    domains: [],
                    note:
                        'No competitors supplied and none recorded on the site profile. A link gap is ' +
                        'meaningless without a comparison set, so nothing was requested from DataForSEO ' +
                        'and nothing was charged. Record competitors with site_profile, or pass them ' +
                        'explicitly.',
                }, null, 2),
            }],
        };
    }

    const result = await linkGap(args.siteUrl, competitors, args.limit ?? 40);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

/**
 * link_prospects: domains linking to ANY competitor but not to us.
 *
 * The companion to link_gap, and usually the more useful of the two.
 * `domain_intersection` (link_gap) demands a domain link to EVERY competitor,
 * so a niche with no shared ecosystem returns nothing, which reads as "no
 * opportunities" when it actually means "wrong question". Most real prospects
 * link to one or two competitors.
 */
export async function linkProspectsHandler(args: {
    siteUrl: string;
    competitors?: string[];
    perCompetitor?: number;
    limit?: number;
    maxSpamScore?: number;
}) {
    let competitors = args.competitors ?? [];
    if (!competitors.length) {
        const profile = await getProfile(args.siteUrl);
        competitors = profile?.competitors ?? [];
    }

    if (!competitors.length) {
        return {
            content: [{
                type: 'text' as const,
                text: JSON.stringify({
                    siteUrl: args.siteUrl,
                    prospects: [],
                    note:
                        'No competitors supplied and none recorded on the site profile. Nothing was ' +
                        'requested from DataForSEO and nothing was charged. Record competitors with ' +
                        'site_profile, or pass them explicitly.',
                }, null, 2),
            }],
        };
    }

    const result = await linkProspects(args.siteUrl, competitors, {
        perCompetitor: args.perCompetitor,
        limit: args.limit,
        maxSpamScore: args.maxSpamScore,
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
