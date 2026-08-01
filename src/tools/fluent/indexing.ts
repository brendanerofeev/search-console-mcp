import * as googleIndexing from "../../google/tools/indexing.js";
import * as bingUrlSubmission from "../../bing/tools/url-submission.js";
import * as indexNow from "../../bing/tools/index-now.js";
import { executeParallel } from "../../common/utils/parallel.js";

/**
 * indexing_submit: Submit URL(s) for indexing via Google Indexing API, Bing URL submission, or IndexNow protocol.
 */
export async function indexingSubmitHandler(args: {
  siteUrl?: string;
  urls: string[];
  method?: "standard" | "index_now" | "remove";
  engine?: "google" | "bing" | "all";
  host?: string;
  key?: string;
  keyLocation?: string;
}) {
  const method = args.method ?? "standard";
  const engine = args.engine ?? "google";
  const urls = args.urls;

  if (method === "index_now") {
    const host = args.host ?? (urls[0] ? new URL(urls[0]).hostname : "");
    if (!host) {
      throw new Error("host is required for index_now submission");
    }
    const result = await indexNow.submitIndexNow({
      host,
      key: args.key ?? "",
      keyLocation: args.keyLocation,
      urlList: urls
    });
    return {
      content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }]
    };
  }

  if (method === "remove") {
    if (!args.siteUrl) throw new Error("siteUrl is required for remove operation");
    const results: any[] = [];
    for (const url of urls) {
      const res = await googleIndexing.publishNotification(args.siteUrl, url, "URL_DELETED");
      results.push(res);
    }
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
    };
  }

  // Standard submission across Google and/or Bing in parallel
  if (!args.siteUrl) throw new Error("siteUrl is required for standard URL submission");

  const results = await executeParallel({
    google: (engine === "google" || engine === "all")
      ? () => (urls.length === 1 ? googleIndexing.publishNotification(args.siteUrl!, urls[0], "URL_UPDATED") : googleIndexing.batchPublishNotifications(args.siteUrl!, urls, "URL_UPDATED"))
      : null,
    bing: (engine === "bing" || engine === "all")
      ? () => (urls.length === 1 ? bingUrlSubmission.submitUrl(args.siteUrl!, urls[0]) : bingUrlSubmission.submitUrlBatch(args.siteUrl!, urls))
      : null,
  });

  return {
    content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
  };
}

/**
 * indexing_status: Check notification status or daily submission quota.
 */
export async function indexingStatusHandler(args: {
  siteUrl: string;
  url?: string;
  type?: "status" | "quota";
  engine?: "google" | "bing" | "all";
}) {
  const type = args.type ?? "status";

  if (type === "quota") {
    const quota = await bingUrlSubmission.getUrlSubmissionQuota(args.siteUrl);
    return {
      content: [{ type: "text", text: JSON.stringify(quota, null, 2) }]
    };
  }

  if (!args.url) {
    throw new Error("url parameter is required when checking indexing status");
  }

  const result = await googleIndexing.getNotificationStatus(args.siteUrl, args.url);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
  };
}
