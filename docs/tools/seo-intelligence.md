---
title: "SEO Intelligence Tools"
description: "Deterministic analysis and automated audits for strategic organic growth."
---

SEO Intelligence Tools implement server-side SEO math (cannibalization scoring, striking distance filtering, brand regex matching, and opportunity scoring) before passing curated signals into your AI agent's context window.

## Fluent SEO Tools (v2.0)

### `seo_audit`
Unified entry point for automated SEO audits across Google and Bing.
*   **Audit Types (`type`):**
    *   `"quick_wins"`: Queries ranking in positions 8–15 with high impressions.
    *   `"striking_distance"`: Page 2 keywords close to pushing onto Page 1.
    *   `"cannibalization"`: Queries split across multiple competing landing pages.
    *   `"low_hanging_fruit"`: High visibility keywords with low CTR (< 2%).
    *   `"lost_queries"`: High-value queries that experienced >80% traffic loss.
    *   `"recommendations"`: Automated AI SEO improvement recommendations.
    *   `"brand_vs_nonbrand"`: Brand vs non-brand search visibility breakdown.
*   **Parameters:** `siteUrl`, `type`, `brandKeywords` (array of brand strings).
*   **Best for:** *"Run a quick wins and cannibalization audit for https://example.com/."*

### `seo_keywords_research`
Keyword statistics and related keyword research via Bing & GSC data.
*   **Types (`type`):** `"stats"`, `"related"`, `"traffic"`.
*   **Parameters:** `keywords` (array of strings), `type`.
*   **Best for:** *"Get search volume and related keywords for 'seo tools'."*

### `schema_validate`
Validates JSON-LD structured data and schema markup on target web pages.

---

## 🔄 Backward Compatibility Note

All legacy SEO tools (`seo_quick_wins`, `seo_striking_distance`, `seo_cannibalization`, `seo_low_hanging_fruit`, `seo_lost_queries`, `seo_recommendations`, `seo_brand_vs_nonbrand`, `bing_opportunity_finder`) are **100% backward compatible** via our fallback router.

[Read complete Backward Compatibility Guide →](/concepts/backward-compatibility)
