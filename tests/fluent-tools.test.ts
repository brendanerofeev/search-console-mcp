import { describe, it, expect, vi } from "vitest";

// Mock submodules before importing handlers
vi.mock("../src/google/tools/sites.js", () => ({
  listSites: vi.fn().mockResolvedValue([{ siteUrl: "https://example.com/" }]),
  addSite: vi.fn().mockResolvedValue({ success: true }),
  deleteSite: vi.fn().mockResolvedValue({ success: true })
}));

vi.mock("../src/bing/tools/sites.js", () => ({
  listSites: vi.fn().mockResolvedValue([{ siteUrl: "https://example.com/" }]),
  addSite: vi.fn().mockResolvedValue({ success: true }),
  removeSite: vi.fn().mockResolvedValue({ success: true })
}));

vi.mock("../src/google/tools/sitemaps.js", () => ({
  listSitemaps: vi.fn().mockResolvedValue([{ path: "https://example.com/sitemap.xml" }]),
  getSitemap: vi.fn().mockResolvedValue({ path: "https://example.com/sitemap.xml" }),
  submitSitemap: vi.fn().mockResolvedValue({ success: true }),
  deleteSitemap: vi.fn().mockResolvedValue({ success: true })
}));

vi.mock("../src/bing/tools/sitemaps.js", () => ({
  listSitemaps: vi.fn().mockResolvedValue([{ path: "https://example.com/sitemap.xml" }]),
  submitSitemap: vi.fn().mockResolvedValue({ success: true }),
  deleteSitemap: vi.fn().mockResolvedValue({ success: true })
}));

vi.mock("../src/google/tools/analytics.js", () => ({
  queryAnalytics: vi.fn().mockResolvedValue([{ clicks: 10, impressions: 100 }]),
  comparePeriods: vi.fn().mockResolvedValue({ diff: 5 }),
  detectTrends: vi.fn().mockResolvedValue([{ query: "test", trend: "up" }]),
  detectAnomalies: vi.fn().mockResolvedValue([{ date: "2026-01-01", value: 100 }])
}));

vi.mock("../src/bing/tools/analytics.js", () => ({
  getQueryStats: vi.fn().mockResolvedValue([{ query: "test", clicks: 5 }]),
  comparePeriods: vi.fn().mockResolvedValue({ diff: 2 }),
  detectTrends: vi.fn().mockResolvedValue([{ query: "test", trend: "up" }]),
  detectAnomalies: vi.fn().mockResolvedValue([{ date: "2026-01-01", value: 50 }]),
  getRankAndTrafficStats: vi.fn().mockResolvedValue([{ rank: 1, traffic: 100 }])
}));

vi.mock("../src/ga4/tools/analytics.js", () => ({
  getEcommerce: vi.fn().mockResolvedValue({ revenue: 1000 })
}));

vi.mock("../src/ga4/tools/realtime.js", () => ({
  getRealtimeData: vi.fn().mockResolvedValue({ activeUsers: 42 })
}));

vi.mock("../src/ga4/tools/behavior.js", () => ({
  getUserBehavior: vi.fn().mockResolvedValue({ engagement: 0.8 }),
  getAudienceSegments: vi.fn().mockResolvedValue([{ segment: "mobile" }]),
  getConversionFunnel: vi.fn().mockResolvedValue({ steps: 3 })
}));

vi.mock("../src/google/tools/inspection.js", () => ({
  inspectUrl: vi.fn().mockResolvedValue({ verdict: "PASS" }),
  inspectBatch: vi.fn().mockResolvedValue([{ verdict: "PASS" }, { verdict: "PASS" }])
}));

vi.mock("../src/bing/tools/inspection.js", () => ({
  getUrlInfo: vi.fn().mockResolvedValue({ url: "https://example.com/page", indexed: true })
}));

vi.mock("../src/google/tools/pagespeed.js", () => ({
  getCoreWebVitals: vi.fn().mockResolvedValue({ lcp: 1.2, cls: 0.01 }),
  analyzePageSpeed: vi.fn().mockResolvedValue({ score: 95 })
}));

