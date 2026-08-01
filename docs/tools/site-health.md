---
title: "Site Health Check & Engine Comparison"
description: "Automated health diagnostics and cross-platform comparisons."
---

The `site_health_check` and `compare_engines` tools provide one-shot cross-platform health checks, technical crawl diagnostics, and side-by-side Google vs Bing performance comparisons.

## Fluent Domain Tools (v2.0)

### `site_health_check`
One-shot health check across Google, Bing, and GA4.
*   **Levels (`level`):**
    *   `"summary"`: Overall health score, WoW click/impression changes, and issues.
    *   `"full"` (default): Full performance deltas, sitemap audit, and anomaly detection.
    *   `"crawl_issues"`: Bing crawl issue diagnostics and HTTP error breakdowns.
*   **Parameters:** `siteUrl`, `level`.
*   **Best for:** *"Run a full site health check on https://example.com/."*

### `compare_engines`
Compares search performance metrics between Google Search Console and Bing Webmaster Tools side by side.
*   **Parameters:** `siteUrl`, `startDate`, `endDate`.
*   **Best for:** *"Compare Google vs Bing performance for the last 30 days."*

---

## 🔄 Backward Compatibility Note

All legacy health tools (`sites_health_check`, `bing_sites_health`, `traffic_health_check`, `compare_engines`) are **100% backward compatible** via our fallback router.

[Read complete Backward Compatibility Guide →](/concepts/backward-compatibility)
