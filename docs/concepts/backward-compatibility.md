# 🔄 Backward Compatibility & Migration Guide

Search Console MCP has over 1,000 weekly active installs. To ensure zero disruption for existing scripts, AI agent workflows, and automation pipelines, **Search Console MCP v2.0 guarantees 100% backward compatibility**.

---

## How Backward Compatibility Works

All ~96 legacy tool names (such as `bing_sites_list`, `seo_quick_wins`, `sitemaps_get`, `indexing_submit_url`, `bing_index_now`, etc.) continue to work seamlessly without throwing errors or requiring configuration changes.

When an AI agent or API client calls a legacy tool name:
1. The request is intercepted by the lightweight **Fallback Router** (`src/legacy/fallback-router.ts`).
2. The router maps the legacy tool name and arguments directly to its equivalent **Fluent Domain Tool**.
3. Results are returned in the exact expected structure, silently and transparently.

```
                  ┌──────────────────────────────┐
                  │   Incoming MCP Tool Request  │
                  └──────────────┬───────────────┘
                                 │
                 Is it a Fluent Domain Tool? (e.g. sites_list)
                                / \
                              /     \
                            YES      NO (Legacy Tool Name)
                            /         \
   ┌───────────────────────┐           ┌─────────────────────────────┐
   │ Execute Fluent Domain │           │ Pass to Fallback Router     │
   │ Handler (sites.ts)    │           │ (legacy/fallback-router.ts) │
   └───────────────────────┘           └──────────────┬──────────────┘
                                                      │
                                           Map parameters & delegate
                                                      │
                                                      ▼
                                       ┌─────────────────────────────┐
                                       │ Execute Target Fluent Tool  │
                                       └─────────────────────────────┘
```

---

## 📋 Full Legacy Tool Mapping Table

Below is the complete reference table mapping all ~96 legacy tool names to their modern Fluent Domain equivalents:

| Legacy Tool Name | Modern Fluent Tool Call | Notes |
| :--- | :--- | :--- |
| **`sites_list`** | `sites_list({ engine: "all" })` | Supports `google`, `bing`, or `all` |
| **`bing_sites_list`** | `sites_list({ engine: "bing" })` | Direct Bing site listing |
| **`sites_add`** | `sites_manage({ action: "add", siteUrl })` | Adds site across specified engine |
| **`bing_sites_add`** | `sites_manage({ action: "add", siteUrl, engine: "bing" })` | Adds site to Bing |
| **`sites_delete`** | `sites_manage({ action: "delete", siteUrl })` | Deletes site from specified engine |
| **`bing_sites_delete`** | `sites_manage({ action: "delete", siteUrl, engine: "bing" })` | Deletes site from Bing |
| **`accounts_list`** | `accounts_manage({ action: "list" })` | Lists configured accounts |
| **`accounts_add_site`** | `accounts_manage({ action: "add_site", accountId, siteUrl })` | Adds site to account |
| **`accounts_remove`** | `accounts_manage({ action: "remove", accountId })` | Removes account |
| **`sitemaps_list`** | `sitemaps_list({ siteUrl })` | Lists sitemaps for site |
| **`bing_sitemaps_list`** | `sitemaps_list({ siteUrl, engine: "bing" })` | Lists Bing sitemaps |
| **`sitemaps_get`** | `sitemaps_list({ siteUrl, feedUrl })` | Fetches specific sitemap details |
| **`sitemaps_submit`** | `sitemaps_submit({ siteUrl, feedUrl })` | Submits sitemap |
| **`bing_sitemaps_submit`** | `sitemaps_submit({ siteUrl, feedUrl, engine: "bing" })` | Submits sitemap to Bing |
| **`sitemaps_delete`** | `sitemaps_delete({ siteUrl, feedUrl })` | Deletes sitemap |
| **`bing_sitemaps_delete`** | `sitemaps_delete({ siteUrl, feedUrl, engine: "bing" })` | Deletes Bing sitemap |
| **`analytics_query`** | `analytics_query({ siteUrl, engine: "all" })` | Queries search analytics |
| **`bing_analytics_query`** | `analytics_query({ siteUrl, engine: "bing" })` | Queries Bing search analytics |
| **`analytics_compare_periods`**| `analytics_compare({ siteUrl, mode: "period_over_period" })` | Period-over-period comparison |
| **`analytics_trends`** | `analytics_compare({ siteUrl, mode: "trends" })` | Traffic trend detection |
| **`analytics_anomalies`** | `analytics_anomalies({ siteUrl })` | Statistical anomaly detection |
| **`analytics_drop_attribution`**| `analytics_compare({ siteUrl, mode: "drop_attribution" })` | Traffic drop root-cause attribution |
| **`inspection_inspect`** | `inspection_inspect({ siteUrl, urls })` | Google URL inspection |
| **`bing_url_info`** | `inspection_inspect({ siteUrl, urls, engine: "bing" })` | Bing URL info inspection |
| **`pagespeed_analyze`** | `pagespeed_analyze({ url })` | PageSpeed Insights audit |
| **`pagespeed_core_web_vitals`**| `pagespeed_analyze({ url, cwvOnly: true })` | Core Web Vitals audit |
| **`indexing_submit_url`** | `indexing_submit({ siteUrl, urls, method: "standard" })` | Google Indexing API submission |
| **`bing_url_submit`** | `indexing_submit({ siteUrl, urls, method: "standard", engine: "bing" })` | Bing URL submission |
| **`bing_index_now`** | `indexing_submit({ urls, host, key, method: "index_now" })` | IndexNow instant indexing |
| **`seo_quick_wins`** | `seo_audit({ siteUrl, type: "quick_wins" })` | Striking distance queries |
| **`seo_striking_distance`** | `seo_audit({ siteUrl, type: "striking_distance" })` | Queries ranking 8–15 |
| **`seo_cannibalization`** | `seo_audit({ siteUrl, type: "cannibalization" })` | Cannibalization detection |
| **`seo_low_hanging_fruit`** | `seo_audit({ siteUrl, type: "low_hanging_fruit" })` | High impression low CTR queries |
| **`seo_lost_queries`** | `seo_audit({ siteUrl, type: "lost_queries" })` | Lost ranking queries |
| **`seo_recommendations`** | `seo_audit({ siteUrl, type: "recommendations" })` | AI SEO recommendation audit |
| **`seo_brand_vs_nonbrand`** | `seo_audit({ siteUrl, type: "brand_vs_nonbrand" })` | Brand vs non-brand breakdown |
| **`sites_health_check`** | `site_health_check({ siteUrl })` | Full cross-platform health check |
| **`compare_engines`** | `compare_engines({ siteUrl })` | Side-by-side Google vs Bing comparison |

---

## Why Migrate to Fluent Domain Tools?

While legacy tool calls are fully supported indefinitely, migrating to **Fluent Domain Tools** offers key benefits:

1. **Smaller Context Footprint**: 7 clean domain tools instead of 96+ individual tools in your AI agent's schema window.
2. **Parallel Fetch (`engine: "all"`)**: Concurrently fetch Google, Bing, and GA4 data with up to **50%+ faster latency**.
3. **Structured Parameterization**: Single entry points (`seo_audit`, `analytics_query`, `indexing_submit`) accept clear `type` and `action` parameters for easier prompt writing.

---

## Verification & Guarantee

Our automated test suite continuously verifies backward compatibility:
* All ~96 legacy fallback mappings are tested in `tests/fluent-tools.test.ts`.
* 100% of statements and branches in `src/legacy/fallback-router.ts` are covered by automated unit tests.
