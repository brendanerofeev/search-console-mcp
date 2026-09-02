import { getQueryStats, getQueryPageStats } from './analytics.js';
import { detectGenAIQueries, GenAIDetectionResult } from '../../common/tools/genai-queries.js';

/**
 * Detect likely generative-AI / conversational "fanout" queries in Bing.
 *
 * Bing's AI Performance report (citations, grounding queries) is not yet
 * available via the public Webmaster API, so this is a heuristic detector over
 * the regular query-level performance data returned by `GetQueryStats`.
 *
 * @param siteUrl - Bing site URL.
 * @param options - Minimum impression threshold and whether to enrich with pages.
 * @returns A {@link GenAIDetectionResult} with matched queries and summary.
 */
export async function detectGenAIQueriesBing(
  siteUrl: string,
  options: { minImpressions?: number; includePages?: boolean } = {}
): Promise<GenAIDetectionResult> {
  const { minImpressions = 1, includePages = false } = options;

  const rows = await getQueryStats(siteUrl);

  const input = rows.map(r => ({
    query: r.Query,
    impressions: r.Impressions,
    clicks: r.Clicks,
    ctr: r.CTR ?? (r.Impressions > 0 ? r.Clicks / r.Impressions : 0),
    position: typeof r.AvgPosition === 'number' ? r.AvgPosition : undefined,
  }));

  let result = detectGenAIQueries(input, { minImpressions });

  // Enrich matched queries with the pages they map to (grounding-query style view).
  if (includePages && result.queries.length > 0) {
    const qp = await getQueryPageStats(siteUrl).catch(() => []);
    const pageByQuery = new Map<string, string[]>();
    for (const p of qp) {
      const list = pageByQuery.get(p.Query) || [];
      if (p.Page && !list.includes(p.Page)) list.push(p.Page);
      pageByQuery.set(p.Query, list);
    }
    result = {
      ...result,
      queries: result.queries.map(q => ({
        ...q,
        pages: pageByQuery.get(q.query) || [],
      })),
    };
  }

  return result;
}
