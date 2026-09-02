import * as googleGenAI from "../../google/tools/genai.js";
import * as bingGenAI from "../../bing/tools/genai.js";
import { executeParallel } from "../../common/utils/parallel.js";

/**
 * genai_query_insights: Detect likely generative-AI / AI-Mode / conversational
 * "fanout" queries across Google and Bing search-performance data.
 *
 * Neither Google nor Bing exposes generative-AI citation data via a public API
 * yet, so this surfaces heuristic matches on query phrasing from the regular
 * query-level performance data and is an undercount of true AI activity.
 */
export async function genaiQueryInsightsHandler(args: {
  siteUrl: string;
  days?: number;
  engine?: "google" | "bing" | "all";
  includePages?: boolean;
  minImpressions?: number;
}) {
  const engine = args.engine ?? "all";
  const days = args.days ?? 28;
  const includePages = args.includePages ?? false;
  const minImpressions = args.minImpressions ?? 1;

  const results = await executeParallel({
    google: (engine === "google" || engine === "all")
      ? () => googleGenAI.detectGenAIQueriesGoogle(args.siteUrl, { days, minImpressions, includePages })
      : null,
    bing: (engine === "bing" || engine === "all")
      ? () => bingGenAI.detectGenAIQueriesBing(args.siteUrl, { minImpressions, includePages })
      : null,
  });

  return {
    content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
  };
}
