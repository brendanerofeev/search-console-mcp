import * as googleInspection from "../../google/tools/inspection.js";
import * as bingInspection from "../../bing/tools/inspection.js";
import * as pagespeed from "../../google/tools/pagespeed.js";
import { executeParallel } from "../../common/utils/parallel.js";

/**
 * inspection_inspect: Inspect indexing, canonical, and crawl status for single or batch URLs.
 */
export async function inspectionInspectHandler(args: {
  siteUrl: string;
  urls: string[];
  engine?: "google" | "bing" | "all";
}) {
  const engine = args.engine ?? "all";
  const urls = args.urls;

  const results = await executeParallel({
    google: (engine === "google" || engine === "all")
      ? () => (urls.length === 1 ? googleInspection.inspectUrl(args.siteUrl, urls[0]) : googleInspection.inspectBatch(args.siteUrl, urls))
      : null,
    bing: (engine === "bing" || engine === "all")
      ? async () => {
          const bingResults: any[] = [];
          for (const url of urls) {
            const info = await bingInspection.getUrlInfo(args.siteUrl, url);
            bingResults.push(info);
          }
          return urls.length === 1 ? bingResults[0] : bingResults;
        }
      : null,
  });

  return {
    content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
  };
}

/**
 * pagespeed_analyze: Run PageSpeed Insights and Core Web Vitals performance analysis.
 */
export async function pagespeedAnalyzeHandler(args: {
  url: string;
  strategy?: "mobile" | "desktop";
  category?: string[];
  cwvOnly?: boolean;
}) {
  if (args.cwvOnly) {
    const result = await pagespeed.getCoreWebVitals(args.url);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  }

  const result = await pagespeed.analyzePageSpeed(args.url, args.strategy);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
  };
}
