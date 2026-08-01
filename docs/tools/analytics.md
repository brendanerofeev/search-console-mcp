---
title: "Analytics Tools"
description: "Mastering search performance data across Google, Bing, and GA4."
---

The Analytics tools form the core data engine of Search Console MCP v2.0. They allow you to query raw metrics, perform period-over-period comparisons, detect statistical anomalies, and attribute traffic drops across **Google Search Console, Bing Webmaster Tools, and Google Analytics 4** concurrently.

## Fluent Analytics Tools (v2.0)

### `analytics_query`
Unified search & analytics query tool supporting Google, Bing, GA4, or all engines simultaneously in parallel.
*   **Parameters:**
    *   `siteUrl` (string): Target website URL (e.g. `https://example.com/`).
    *   `engine` (string): `"all"` (default), `"google"`, `"bing"`, or `"ga4"`.
    *   `dimensions` (array): `["query"]`, `["page"]`, `["date"]`, `["country"]`, `["device"]`.
    *   `startDate` / `endDate` (string): Date range `YYYY-MM-DD`.
*   **Best for:** *"Get top 20 queries across Google and Bing for the last 30 days."*

### `analytics_compare`
Analyzes performance deltas, trends, or traffic drop root-cause attributions.
*   **Modes (`mode`):**
    *   `"period_over_period"`: Compare current period vs. previous period.
    *   `"trends"`: Rolling averages and direction analysis.
    *   `"drop_attribution"`: Correlates traffic drops with Google Algorithm Updates and device loss.
*   **Best for:** *"Why did my traffic drop last week?"*

### `analytics_anomalies`
Statistical anomaly detection that flags unusual traffic spikes or declines outside standard deviation thresholds.
*   **Parameters:** `siteUrl`, `threshold` (default `2.0` standard deviations).
*   **Best for:** *"Detect any unexpected traffic anomalies in the last 60 days."*

### `analytics_advanced`
High-dimensional Google Analytics 4 reports.
*   **Metric Types (`metricType`):** `"ecommerce"`, `"realtime"`, `"user_behavior"`, `"audience_segments"`, `"conversion_funnel"`.

---

## ⚡ Parallel Fetching (`engine: "all"`)

By passing `engine: "all"` to `analytics_query`, Search Console MCP queries both Google Search Console and Bing Webmaster APIs concurrently in parallel using `Promise.allSettled`, reducing query latency by **50%+**.

---

## 🔄 Backward Compatibility Note

All legacy analytics tools (`query_analytics`, `bing_analytics_query`, `analytics_compare_periods`, `analytics_drop_attribution`, `analytics_time_series`, `analytics_page_performance`) are **100% backward compatible** via our fallback router.

[Read complete Backward Compatibility Guide →](/concepts/backward-compatibility)
