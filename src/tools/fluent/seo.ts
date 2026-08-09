import * as googleSeoInsights from "../../google/tools/seo-insights.js";
import * as googleAnalytics from "../../google/tools/analytics.js";
import * as bingSeoInsights from "../../bing/tools/seo-insights.js";
import * as bingKeywords from "../../bing/tools/keywords.js";
import * as bingAnalytics from "../../bing/tools/analytics.js";
import { validateSchema } from "../../common/tools/schema-validator.js";
import { executeParallel } from "../../common/utils/parallel.js";

/**
 * seo_audit: Specialized SEO intelligence analysis (recommendations, quick wins, cannibalization, striking distance, lost queries, low CTR, brand vs nonbrand).
 */
export async function seoAuditHandler(args: {
  siteUrl: string;
  type: "recommendations" | "quick_wins" | "low_hanging_fruit" | "cannibalization" | "striking_distance" | "lost_queries" | "low_ctr" | "brand_vs_nonbrand";
  brandKeywords?: string[];
  brandRegex?: string;
  minImpressions?: number;
  engine?: "google" | "bing" | "all";
}) {
  const engine = args.engine ?? "all";
  const type = args.type;
  const brandRegexStr = args.brandRegex ?? (args.brandKeywords ? args.brandKeywords.join("|") : "brand");

  const executeGoogle = async () => {
    switch (type) {
      case "recommendations": return await googleSeoInsights.generateRecommendations(args.siteUrl);
      case "quick_wins": return await googleSeoInsights.findQuickWins(args.siteUrl);
      case "low_hanging_fruit": return await googleSeoInsights.findLowHangingFruit(args.siteUrl, { minImpressions: args.minImpressions });
      case "cannibalization": return await googleSeoInsights.detectCannibalization(args.siteUrl);
      case "striking_distance": return await googleSeoInsights.findStrikingDistance(args.siteUrl);
      case "lost_queries": return await googleSeoInsights.findLostQueries(args.siteUrl);
      case "low_ctr": return await googleSeoInsights.findLowCTROpportunities(args.siteUrl, { minImpressions: args.minImpressions });
      case "brand_vs_nonbrand": return await googleSeoInsights.analyzeBrandVsNonBrand(args.siteUrl, brandRegexStr);
      default: throw new Error(`Unsupported SEO audit type: ${type}`);
    }
  };

  const executeBing = async () => {
    switch (type) {
      case "recommendations": return await bingSeoInsights.generateRecommendations(args.siteUrl);
      case "quick_wins":
      case "low_hanging_fruit": return await bingSeoInsights.findLowHangingFruit(args.siteUrl, { minImpressions: args.minImpressions });
      case "cannibalization": return await bingSeoInsights.detectCannibalization(args.siteUrl);
      case "striking_distance": return await bingSeoInsights.findStrikingDistance(args.siteUrl);
      case "lost_queries": return await bingSeoInsights.findLostQueries(args.siteUrl);
      case "low_ctr": return await bingSeoInsights.findLowCTROpportunities(args.siteUrl, { minImpressions: args.minImpressions });
      case "brand_vs_nonbrand": return await bingSeoInsights.analyzeBrandVsNonBrand(args.siteUrl, brandRegexStr);
      default: throw new Error(`Unsupported SEO audit type for Bing: ${type}`);
    }
  };

  const results = await executeParallel({
    google: (engine === "google" || engine === "all") ? executeGoogle : null,
    bing: (engine === "bing" || engine === "all") ? executeBing : null,
  });

  return {
    content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
  };
}

/**
 * seo_keywords_research: Keyword performance stats, related query expansion, and search volume estimates.
 */
export async function seoKeywordsResearchHandler(args: {
  siteUrl?: string;
  keywords: string[] | string;
  country?: string;
  language?: string;
  type?: "stats" | "related" | "traffic";
  engine?: "google" | "bing" | "all";
}) {
  const type = args.type ?? "stats";
  const engine = args.engine ?? "google";
  const keywordsList = Array.isArray(args.keywords)
    ? args.keywords
    : (typeof args.keywords === 'string' && args.keywords.trim().length > 0 ? [args.keywords] : []);

  if (type === "traffic" && !args.siteUrl) {
    throw new Error("siteUrl is required for keyword traffic analysis");
  }

  const executeGoogle = async () => {
    if (!args.siteUrl) return { notice: "siteUrl is recommended for Google Search Console keyword queries" };
    if (keywordsList.length > 0) {
      const seedKeyword = keywordsList[0];
      const endDate = new Date();
      endDate.setDate(endDate.getDate() - 3);
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 28);
      const rows = await googleAnalytics.queryAnalytics({
        siteUrl: args.siteUrl,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        dimensions: ['query'],
        filters: [{ dimension: 'query', operator: 'contains', expression: seedKeyword }],
        limit: 50
      });
      return rows.map(r => ({
        query: r.keys?.[0] ?? '',
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        ctr: r.ctr ?? 0,
        position: r.position ?? 0
      }));
    }
    return await googleSeoInsights.findLowHangingFruit(args.siteUrl, { limit: 20 });
  };

  const executeBing = async () => {
    const seedKeyword = keywordsList[0] ?? "";
    if (type === "stats") {
      return await bingKeywords.getKeywordStats(seedKeyword, args.country, args.language);
    } else if (type === "related") {
      return await bingKeywords.getRelatedKeywords(seedKeyword, args.country, args.language);
    } else if (type === "traffic") {
      return await bingAnalytics.getRankAndTrafficStats(args.siteUrl!);
    }
  };

  const parallelTasks: Record<string, (() => Promise<any>) | null> = {
    google: (engine === "google" || engine === "all") ? executeGoogle : null,
    bing: (engine === "bing" || engine === "all") ? executeBing : null,
  };

  const res = await executeParallel(parallelTasks);

  return {
    content: [{ type: "text", text: JSON.stringify(res, null, 2) }]
  };
}

/**
 * schema_validate: Validate structured data (JSON-LD, Microdata, RDFa) for a given webpage URL.
 */
export async function schemaValidateHandler(args: { url: string }) {
  const result = await validateSchema(args.url, "url");
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
  };
}
