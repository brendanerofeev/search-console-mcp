#!/usr/bin/env node
import 'dotenv/config';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as sites from "./google/tools/sites.js";
import * as sitemaps from "./google/tools/sitemaps.js";
import * as analytics from "./google/tools/analytics.js";
import * as inspection from "./google/tools/inspection.js";
import * as googleIndexing from "./google/tools/indexing.js";
import * as pagespeed from "./google/tools/pagespeed.js";
import * as seoInsights from "./google/tools/seo-insights.js";
import * as seoPrimitives from "./common/tools/seo-primitives.js";
import * as schemaValidator from "./common/tools/schema-validator.js";
import * as advancedAnalytics from "./google/tools/advanced-analytics.js";
import * as sitesHealth from "./google/tools/sites-health.js";
import * as bingSites from "./bing/tools/sites.js";
import * as bingSitemaps from "./bing/tools/sitemaps.js";
import * as bingAnalytics from "./bing/tools/analytics.js";
import * as bingKeywords from "./bing/tools/keywords.js";
import * as bingCrawl from "./bing/tools/crawl.js";
import * as bingUrlSubmission from "./bing/tools/url-submission.js";
import * as bingInspection from "./bing/tools/inspection.js";
import * as bingLinks from "./bing/tools/links.js";
import * as bingHealth from "./bing/tools/sites-health.js";
import * as bingSeoInsights from "./bing/tools/seo-insights.js";
import * as indexNow from "./bing/tools/index-now.js";
import * as bingAdvancedAnalytics from "./bing/tools/advanced-analytics.js";
import * as compareEnginesTool from "./common/tools/compare-engines/index.js";
import * as ga4Analytics from "./ga4/tools/analytics.js";
import * as ga4Realtime from "./ga4/tools/realtime.js";
import * as ga4Behavior from "./ga4/tools/behavior.js";
import * as ga4PageSpeed from "./ga4/tools/pagespeed.js";
import * as ga4GscComparator from "./common/tools/compare-engines/ga4-gsc-comparator.js";
import * as ga4GscBingComparator from "./common/tools/compare-engines/ga4-gsc-bing-comparator.js";
import * as ga4Properties from "./ga4/tools/properties.js";
import { loadConfig, removeAccount, updateAccount, AccountConfig } from './common/auth/config.js';
import { resolveAccount, normalizeWebsite } from './common/auth/resolver.js';
import { getSearchConsoleClient } from './google/client.js';
import { startSseServer } from "./transport/http.js";
import { registerMcpResources } from "./resources/index.js";
import { getBingClient } from './bing/client.js';
import { limitConcurrency } from './common/concurrency.js';
import {
  bingApiDocs,
  indexNowDocs,
  dimensionsDocs as bingDimensionsDocs,
  filtersDocs as bingFiltersDocs,
  searchTypesDocs as bingSearchTypesDocs,
  patternsDocs as bingPatternsDocs,
  algorithmUpdatesDocs as bingAlgorithmUpdatesDocs
} from "./bing/docs/index.js";
import { formatError } from "./common/errors.js";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { colors, printBoxHeader, printStatusLine } from './utils/ui.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getStartedHandler, getStartedToolName, getStartedToolDescription, getStartedToolSchema } from "./common/tools/get-started.js";
import { registerPrompts } from "./prompts/index.js";
import { jsonToCsv } from "./common/utils/csv.js";
import { runDiagnostics } from "./common/diagnostics.js";
import { logger } from "./utils/logger.js";
import { createToolRegistrar, isCliRun, runCli } from "./utils/cli.js";
import * as sitesFluent from "./tools/fluent/sites.js";
import * as sitemapsFluent from "./tools/fluent/sitemaps.js";
import * as analyticsFluent from "./tools/fluent/analytics.js";
import * as inspectionFluent from "./tools/fluent/inspection.js";
import * as indexingFluent from "./tools/fluent/indexing.js";
import * as seoFluent from "./tools/fluent/seo.js";
import * as healthFluent from "./tools/fluent/health.js";
import * as serpFluent from "./tools/fluent/serp.js";
import * as profilesFluent from "./tools/fluent/profiles.js";
import * as trackingFluent from "./tools/fluent/tracking.js";
import * as keywordsFluent from "./tools/fluent/keywords.js";
import * as businessFluent from "./tools/fluent/business.js";
import * as reportFluent from "./tools/fluent/report.js";
import * as auditFluent from "./tools/fluent/audit.js";
import * as backfillFluent from "./tools/fluent/backfill.js";
import { executeLegacyFallback, legacyFallbackMap, shouldUseLegacyFallback } from "./legacy/fallback-router.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load version from package.json
let version = "1.0.0";
try {
  const pkgPath = join(__dirname, '../package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  version = pkg.version;
} catch (e) {
  // Fallback for cases where package.json might not be accessible
}


const server = new McpServer({
  name: "search-console-mcp",
  version: version,
});

registerPrompts(server);
registerMcpResources(server);

const registerTool = createToolRegistrar(server, version);

// Get Started Tool
registerTool(
  getStartedToolName,
  getStartedToolDescription,
  getStartedToolSchema,
  getStartedHandler
);

// --- Fluent Domain Tools (~22 Core Tools) ---

// 1. Sites & Accounts Management
registerTool(
  "sites_list",
  "List verified web properties across Google Search Console, Bing Webmaster Tools, or GA4.",
  { engine: z.enum(["google", "bing", "all"]).optional().describe("Target search engine (default: all)") },
  sitesFluent.sitesListHandler
);

registerTool(
  "sites_manage",
  "Add or delete a web property from Google Search Console or Bing Webmaster Tools.",
  {
    action: z.enum(["add", "delete"]).describe("Action to perform"),
    siteUrl: z.string().describe("The site property URL"),
    engine: z.enum(["google", "bing", "all"]).optional().describe("Target search engine (default: all)")
  },
  sitesFluent.sitesManageHandler
);

registerTool(
  "accounts_manage",
  "Manage Google Search Console service accounts and site permissions.",
  {
    action: z.enum(["list", "add_site", "remove"]).describe("Account action"),
    accountId: z.string().optional().describe("Account ID for add_site or remove"),
    siteUrl: z.string().optional().describe("Site URL to add to account"),
    email: z.string().optional().describe("Optional email filter")
  },
  sitesFluent.accountsManageHandler
);

// 2. Sitemaps Management
registerTool(
  "sitemaps_list",
  "List submitted XML sitemaps and status for a site.",
  {
    siteUrl: z.string().describe("The site property URL"),
    feedUrl: z.string().optional().describe("Optional specific sitemap feed URL"),
    engine: z.enum(["google", "bing", "all"]).optional().describe("Target search engine (default: all)")
  },
  sitemapsFluent.sitemapsListHandler
);

registerTool(
  "sitemaps_submit",
  "Submit a new XML sitemap to Google Search Console and/or Bing Webmaster Tools.",
  {
    siteUrl: z.string().describe("The site property URL"),
    feedUrl: z.string().describe("The XML sitemap feed URL to submit"),
    engine: z.enum(["google", "bing", "all"]).optional().describe("Target search engine (default: all)")
  },
  sitemapsFluent.sitemapsSubmitHandler
);

registerTool(
  "sitemaps_delete",
  "Delete a sitemap from Google Search Console or Bing Webmaster Tools.",
  {
    siteUrl: z.string().describe("The site property URL"),
    feedUrl: z.string().describe("The sitemap feed URL to delete"),
    engine: z.enum(["google", "bing", "all"]).optional().describe("Target search engine (default: all)")
  },
  sitemapsFluent.sitemapsDeleteHandler
);

// 3. Unified Search Analytics
registerTool(
  "analytics_query",
  "Unified search performance query replacing single-dimension tools. Supports queries, pages, countries, devices, and search appearances.",
  {
    siteUrl: z.string().describe("The site property URL"),
    startDate: z.string().optional().describe("Start date YYYY-MM-DD"),
    endDate: z.string().optional().describe("End date YYYY-MM-DD"),
    dimensions: z.array(z.string()).optional().describe("Dimensions: query, page, country, device, searchAppearance, date"),
    filters: z.array(z.any()).optional().describe("Filter objects"),
    rowLimit: z.number().optional().describe("Row limit"),
    engine: z.enum(["google", "bing", "all"]).optional().describe("Target search engine (default: all)")
  },
  analyticsFluent.analyticsQueryHandler
);

registerTool(
  "analytics_compare",
  "Period-over-period search performance comparisons, trends, and traffic drop attributions.",
  {
    siteUrl: z.string().describe("The site property URL"),
    mode: z.enum(["period_over_period", "trends", "drop_attribution"]).optional().describe("Comparison mode"),
    startDate: z.string().optional().describe("Start date YYYY-MM-DD"),
    endDate: z.string().optional().describe("End date YYYY-MM-DD"),
    compareStartDate: z.string().optional().describe("Comparison start date"),
    compareEndDate: z.string().optional().describe("Comparison end date"),
    engine: z.enum(["google", "bing", "all"]).optional().describe("Target search engine (default: all)")
  },
  analyticsFluent.analyticsCompareHandler
);

registerTool(
  "analytics_anomalies",
  "Detect search traffic anomalies across Google and Bing.",
  {
    siteUrl: z.string().describe("The site property URL"),
    startDate: z.string().optional().describe("Start date YYYY-MM-DD"),
    endDate: z.string().optional().describe("End date YYYY-MM-DD"),
    threshold: z.number().optional().describe("Sensitivity threshold"),
    engine: z.enum(["google", "bing", "all"]).optional().describe("Target search engine (default: all)")
  },
  analyticsFluent.analyticsAnomaliesHandler
);

registerTool(
  "analytics_advanced",
  "Google Analytics 4 (GA4) e-commerce, realtime metrics, user behavior, and conversion funnels.",
  {
    propertyId: z.string().describe("GA4 Property ID"),
    metricType: z.enum(["ecommerce", "realtime", "user_behavior", "audience_segments", "conversion_funnel"]).describe("Metric type"),
    startDate: z.string().optional().describe("Start date YYYY-MM-DD"),
    endDate: z.string().optional().describe("End date YYYY-MM-DD")
  },
  analyticsFluent.analyticsAdvancedHandler
);

// 4. URL Inspection & PageSpeed
registerTool(
  "inspection_inspect",
  "Inspect indexing, canonical, and crawl status for single or batch URLs on Google or Bing.",
  {
    siteUrl: z.string().describe("The site property URL"),
    urls: z.array(z.string()).describe("List of URLs to inspect"),
    engine: z.enum(["google", "bing", "all"]).optional().describe("Target search engine (default: all)")
  },
  inspectionFluent.inspectionInspectHandler
);

registerTool(
  "pagespeed_analyze",
  "Run PageSpeed Insights & Core Web Vitals performance analysis for a page.",
  {
    url: z.string().describe("The URL to analyze"),
    strategy: z.enum(["mobile", "desktop"]).optional().describe("Device strategy"),
    category: z.array(z.string()).optional().describe("Lighthouse categories"),
    cwvOnly: z.boolean().optional().describe("Return Core Web Vitals metrics only")
  },
  inspectionFluent.pagespeedAnalyzeHandler
);

// 4a. Per-customer site profiles
// These properties belong to different customers in different markets; rank is
// location-dependent, so location/brand/competitor settings resolve per site.
registerTool(
  "site_profile",
  "Manage per-customer site profiles (location, service areas, brand terms, competitors, tracked queries). SERP and rank tools resolve their settings from here, so each customer's site is measured in its own market.",
  {
    action: z.enum(["list", "get", "set", "delete", "discover"]).optional().describe("Operation (default: list). 'discover' creates/refreshes a profile for every Search Console property and links its GA4 property."),
    siteUrl: z.string().optional().describe("The site property URL, e.g. sc-domain:example.com"),
    customer: z.string().optional().describe("Customer/business name"),
    ga4PropertyId: z.string().optional().describe("Linked GA4 property ID"),
    country: z.string().optional().describe("Country code for SERP, e.g. 'au'"),
    language: z.string().optional().describe("Language code for SERP, e.g. 'en'"),
    device: z.enum(["mobile", "desktop"]).optional().describe("Default device for SERP checks"),
    primaryLocation: z.string().optional().describe("Primary location, e.g. 'Brisbane, Queensland, Australia'"),
    serviceAreas: z.array(z.string()).optional().describe("Additional locations to track rank from"),
    brandTerms: z.array(z.string()).optional().describe("Brand terms, for brand vs non-brand splits"),
    competitors: z.array(z.string()).optional().describe("Known competitor domains"),
    trackedQueries: z.array(z.string()).optional().describe("Queries to track rank for"),
    notes: z.string().optional().describe("Free-form notes"),
    active: z.boolean().optional().describe("Whether the site is actively tracked"),
    includeInactive: z.boolean().optional().describe("Include inactive sites when listing")
  },
  profilesFluent.siteProfileHandler
);

// 4b. Competitive SERP analysis (Serper.dev)
// Search Console only ever returns our own data; these tools supply the
// competitor half and the on-page comparison that explains a position.
registerTool(
  "serp_lookup",
  "Live Google results for a query via Serper, flagging your own listings. Requires SERPER_API_KEY.",
  {
    query: z.string().describe("The search query"),
    siteUrl: z.string().optional().describe("Your site property, to flag which results are yours"),
    location: z.string().optional().describe("Location string, e.g. 'Brisbane, Queensland, Australia'. Critical for local-intent queries"),
    country: z.string().optional().describe("Country code, e.g. 'au' (default: au)"),
    language: z.string().optional().describe("Language code, e.g. 'en' (default: en)"),
    device: z.enum(["desktop", "mobile"]).optional().describe("Device (default: mobile)"),
    num: z.number().optional().describe("Number of organic results, 10-100 (default: 20)")
  },
  serpFluent.serpLookupHandler
);

registerTool(
  "serp_competitor_gap",
  "Explain why pages outrank yours for a query: live SERP positions, Search Console context, and an on-page comparison of your page against those above it. Requires SERPER_API_KEY.",
  {
    siteUrl: z.string().describe("Your site property URL"),
    query: z.string().describe("The search query to analyse"),
    location: z.string().optional().describe("Location string, e.g. 'Brisbane, Queensland, Australia'"),
    country: z.string().optional().describe("Country code (default: au)"),
    language: z.string().optional().describe("Language code (default: en)"),
    device: z.enum(["desktop", "mobile"]).optional().describe("Device (default: mobile)"),
    num: z.number().optional().describe("SERP depth to fetch (default: 20)"),
    compareTop: z.number().optional().describe("How many results above you to analyse on-page (default: 3)"),
    skipPageAnalysis: z.boolean().optional().describe("Return SERP positions only, no page fetches")
  },
  serpFluent.serpCompetitorGapHandler
);

registerTool(
  "page_analyze",
  "Extract on-page SEO signals (title, meta, headings, word count, schema, links, images, keyword placement) for any URL, yours or a competitor's. No API key required.",
  {
    urls: z.array(z.string()).describe("URLs to analyse"),
    keyword: z.string().optional().describe("Target term, to report keyword placement")
  },
  serpFluent.pageAnalyzeHandler
);

// 4c. Local archive: sync + history
// Search Console's window is rolling, so days that are not snapshotted are lost
// permanently; URL Inspection is capped at 2,000/day/property, so index status
// is cached rather than re-fetched.
registerTool(
  "sync_run",
  "Collect data into the local store (rank history, sitemap URLs, index status, SERP positions). This is what the scheduled daily job runs.",
  {
    siteUrl: z.string().optional().describe("Restrict to one property (default: all active profiles)"),
    tasks: z.array(z.enum(["rank", "sitemap", "index", "serp"])).optional().describe("Which syncs to run (default: all)"),
    rankDays: z.number().optional().describe("Days of Search Console history to request (default: 10)"),
    inspectionBudget: z.number().optional().describe("Max URL Inspection calls per property (default: 1500, hard cap 2000)")
  },
  trackingFluent.syncRunHandler
);

registerTool(
  "index_coverage",
  "Indexed vs not indexed across a site, answered from the local cache without spending URL Inspection quota. Optionally lists the problem URLs.",
  {
    siteUrl: z.string().describe("The site property URL"),
    state: z.string().optional().describe("Filter to a coverage state, e.g. 'Discovered - currently not indexed'"),
    listUrls: z.boolean().optional().describe("Include the URL list (default: false)"),
    limit: z.number().optional().describe("Max URLs to list (default: 100)")
  },
  trackingFluent.indexCoverageHandler
);

registerTool(
  "rank_history",
  "Position over time from the local archive, which outlives Google's rolling window. mode='series' for one query's trend; mode='movers' for the biggest climbers and fallers.",
  {
    siteUrl: z.string().describe("The site property URL"),
    query: z.string().optional().describe("Query to chart (required for mode='series')"),
    page: z.string().optional().describe("Restrict to one page URL"),
    days: z.number().optional().describe("Window in days (default: 90)"),
    mode: z.enum(["series", "movers"]).optional().describe("Analysis mode"),
    limit: z.number().optional().describe("Max rows for movers (default: 20)"),
    minImpressions: z.number().optional().describe("Minimum impressions to include in movers (default: 10)")
  },
  trackingFluent.rankHistoryHandler
);

// 4c-bis. Business profiles
// Search Console only ever surfaces terms a site ALREADY appears for, so it can
// never propose a service the client sells but has never ranked for. The
// business profile supplies that half of the keyword input.
registerTool(
  "business_profile",
  "The human-authored description of what a business does (services, audiences, goals, exclusions). 'gather' reads the live site and returns EVIDENCE to write the profile from; 'set' records it; 'status' shows which sites still need one.",
  {
    action: z.enum(["get", "set", "gather", "status"]).optional().describe("Operation (default: get)"),
    siteUrl: z.string().optional().describe("The site property URL"),
    description: z.string().optional().describe("What the business does, in prose"),
    services: z.array(z.string()).optional().describe("Services/products offered"),
    audiences: z.array(z.string()).optional().describe("Who they sell to"),
    goals: z.string().optional().describe("Commercial goals this SEO work serves"),
    exclusions: z.array(z.string()).optional().describe("Terms that must never become targets"),
    businessTerms: z.array(z.string()).optional().describe("What a customer calls this kind of provider when searching (e.g. 'technology consultant', 'plumber'). Head terms are generated from this."),
    profileNotes: z.string().optional().describe("Free-form notes"),
    markReviewed: z.boolean().optional().describe("Mark the profile as human-reviewed"),
    maxPages: z.number().optional().describe("Service pages to sample when gathering (default: 8)")
  },
  businessFluent.businessProfileHandler
);

// 4d. Keyword opportunity mining
registerTool(
  "keyword_candidates",
  "Mine the local rank archive for keyword opportunities, classified by the action each implies (striking_distance, low_ctr, cannibalised, rising, falling, deep_potential) with an estimated monthly click upside.",
  {
    siteUrl: z.string().describe("The site property URL"),
    days: z.number().optional().describe("Window in days (default: 90)"),
    minImpressions: z.number().optional().describe("Minimum impressions to consider (default: 10)"),
    limit: z.number().optional().describe("Max candidates (default: 50)"),
    opportunity: z.enum(["striking_distance","low_ctr","rising","falling","cannibalised","deep_potential"]).optional().describe("Restrict to one opportunity class"),
    groupByOpportunity: z.boolean().optional().describe("Group the results by opportunity class")
  },
  keywordsFluent.keywordCandidatesHandler
);

registerTool(
  "keyword_report",
  "Aggregated keyword candidates for a site from every source (Search Console demand + business-profile services/locations), with provenance. Corroborated terms - offered by the business AND already shown by Google - rank highest.",
  {
    siteUrl: z.string().describe("The site property URL"),
    days: z.number().optional().describe("Search Console window in days (default: 90)"),
    minImpressions: z.number().optional().describe("Minimum impressions for measured terms (default: 5)"),
    limit: z.number().optional().describe("Max keywords (default: 150)"),
    persist: z.boolean().optional().describe("Store candidates so decisions can be recorded (default: true)")
  },
  reportFluent.keywordReportHandler
);

registerTool(
  "keyword_decide",
  "Record which candidates we are shooting for. Targeting a keyword adds it to the operational worklist and to tracked_queries, so the nightly SERP sync starts collecting competitor positions for it.",
  {
    siteUrl: z.string().describe("The site property URL"),
    keywords: z.array(z.string()).describe("Keywords to decide on"),
    decision: z.enum(["targeted", "rejected", "pending"]).describe("The decision"),
    targetPage: z.string().optional().describe("The page that should win this keyword"),
    targetPosition: z.number().optional().describe("Goal position (default: 5)"),
    priority: z.number().optional().describe("1 = highest (default: 3)"),
    notes: z.string().optional().describe("Why")
  },
  reportFluent.keywordDecideHandler
);

registerTool(
  "seo_onboarding",
  "SEO onboarding audit for a site: technical foundations, on-page basics, indexing coverage, measurement setup, plus the off-page items that must be done by hand. Run this BEFORE chasing keywords - an unindexed page cannot rank however good its content is.",
  { siteUrl: z.string().describe("The site property URL") },
  auditFluent.seoOnboardingHandler
);

registerTool(
  "rank_backfill",
  "Recover a property's full available Search Console history into the local archive. The nightly sync only pulls a short rolling window, so anything before collection started was never archived - and Google's window slides, so it expires. Chunked by month, resumable, idempotent.",
  {
    siteUrl: z.string().describe("The site property URL"),
    chunkDays: z.number().optional().describe("Days per request window (default: 30)"),
    force: z.boolean().optional().describe("Re-fetch chunks that already look complete"),
    maxDays: z.number().optional().describe("Only go back this many days")
  },
  backfillFluent.rankBackfillHandler
);

// 5. Indexing & URL Submission
registerTool(
  "indexing_submit",
  "Submit URL(s) for indexing via Google Indexing API, Bing URL submission, or IndexNow protocol.",
  {
    siteUrl: z.string().optional().describe("The site property URL"),
    urls: z.array(z.string()).describe("List of URLs to submit"),
    method: z.enum(["standard", "index_now", "remove"]).optional().describe("Submission method (default: standard)"),
    engine: z.enum(["google", "bing", "all"]).optional().describe("Target search engine (default: google)"),
    host: z.string().optional().describe("Host for IndexNow submission"),
    key: z.string().optional().describe("Key for IndexNow submission"),
    keyLocation: z.string().optional().describe("Key location URL for IndexNow")
  },
  indexingFluent.indexingSubmitHandler
);

registerTool(
  "indexing_status",
  "Check notification status for Google Indexing API or remaining daily Bing submission quota.",
  {
    siteUrl: z.string().describe("The site property URL"),
    url: z.string().optional().describe("URL to check status for"),
    type: z.enum(["status", "quota"]).optional().describe("Check type (default: status)"),
    engine: z.enum(["google", "bing", "all"]).optional().describe("Target search engine")
  },
  indexingFluent.indexingStatusHandler
);

// 6. SEO Intelligence & Audit
registerTool(
  "seo_audit",
  "Specialized SEO intelligence analysis (recommendations, quick wins, cannibalization, striking distance, lost queries, low CTR, brand vs nonbrand).",
  {
    siteUrl: z.string().describe("The site property URL"),
    type: z.enum(["recommendations", "quick_wins", "low_hanging_fruit", "cannibalization", "striking_distance", "lost_queries", "low_ctr", "brand_vs_nonbrand"]).describe("Audit analysis type"),
    brandKeywords: z.array(z.string()).optional().describe("Brand keywords for brand_vs_nonbrand analysis"),
    minImpressions: z.number().optional().describe("Minimum impressions threshold"),
    engine: z.enum(["google", "bing", "all"]).optional().describe("Target search engine (default: all)")
  },
  seoFluent.seoAuditHandler
);

registerTool(
  "seo_keywords_research",
  "Keyword performance stats, related query expansion, and search volume estimates.",
  {
    siteUrl: z.string().optional().describe("The site property URL"),
    keywords: z.array(z.string()).describe("Keywords to analyze"),
    country: z.string().optional().describe("Country code"),
    language: z.string().optional().describe("Language code"),
    type: z.enum(["stats", "related", "traffic"]).optional().describe("Analysis type"),
    engine: z.enum(["google", "bing", "all"]).optional().describe("Target search engine (default: google)")
  },
  seoFluent.seoKeywordsResearchHandler
);

registerTool(
  "schema_validate",
  "Validate structured data (JSON-LD, Microdata, RDFa) for a given webpage URL.",
  { url: z.string().describe("The webpage URL to validate structured markup for") },
  seoFluent.schemaValidateHandler
);

// 7. Diagnostics & Cross-Engine Workflows
registerTool(
  "site_health_check",
  "Comprehensive health audit across Google Search Console and Bing Webmaster Tools.",
  {
    siteUrl: z.string().optional().describe("Optional specific site URL"),
    level: z.enum(["summary", "full", "crawl_issues"]).optional().describe("Health check depth"),
    engine: z.enum(["google", "bing", "all"]).optional().describe("Target search engine (default: all)")
  },
  healthFluent.siteHealthCheckHandler
);

registerTool(
  "compare_engines",
  "Cross-engine performance matrix comparing Google Search Console vs Bing Webmaster Tools.",
  {
    siteUrl: z.string().describe("The site property URL"),
    startDate: z.string().optional().describe("Start date YYYY-MM-DD"),
    endDate: z.string().optional().describe("End date YYYY-MM-DD"),
    dimension: z.enum(["query", "page"]).optional().describe("Comparison dimension"),
    limit: z.number().optional().describe("Result row limit")
  },
  healthFluent.compareEnginesHandler
);


registerTool(
  "diagnostics",
  "Run connectivity diagnostics for all connected accounts. Use this to troubleshoot '0 results' or authentication issues.",
  {},
  async () => {
    try {
      const results = await runDiagnostics();
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    } catch (error) {
      return formatError(error);
    }
  }
);

// Internal silent fallback router interceptor for CallTool requests.
//
// Registered tools take priority. Ten legacy keys share a name with a modern
// tool, and the legacy shims accept a different argument shape, so checking the
// fallback map first left those tools permanently calling the wrong handler
// with mangled arguments. Legacy names are aliases only for tools that are not
// registered under the current schema.
(server.server as any).setRequestHandler(CallToolRequestSchema, async (request: any, extra: any) => {
  const toolName = request.params.name;
  const registeredTool = (server as any)._registeredTools[toolName];
  if (shouldUseLegacyFallback(toolName, Boolean(registeredTool))) {
    const legacyResult = await executeLegacyFallback(toolName, request.params.arguments);
    if (legacyResult) return legacyResult;
  }
  if (!registeredTool) {
    throw new Error(`Tool ${toolName} not found`);
  }
  return await registeredTool.handler(request.params.arguments);
});

async function main() {
  const command = process.argv[2];

  if (process.stdout.isTTY) {
    try {
      const { checkVersionCached, promptUpdateInteractive } = await import("./utils/update.js");
      const info = await checkVersionCached(version);
      if (info.updateAvailable) {
        await promptUpdateInteractive(info.latestVersion, version);
      }
    } catch {
      // Fail silently
    }
  }

  if (command === 'update') {
    const { runUpdateCommand } = await import('./utils/update.js');
    await runUpdateCommand();
    return;
  }

  if (isCliRun()) {
    process.exitCode = await runCli();
    return;
  }

  // Handle standalone commands
  if (command === 'setup') {
    const { main: setupMain } = await import('./setup.js');
    await setupMain();
    return;
  }

  if (command === 'account' || command === 'accounts') {
    const { main: accountsMain } = await import('./accounts.js');
    await accountsMain(process.argv.slice(3));
    return;
  }

  if (command === 'logout') {
    const { runLogout } = await import('./setup.js');
    await runLogout();
    return;
  }

  if (command === 'login') {
    const { login } = await import('./setup.js');
    await login();
    return;
  }

  if (command === 'diagnostics') {
    const results = await runDiagnostics();
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (command === 'sites') {
    const { main: accountsMain } = await import('./accounts.js');
    await accountsMain(['list']);
    return;
  }

  // Check for credentials
  const config = await loadConfig();
  const accounts = Object.values(config.accounts);

  const hasGoogle = accounts.some(a => a.engine === 'google') ||
    !!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    (!!process.env.GOOGLE_CLIENT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY) ||
    existsSync(join(homedir(), '.search-console-mcp-tokens.enc')); // Legacy check

  const hasBing = accounts.some(a => a.engine === 'bing') || !!process.env.BING_API_KEY;
  const hasGA4 = accounts.some(a => a.engine === 'ga4');

  if (!hasGoogle && !hasBing && !hasGA4) {
    printBoxHeader('Authentication', colors.red);

    console.error(`${colors.bold}${colors.dim}🔍 Connection Status:${colors.reset}`);
    printStatusLine('Google', hasGoogle);
    printStatusLine('GA4', hasGA4);
    printStatusLine('Bing', hasBing);
    console.error('');

    if (!hasGoogle) {
      console.error(`${colors.red}✘${colors.reset} ${colors.bold}Google not configured.${colors.reset}`);
      console.error(`${colors.blue}ℹ${colors.reset} ${colors.dim}Run:${colors.reset} ${colors.bold}${colors.cyan}search-console-mcp setup --engine=google${colors.reset}`);
    }

    if (!hasGA4) {
      console.error(`${colors.red}✘${colors.reset} ${colors.bold}GA4 not configured.${colors.reset}`);
      console.error(`${colors.blue}ℹ${colors.reset} ${colors.dim}Run:${colors.reset} ${colors.bold}${colors.cyan}search-console-mcp setup --engine=ga4${colors.reset}`);
    }

    if (!hasBing) {
      console.error(`\n${colors.red}✘${colors.reset} ${colors.bold}Bing not configured.${colors.reset}`);
      console.error(`${colors.blue}ℹ${colors.reset} ${colors.dim}Run:${colors.reset} ${colors.bold}${colors.cyan}search-console-mcp setup --engine=bing${colors.reset}`);
    }

    console.error(`\n${colors.dim}${'─'.repeat(64)}${colors.reset}\n`);
  }

  const isSseMode = process.argv.includes("--transport=sse") || process.argv.includes("serve");
  const portArg = process.argv.find((arg) => arg.startsWith("--port="));
  const port = portArg
    ? parseInt(portArg.split("=")[1], 10)
    : parseInt(process.env.PORT ?? "3000", 10);

  if (isSseMode) {
    // The remote transport exposes every tool, including writes (sitemap submit,
    // indexing submit). Refuse to serve it unauthenticated outside development —
    // failing to start is far safer than silently publishing an open endpoint.
    if (!process.env.MCP_AUTH_TOKEN && process.env.NODE_ENV === "production") {
      console.error(
        "Refusing to start: MCP_AUTH_TOKEN is required when serving HTTP with NODE_ENV=production."
      );
      process.exit(1);
    }
    if (!process.env.MCP_AUTH_TOKEN) {
      console.error("WARNING: serving HTTP without MCP_AUTH_TOKEN — endpoint is unauthenticated.");
    }
    await startSseServer(server, port);
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    const googleStatus = hasGoogle ? `${colors.green}✔ Google${colors.reset}` : `${colors.red}✘ Google${colors.reset}`;
    const ga4Status = hasGA4 ? `${colors.green}✔ GA4${colors.reset}` : `${colors.red}✘ GA4${colors.reset}`;
    const bingStatus = hasBing ? `${colors.green}✔ Bing${colors.reset}` : `${colors.red}✘ Bing${colors.reset}`;
    console.error(`Search Console MCP running on stdio [ ${googleStatus} | ${ga4Status} | ${bingStatus} ]`);
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
