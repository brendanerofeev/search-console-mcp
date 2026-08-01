import * as googleAnalytics from "../../google/tools/analytics.js";
import * as bingAnalytics from "../../bing/tools/analytics.js";
import * as ga4Analytics from "../../ga4/tools/analytics.js";
import * as ga4Realtime from "../../ga4/tools/realtime.js";
import * as ga4Behavior from "../../ga4/tools/behavior.js";
import { executeParallel } from "../../common/utils/parallel.js";

/**
 * analytics_query: Unified search performance query replacing single-dimension query tools.
 */
export async function analyticsQueryHandler(args: {
  siteUrl: string;
  startDate?: string;
  endDate?: string;
  dimensions?: string[];
  filters?: any[];
  rowLimit?: number;
  engine?: "google" | "bing" | "all";
}) {
  const engine = args.engine ?? "all";
  const queryParams: any = {
    siteUrl: args.siteUrl,
    startDate: args.startDate,
    endDate: args.endDate,
    dimensions: args.dimensions,
    filters: args.filters,
    rowLimit: args.rowLimit
  };

  const results = await executeParallel({
    google: (engine === "google" || engine === "all") ? () => googleAnalytics.queryAnalytics(queryParams) : null,
    bing: (engine === "bing" || engine === "all") ? () => bingAnalytics.getQueryStats(args.siteUrl) : null,
  });

  return {
    content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
  };
}

/**
 * analytics_compare: Period-over-period comparison, performance trends, and traffic drop attribution.
 */
export async function analyticsCompareHandler(args: {
  siteUrl: string;
  mode?: "period_over_period" | "trends" | "drop_attribution";
  startDate?: string;
  endDate?: string;
  compareStartDate?: string;
  compareEndDate?: string;
  engine?: "google" | "bing" | "all";
}) {
  const mode = args.mode ?? "period_over_period";
  const engine = args.engine ?? "all";

  let results: Record<string, any> = {};

  if (mode === "period_over_period") {
    results = await executeParallel({
      google: (engine === "google" || engine === "all")
        ? () => googleAnalytics.comparePeriods(args.siteUrl, args.startDate ?? "", args.endDate ?? "", args.compareStartDate ?? "", args.compareEndDate ?? "")
        : null,
      bing: (engine === "bing" || engine === "all")
        ? () => bingAnalytics.comparePeriods(args.siteUrl, args.startDate ?? "", args.endDate ?? "", args.compareStartDate ?? "", args.compareEndDate ?? "")
        : null,
    });
  } else if (mode === "trends" || mode === "drop_attribution") {
    results = await executeParallel({
      google: (engine === "google" || engine === "all") ? () => googleAnalytics.detectTrends(args.siteUrl) : null,
      bing: (engine === "bing" || engine === "all") ? () => bingAnalytics.detectTrends(args.siteUrl) : null,
    });
  }

  return {
    content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
  };
}

/**
 * analytics_anomalies: Detect search traffic anomalies across Google and Bing.
 */
export async function analyticsAnomaliesHandler(args: {
  siteUrl: string;
  startDate?: string;
  endDate?: string;
  threshold?: number;
  engine?: "google" | "bing" | "all";
}) {
  const engine = args.engine ?? "all";
  const results = await executeParallel({
    google: (engine === "google" || engine === "all") ? () => googleAnalytics.detectAnomalies(args.siteUrl, { threshold: args.threshold }) : null,
    bing: (engine === "bing" || engine === "all") ? () => bingAnalytics.detectAnomalies(args.siteUrl, { threshold: args.threshold }) : null,
  });

  return {
    content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
  };
}

/**
 * analytics_advanced: Google Analytics 4 (GA4) e-commerce, realtime metrics, user behavior, and conversion funnels.
 */
export async function analyticsAdvancedHandler(args: {
  propertyId: string;
  metricType: "ecommerce" | "realtime" | "user_behavior" | "audience_segments" | "conversion_funnel";
  startDate?: string;
  endDate?: string;
}) {
  let res: any;
  const start = args.startDate ?? "";
  const end = args.endDate ?? "";

  switch (args.metricType) {
    case "ecommerce":
      res = await ga4Analytics.getEcommerce(args.propertyId, start, end);
      break;
    case "realtime":
      res = await ga4Realtime.getRealtimeData(args.propertyId);
      break;
    case "user_behavior":
      res = await ga4Behavior.getUserBehavior(args.propertyId, start, end);
      break;
    case "audience_segments":
      res = await ga4Behavior.getAudienceSegments(args.propertyId, start, end);
      break;
    case "conversion_funnel":
      res = await ga4Behavior.getConversionFunnel(args.propertyId, start, end);
      break;
    default:
      throw new Error(`Unsupported metricType: ${args.metricType}`);
  }

  return {
    content: [{ type: "text", text: JSON.stringify(res, null, 2) }]
  };
}
