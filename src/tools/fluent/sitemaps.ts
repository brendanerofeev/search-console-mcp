import * as googleSitemaps from "../../google/tools/sitemaps.js";
import * as bingSitemaps from "../../bing/tools/sitemaps.js";
import { executeParallel } from "../../common/utils/parallel.js";

export async function sitemapsListHandler(args: { siteUrl: string; feedUrl?: string; engine?: "google" | "bing" | "all" }) {
  const engine = args.engine ?? "all";
  const results = await executeParallel({
    google: (engine === "google" || engine === "all")
      ? () => args.feedUrl ? googleSitemaps.getSitemap(args.siteUrl, args.feedUrl) : googleSitemaps.listSitemaps(args.siteUrl)
      : null,
    bing: (engine === "bing" || engine === "all")
      ? () => bingSitemaps.listSitemaps(args.siteUrl)
      : null,
  });

  return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
}

export async function sitemapsSubmitHandler(args: { siteUrl: string; feedUrl: string; engine?: "google" | "bing" | "all" }) {
  const engine = args.engine ?? "all";
  const results = await executeParallel({
    google: (engine === "google" || engine === "all")
      ? () => googleSitemaps.submitSitemap(args.siteUrl, args.feedUrl)
      : null,
    bing: (engine === "bing" || engine === "all")
      ? () => bingSitemaps.submitSitemap(args.siteUrl, args.feedUrl)
      : null,
  });

  return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
}

export async function sitemapsDeleteHandler(args: { siteUrl: string; feedUrl: string; engine?: "google" | "bing" | "all" }) {
  const engine = args.engine ?? "all";
  const results = await executeParallel({
    google: (engine === "google" || engine === "all")
      ? () => googleSitemaps.deleteSitemap(args.siteUrl, args.feedUrl)
      : null,
    bing: (engine === "bing" || engine === "all")
      ? () => bingSitemaps.deleteSitemap(args.siteUrl, args.feedUrl)
      : null,
  });

  return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
}