vi.mock("../src/google/tools/indexing.js", () => ({
  publishNotification: vi.fn().mockResolvedValue({ status: "UPDATED" }),
  batchPublishNotifications: vi.fn().mockResolvedValue([{ status: "UPDATED" }]),
  getNotificationStatus: vi.fn().mockResolvedValue({ notifyTime: "2026-01-01" })
}));

vi.mock("../src/bing/tools/url-submission.js", () => ({
  submitUrl: vi.fn().mockResolvedValue({ success: true }),
  submitUrlBatch: vi.fn().mockResolvedValue({ success: true }),
  getUrlSubmissionQuota: vi.fn().mockResolvedValue({ dailyQuota: 10000, remainingQuota: 9900 })
}));

vi.mock("../src/bing/tools/index-now.js", () => ({
  submitIndexNow: vi.fn().mockResolvedValue("Successfully submitted 1 URLs to IndexNow for host example.com")
}));

vi.mock("../src/google/tools/seo-insights.js", () => ({
  generateRecommendations: vi.fn().mockResolvedValue([{ rec: "optimize title" }]),
  findQuickWins: vi.fn().mockResolvedValue([{ query: "win" }]),
  findLowHangingFruit: vi.fn().mockResolvedValue([{ query: "fruit" }]),
  detectCannibalization: vi.fn().mockResolvedValue([{ query: "cannibal" }]),
  findStrikingDistance: vi.fn().mockResolvedValue([{ query: "striking" }]),
  findLostQueries: vi.fn().mockResolvedValue([{ query: "lost" }]),
  findLowCTROpportunities: vi.fn().mockResolvedValue([{ query: "low ctr" }]),
  analyzeBrandVsNonBrand: vi.fn().mockResolvedValue({ brandShare: 0.4 })
}));

vi.mock("../src/bing/tools/seo-insights.js", () => ({
  generateRecommendations: vi.fn().mockResolvedValue([{ rec: "optimize title" }]),
  findLowHangingFruit: vi.fn().mockResolvedValue([{ query: "fruit" }]),
  detectCannibalization: vi.fn().mockResolvedValue([{ query: "cannibal" }]),
  findStrikingDistance: vi.fn().mockResolvedValue([{ query: "striking" }]),
  findLostQueries: vi.fn().mockResolvedValue([{ query: "lost" }]),
  findLowCTROpportunities: vi.fn().mockResolvedValue([{ query: "low ctr" }]),
  analyzeBrandVsNonBrand: vi.fn().mockResolvedValue({ brandShare: 0.4 })
}));

vi.mock("../src/bing/tools/keywords.js", () => ({
  getKeywordStats: vi.fn().mockResolvedValue([{ keyword: "seo", volume: 1000 }]),
  getRelatedKeywords: vi.fn().mockResolvedValue([{ keyword: "seo tools", volume: 500 }])
}));

vi.mock("../src/google/tools/sites-health.js", () => ({
  healthCheck: vi.fn().mockResolvedValue({ status: "healthy" })
}));

vi.mock("../src/bing/tools/sites-health.js", () => ({
  healthCheck: vi.fn().mockResolvedValue({ status: "healthy" })
}));

vi.mock("../src/bing/tools/crawl.js", () => ({
  getCrawlIssues: vi.fn().mockResolvedValue([{ issue: "404" }]),
  getCrawlStats: vi.fn().mockResolvedValue({ crawledPages: 100 })
}));

vi.mock("../src/common/tools/compare-engines/index.js", () => ({
  compareEngines: vi.fn().mockResolvedValue({ summary: { total_keys: 10 } })
}));

vi.mock("../src/common/tools/schema-validator.js", () => ({
  validateSchema: vi.fn().mockResolvedValue({ valid: true, errors: [] })
}));

vi.mock("../src/common/auth/config.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    accounts: {
      acc1: { id: "acc1", alias: "main", engine: "google", websites: ["https://example.com/"] }
    }
  }),
  updateAccount: vi.fn().mockResolvedValue(undefined),
  removeAccount: vi.fn().mockResolvedValue(undefined)
}));

