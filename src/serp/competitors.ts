/**
 * Competitive gap analysis: joins the live SERP (who outranks us) with on-page
 * signals (what their page does that ours doesn't) and Search Console (what
 * Google already associates with our site for the term).
 */
import { fetchSerp, isOwnResult, type OrganicResult, type SerpOptions } from './client.js';
import { analyzePage, type PageSignals } from './page-analysis.js';
import { queryAnalytics } from '../google/tools/analytics.js';
import { limitConcurrency } from '../common/concurrency.js';

export interface CompetitorGapOptions extends SerpOptions {
    /** Our Search Console property, e.g. 'sc-domain:example.com'. */
    siteUrl: string;
    /** How many results above us to analyse on-page. Default 3. */
    compareTop?: number;
    /** Skip the on-page fetches and return SERP positions only. */
    skipPageAnalysis?: boolean;
}

export interface CompetitorGapResult {
    query: string;
    location?: string;
    device: string;
    /** Our position in the live SERP, or null if absent from the fetched depth. */
    ourPosition: number | null;
    ourUrl?: string;
    /** What GSC reports for this query — average position over the last 28 days. */
    searchConsole?: { position: number; clicks: number; impressions: number; page?: string } | null;
    /** Organic results ranked above us. */
    competitorsAbove: OrganicResult[];
    /** On-page signals, ours first when known. */
    pageSignals: PageSignals[];
    /** Plain-language differences between our page and the ones above it. */
    gaps: string[];
    creditsUsed?: number;
    notes: string[];
}

/** Median of a numeric list; 0 for an empty list. */
function median(values: number[]): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Compare our ranking page against those outranking it for a single query.
 */
export async function analyzeCompetitorGap(
    options: CompetitorGapOptions
): Promise<CompetitorGapResult> {
    const notes: string[] = [];
    const serp = await fetchSerp(options);

    const ourResult = serp.organic.find((r) => isOwnResult(r.link, options.siteUrl));
    const ourPosition = ourResult?.position ?? null;
    const competitorsAbove = ourPosition
        ? serp.organic.filter((r) => r.position < ourPosition && !isOwnResult(r.link, options.siteUrl))
        : serp.organic.filter((r) => !isOwnResult(r.link, options.siteUrl));

    // Search Console knows which of our pages Google actually associates with the
    // term, which matters when we are absent from the fetched SERP depth.
    let searchConsole: CompetitorGapResult['searchConsole'] = null;
    try {
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - 28);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        const rows = await queryAnalytics({
            siteUrl: options.siteUrl,
            startDate: fmt(start),
            endDate: fmt(end),
            dimensions: ['query', 'page'],
            // Filter server-side; pulling every row to find one query is wasteful
            // and hits the 25k row cap on larger properties.
            filters: [{ dimension: 'query', operator: 'equals', expression: options.query }],
            limit: 10,
        });
        const match = rows[0];
        if (match) {
            searchConsole = {
                position: Number(match.position ?? 0),
                clicks: Number(match.clicks ?? 0),
                impressions: Number(match.impressions ?? 0),
                page: match.keys?.[1],
            };
        } else {
            notes.push(
                'Search Console reports no impressions for this exact query in the last 28 days — ' +
                'Google may not associate any of your pages with it yet.'
            );
        }
    } catch (e) {
        notes.push(`Search Console lookup failed: ${(e as Error).message}`);
    }

    const ourPageUrl = ourResult?.link ?? searchConsole?.page;
    if (!ourPosition) {
        notes.push(
            `Your site does not appear in the top ${serp.organic.length} results fetched` +
            (searchConsole ? `; Search Console reports average position ${searchConsole.position.toFixed(1)}.` : '.')
        );
    }

    const result: CompetitorGapResult = {
        query: options.query,
        location: options.location ?? process.env.SERPER_DEFAULT_LOCATION,
        device: options.device ?? 'mobile',
        ourPosition,
        ourUrl: ourPageUrl,
        searchConsole,
        competitorsAbove,
        pageSignals: [],
        gaps: [],
        creditsUsed: serp.credits,
        notes,
    };

    if (options.skipPageAnalysis) return result;

    const targets = competitorsAbove.slice(0, options.compareTop ?? 3).map((c) => c.link);
    const urls = ourPageUrl ? [ourPageUrl, ...targets] : targets;
    result.pageSignals = await limitConcurrency(urls, 4, (url) => analyzePage(url, options.query));

    const ours = ourPageUrl ? result.pageSignals.find((p) => p.url === ourPageUrl) : undefined;
    const theirs = result.pageSignals.filter((p) => p.url !== ourPageUrl && p.status === 200);
    if (ours && ours.status === 200 && theirs.length) {
        result.gaps = buildGaps(ours, theirs, options.query);
    } else if (!ours) {
        result.gaps.push('No page of ours ranks for this term, so there is nothing to compare — this is a content gap, not a ranking gap.');
    }

    return result;
}

