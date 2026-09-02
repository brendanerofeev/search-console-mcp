import { queryAnalytics } from './analytics.js';
import { detectGenAIQueries, GenAIDetectionResult } from '../../common/tools/genai-queries.js';

/**
 * Detect likely generative-AI / conversational "fanout" queries in Google
 * Search Console via the Search Analytics API's query level.
 *
 * Google does not expose its generative-AI surface via `searchanalytics.query`
 * (the dedicated Gen AI report is UI-only), so this is a heuristic detector
 * over the regular query-level performance data.
 *
 * @param siteUrl - GSC site property URL.
 * @param options - Lookback window and threshold options.
 * @returns A {@link GenAIDetectionResult} with matched queries and summary.
 */
export async function detectGenAIQueriesGoogle(
  siteUrl: string,
  options: { days?: number; minImpressions?: number; includePages?: boolean } = {}
): Promise<GenAIDetectionResult> {
  const { days = 28, minImpressions = 1, includePages = false } = options;

  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 3); // GSC data delay
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  const dimensions = includePages ? ['query', 'page'] : ['query'];

  const rows = await queryAnalytics({
    siteUrl,
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
    dimensions,
    limit: 10000,
  });

  const input = rows.map(row => {
    const withPages = {
      query: row.keys?.[0] ?? '',
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
      page: row.keys?.[1] ?? '',
    };
    return withPages;
  });

  // If we fetched query+page, roll pages up per query before detection but keep
  // the page list for enrichment.
  const byQuery = new Map<string, { impressions: number; clicks: number; posImpSum: number; pages: string[] }>();
  for (const row of input) {
    const existing = byQuery.get(row.query);
    if (existing) {
      existing.impressions += row.impressions;
      existing.clicks += row.clicks;
      existing.posImpSum += row.position * row.impressions;
      if (row.page) existing.pages.push(row.page);
    } else {
      byQuery.set(row.query, {
        impressions: row.impressions,
        clicks: row.clicks,
        posImpSum: row.position * row.impressions,
        pages: row.page ? [row.page] : [],
      });
    }
  }

  const aggregated = Array.from(byQuery.entries()).map(([query, v]) => ({
    query,
    impressions: v.impressions,
    clicks: v.clicks,
    ctr: v.impressions > 0 ? v.clicks / v.impressions : 0,
    position: v.impressions > 0 ? v.posImpSum / v.impressions : 0,
    pages: includePages ? v.pages : undefined,
  }));

  return detectGenAIQueries(aggregated, { minImpressions });
}