import { sitesListHandler, sitesManageHandler, accountsManageHandler } from "../src/tools/fluent/sites.js";
import { sitemapsListHandler, sitemapsSubmitHandler, sitemapsDeleteHandler } from "../src/tools/fluent/sitemaps.js";
import { analyticsQueryHandler, analyticsCompareHandler, analyticsAnomaliesHandler, analyticsAdvancedHandler } from "../src/tools/fluent/analytics.js";
import { inspectionInspectHandler, pagespeedAnalyzeHandler } from "../src/tools/fluent/inspection.js";
import { indexingSubmitHandler, indexingStatusHandler } from "../src/tools/fluent/indexing.js";
import { seoAuditHandler, seoKeywordsResearchHandler, schemaValidateHandler } from "../src/tools/fluent/seo.js";
import { siteHealthCheckHandler, compareEnginesHandler, getStartedHandlerWrapper } from "../src/tools/fluent/health.js";
import { executeLegacyFallback, legacyFallbackMap } from "../src/legacy/fallback-router.js";

describe("Fluent Tools 100% Coverage Suite", () => {
  it("sites.ts: list, manage (add/delete), accounts (list/add_site/remove)", async () => {
    await sitesListHandler({ engine: "all" });
    await sitesListHandler({ engine: "google" });
    await sitesListHandler({ engine: "bing" });

    await sitesManageHandler({ action: "add", siteUrl: "https://example.com/", engine: "all" });
    await sitesManageHandler({ action: "delete", siteUrl: "https://example.com/", engine: "all" });

    await accountsManageHandler({ action: "list" });
    await accountsManageHandler({ action: "add_site", accountId: "acc1", siteUrl: "https://new.com/" });
    await accountsManageHandler({ action: "remove", accountId: "acc1" });

    await expect(accountsManageHandler({ action: "add_site" })).rejects.toThrow();
    await expect(accountsManageHandler({ action: "remove" })).rejects.toThrow();
    await expect(accountsManageHandler({ action: "invalid" as any })).rejects.toThrow();

    const notFoundRes = await accountsManageHandler({ action: "add_site", accountId: "nonexistent", siteUrl: "https://new.com/" });
    expect(notFoundRes.isError).toBe(true);
  });

  it("sitemaps.ts: list, submit, delete with feedUrl & default engines", async () => {
    await sitemapsListHandler({ siteUrl: "https://example.com/" });
    await sitemapsListHandler({ siteUrl: "https://example.com/", feedUrl: "https://example.com/sitemap.xml", engine: "google" });

    await sitemapsSubmitHandler({ siteUrl: "https://example.com/", feedUrl: "https://example.com/sitemap.xml" });
    await sitemapsDeleteHandler({ siteUrl: "https://example.com/", feedUrl: "https://example.com/sitemap.xml" });
  });

  it("analytics.ts: query, compare (pop, trends, drop_attribution), anomalies, advanced GA4", async () => {
    await analyticsQueryHandler({ siteUrl: "https://example.com/", engine: "all" });
    await analyticsCompareHandler({ siteUrl: "https://example.com/", mode: "period_over_period" });
    await analyticsCompareHandler({ siteUrl: "https://example.com/", mode: "trends" });
    await analyticsCompareHandler({ siteUrl: "https://example.com/", mode: "drop_attribution" });
    await analyticsAnomaliesHandler({ siteUrl: "https://example.com/", threshold: 3.0 });

    await analyticsAdvancedHandler({ propertyId: "123", metricType: "ecommerce" });
    await analyticsAdvancedHandler({ propertyId: "123", metricType: "realtime" });
    await analyticsAdvancedHandler({ propertyId: "123", metricType: "user_behavior" });
    await analyticsAdvancedHandler({ propertyId: "123", metricType: "audience_segments" });
    await analyticsAdvancedHandler({ propertyId: "123", metricType: "conversion_funnel" });
    await expect(analyticsAdvancedHandler({ propertyId: "123", metricType: "invalid" as any })).rejects.toThrow();
  });

  it("inspection.ts: single url, batch urls, cwvOnly, strategy", async () => {
    await inspectionInspectHandler({ siteUrl: "https://example.com/", urls: ["https://example.com/p1"] });
    await inspectionInspectHandler({ siteUrl: "https://example.com/", urls: ["https://example.com/p1", "https://example.com/p2"] });

    await pagespeedAnalyzeHandler({ url: "https://example.com/", cwvOnly: true });
    await pagespeedAnalyzeHandler({ url: "https://example.com/", strategy: "desktop" });
  });

  it("indexing.ts: standard (single/batch), index_now, remove, status (quota/status)", async () => {
    await indexingSubmitHandler({ siteUrl: "https://example.com/", urls: ["https://example.com/p1"], method: "standard", engine: "all" });
    await indexingSubmitHandler({ siteUrl: "https://example.com/", urls: ["https://example.com/p1", "https://example.com/p2"], method: "standard", engine: "all" });
    await indexingSubmitHandler({ siteUrl: "https://example.com/", urls: ["https://example.com/p1"], method: "standard", engine: "bing" });
    await indexingSubmitHandler({ siteUrl: "https://example.com/", urls: ["https://example.com/p1", "https://example.com/p2"], method: "standard", engine: "bing" });

    await indexingSubmitHandler({ urls: ["https://example.com/p1"], method: "index_now", host: "example.com" });
    await indexingSubmitHandler({ siteUrl: "https://example.com/", urls: ["https://example.com/p1"], method: "remove" });

    await expect(indexingSubmitHandler({ urls: [], method: "index_now" })).rejects.toThrow();
    await expect(indexingSubmitHandler({ urls: ["https://example.com/p1"], method: "remove" })).rejects.toThrow();
    await expect(indexingSubmitHandler({ urls: ["https://example.com/p1"], method: "standard" })).rejects.toThrow();

    await indexingStatusHandler({ siteUrl: "https://example.com/", type: "quota" });
    await indexingStatusHandler({ siteUrl: "https://example.com/", url: "https://example.com/p1", type: "status" });
    await expect(indexingStatusHandler({ siteUrl: "https://example.com/", type: "status" })).rejects.toThrow();
  });

  it("seo.ts: audit (all types), keywords research (stats, related, traffic), schema validate", async () => {
    const auditTypes: Array<any> = [
      "recommendations", "quick_wins", "low_hanging_fruit",
      "cannibalization", "striking_distance", "lost_queries",
      "low_ctr", "brand_vs_nonbrand"
    ];

    for (const type of auditTypes) {
      await seoAuditHandler({ siteUrl: "https://example.com/", type, brandKeywords: ["brand1"] });
    }
    const errRes = await seoAuditHandler({ siteUrl: "https://example.com/", type: "invalid" as any });
    expect(errRes.content[0].text).toContain("error");

    await seoKeywordsResearchHandler({ keywords: ["seo"], type: "stats" });
    await seoKeywordsResearchHandler({ keywords: "seo" as any, type: "stats" });
    await seoKeywordsResearchHandler({ keywords: ["seo"], type: "related" });
    await seoKeywordsResearchHandler({ siteUrl: "https://example.com/", keywords: ["seo"], type: "traffic" });
    await expect(seoKeywordsResearchHandler({ keywords: ["seo"], type: "traffic" })).rejects.toThrow();

    await schemaValidateHandler({ url: "https://example.com/" });
  });

  it("health.ts: site_health_check (crawl_issues/full), compare_engines, get_started", async () => {
    await siteHealthCheckHandler({ siteUrl: "https://example.com/", level: "crawl_issues" });
    await siteHealthCheckHandler({ siteUrl: "https://example.com/", level: "full" });

    await compareEnginesHandler({ siteUrl: "https://example.com/" });
    await getStartedHandlerWrapper();
  });

  it("legacy fallback execution for all 96 legacy tool names", async () => {
    const mockArgs = {
      siteUrl: "https://example.com/",
      url: "https://example.com/p1",
      urls: ["https://example.com/p1", "https://example.com/p2"],
      urlList: ["https://example.com/p1"],
      feedUrl: "https://example.com/sitemap.xml",
      keyword: "seo",
      keywords: ["seo"],
      accountId: "acc1",
      host: "example.com",
      key: "key123"
    };

    const keys = Object.keys(legacyFallbackMap);
    expect(keys.length).toBeGreaterThan(50);

    for (const toolName of keys) {
      const res = await executeLegacyFallback(toolName, mockArgs);
      expect(res).toBeDefined();
    }

    const unknownRes = await executeLegacyFallback("unknown_tool", {});
    expect(unknownRes).toBeNull();
  });
});