/** Turn raw signal differences into specific, actionable statements. */
function buildGaps(ours: PageSignals, theirs: PageSignals[], keyword: string): string[] {
    const gaps: string[] = [];

    const theirWords = median(theirs.map((p) => p.wordCount));
    if (theirWords > 0 && ours.wordCount < theirWords * 0.6) {
        gaps.push(
            `Thin content: your page has ${ours.wordCount} words vs a median of ${theirWords} above you (${Math.round((ours.wordCount / theirWords) * 100)}%).`
        );
    }

    if (ours.keywordInTitle === false) {
        const theirsWithKw = theirs.filter((p) => p.keywordInTitle).length;
        if (theirsWithKw) gaps.push(`"${keyword}" is absent from your <title>; ${theirsWithKw}/${theirs.length} pages above you have it.`);
    }
    if (ours.keywordInH1 === false) {
        const theirsWithKw = theirs.filter((p) => p.keywordInH1).length;
        if (theirsWithKw) gaps.push(`"${keyword}" is absent from your H1; ${theirsWithKw}/${theirs.length} pages above you have it.`);
    }
    if (!ours.h1.length) gaps.push('Your page has no H1 at all.');
    else if (ours.h1.length > 1) gaps.push(`Your page has ${ours.h1.length} H1 tags; use one.`);

    const theirH2 = median(theirs.map((p) => p.h2.length));
    if (theirH2 >= 4 && ours.h2.length < theirH2 * 0.5) {
        gaps.push(`Shallow structure: ${ours.h2.length} H2 sections vs a median of ${theirH2} above you.`);
    }

    if (!ours.metaDescription) gaps.push('No meta description — you are ceding snippet control to Google.');
    else if ((ours.metaDescriptionLength ?? 0) > 160) gaps.push(`Meta description is ${ours.metaDescriptionLength} chars and will be truncated (~160).`);

    if ((ours.titleLength ?? 0) > 60) gaps.push(`Title is ${ours.titleLength} chars and will be truncated in results (~60).`);

    const theirSchema = new Set(theirs.flatMap((p) => p.schemaTypes));
    const ourSchema = new Set(ours.schemaTypes);
    const missingSchema = [...theirSchema].filter((t) => !ourSchema.has(t));
    if (!ours.schemaTypes.length && theirSchema.size) {
        gaps.push(`No structured data; pages above you use: ${[...theirSchema].join(', ')}.`);
    } else if (missingSchema.length) {
        gaps.push(`Missing structured data used above you: ${missingSchema.join(', ')}.`);
    }

    const faqAbove = theirs.filter((p) => p.hasFaqSchema).length;
    if (faqAbove >= 2 && !ours.hasFaqSchema) {
        gaps.push(`${faqAbove}/${theirs.length} pages above you use FAQ schema; you do not.`);
    }

    const theirInternal = median(theirs.map((p) => p.internalLinks));
    if (theirInternal > 0 && ours.internalLinks < theirInternal * 0.5) {
        gaps.push(`Weak internal linking: ${ours.internalLinks} internal links vs a median of ${theirInternal} above you.`);
    }

    if (ours.imagesMissingAlt > 0) {
        gaps.push(`${ours.imagesMissingAlt} of ${ours.images} images have no alt text.`);
    }

    const theirKw = median(theirs.map((p) => p.keywordCount ?? 0));
    // Only a gap if the pages beating us actually use the phrase. When their
    // median is 0 too, exact-phrase usage plainly is not what is ranking them,
    // and reporting it would send us optimising for a non-signal.
    if ((ours.keywordCount ?? 0) === 0 && theirKw > 0) {
        gaps.push(`"${keyword}" never appears in your page body; pages above you use it a median of ${theirKw} times.`);
    } else if ((ours.keywordCount ?? 0) === 0 && theirKw === 0) {
        gaps.push(`Neither you nor the pages above you use "${keyword}" verbatim — exact-phrase usage is not the differentiator here; topical depth is.`);
    }

    if (!gaps.length) {
        gaps.push('No obvious on-page deficits — the gap is more likely authority, links, or intent mismatch than page content.');
    }
    return gaps;
}
