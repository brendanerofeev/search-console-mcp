---
title: "Inspection & Performance"
description: "Monitoring indexing status and page speed across Google, Bing, and PageSpeed Insights."
---

Technical SEO requires verifying crawling, indexing, and Core Web Vitals performance. Inspection & Performance tools enable single or batch URL inspection across Google and Bing alongside full PageSpeed Insights audits.

## Fluent Domain Tools (v2.0)

### `inspection_inspect`
Inspects single or batch URLs (up to 10) for Google Search Console and Bing Webmaster Tools.
*   **Parameters:**
    *   `siteUrl` (string): Target website URL property.
    *   `urls` (array of strings): List of page URLs to inspect (single or batch).
    *   `engine` (string): `"google"` (default), `"bing"`, or `"all"`.
*   **Best for:** *"Inspect the indexing status of https://example.com/p1 and https://example.com/p2."*

### `pagespeed_analyze`
Runs a full PageSpeed Insights analysis returning Lighthouse scores, diagnostics, and Core Web Vitals (LCP, CLS, INP).
*   **Parameters:**
    *   `url` (string): Page URL to analyze.
    *   `strategy` (string): `"mobile"` (default) or `"desktop"`.
    *   `cwvOnly` (boolean): Optional flag to return Core Web Vitals metrics only.
*   **Best for:** *"Audit Core Web Vitals for https://example.com/ on mobile."*

<Tip>
  Set the `PAGESPEED_API_KEY` environment variable for higher quotas (25,000/day vs ~100/day without a key). See [Authentication](/getting-started/authentication#5-pagespeed-insights-optional-api-key) for setup.
</Tip>

---

## 🔄 Backward Compatibility Note

All legacy inspection tools (`inspection_inspect`, `inspection_batch`, `bing_url_info`, `pagespeed_analyze`, `pagespeed_core_web_vitals`) are **100% backward compatible** via our fallback router.

[Read complete Backward Compatibility Guide →](/concepts/backward-compatibility)
