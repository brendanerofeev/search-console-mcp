import * as googleHealth from "../../google/tools/sites-health.js";
import * as bingHealth from "../../bing/tools/sites-health.js";
import * as bingCrawl from "../../bing/tools/crawl.js";
import { compareEngines } from "../../common/tools/compare-engines/index.js";
import { getStartedHandler } from "../../common/tools/get-started.js";
import { executeParallel } from "../../common/utils/parallel.js";

/**
 * site_health_check: Comprehensive health audit across Google Search Console and Bing Webmaster Tools.
 */
export async function siteHealthCheckHandler(args: {
  siteUrl?: string;
  level?: "summary" | "full" | "crawl_issues";
  engine?: "google" | "bing" | "all";
}) {
  const level = args.level ?? "full";
  const engine = args.engine ?? "all";

  if (level === "crawl_issues" && args.siteUrl) {
    const results: Record<string, any> = {};
    results.bingCrawlIssues = await bingCrawl.getCrawlIssues(args.siteUrl);
    results.bingCrawlStats = await bingCrawl.getCrawlStats(args.siteUrl);
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
    };
  }

  const results = await executeParallel({
    google: (engine === "google" || engine === "all") ? () => googleHealth.healthCheck(args.siteUrl) : null,
    bing: (engine === "bing" || engine === "all") ? () => bingHealth.healthCheck(args.siteUrl) : null,
  });

  return {
    content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
  };
}

/**
 * compare_engines: Cross-engine comparison matrix analyzing Google Search Console vs Bing Webmaster Tools.
 */
export async function compareEnginesHandler(args: {
  siteUrl: string;
  startDate?: string;
  endDate?: string;
  dimension?: "query" | "page" | "country" | "device";
  limit?: number;
}) {
  const end = args.endDate ?? new Date().toISOString().split("T")[0];
  const start = args.startDate ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 28);
    return d.toISOString().split("T")[0];
  })();

  const result = await compareEngines({
    siteUrl: args.siteUrl,
    startDate: start,
    endDate: end,
    dimension: args.dimension ?? "query",
    limit: args.limit
  });

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
  };
}

/**
 * get_started: Interactive onboarding guide explaining capabilities and recommended tool choices.
 */
export async function getStartedHandlerWrapper() {
  return await getStartedHandler();
}
