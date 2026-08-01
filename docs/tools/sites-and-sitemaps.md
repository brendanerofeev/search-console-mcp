---
title: "Sites & Sitemaps Tools"
description: "Managing verified site properties and sitemap submissions across search engines."
---

Sites & Sitemaps tools allow your AI agent to discover verified properties, configure multi-account profiles, inspect sitemaps, and submit XML feeds to **Google Search Console and Bing Webmaster Tools**.

## Fluent Domain Tools (v2.0)

### `sites_list`
Lists verified website properties across search engines concurrently.
*   **Parameters:** `engine: "all" | "google" | "bing"`.
*   **Best for:** *"List all verified sites across Google and Bing."*

### `sites_manage`
Adds or deletes site properties.
*   **Parameters:** `action: "add" | "delete"`, `siteUrl`, `engine`.

### `accounts_manage`
Manages multi-account profiles and site-to-account assignments.
*   **Parameters:** `action: "list" | "add_site" | "remove"`, `accountId`, `siteUrl`.

### `sitemaps_list`
Lists submitted sitemaps, crawl status, and error counts.
*   **Parameters:** `siteUrl`, `feedUrl` (optional), `engine: "all" | "google" | "bing"`.

### `sitemaps_submit`
Submits a new XML sitemap feed.
*   **Parameters:** `siteUrl`, `feedUrl`, `engine`.

### `sitemaps_delete`
Deletes a sitemap feed.
*   **Parameters:** `siteUrl`, `feedUrl`, `engine`.

---

## 🔄 Backward Compatibility Note

All legacy site and sitemap tools (`sites_list`, `bing_sites_list`, `sites_add`, `sites_delete`, `sitemaps_list`, `bing_sitemaps_list`, `sitemaps_get`, `sitemaps_submit`, `sitemaps_delete`) are **100% backward compatible** via our fallback router.

[Read complete Backward Compatibility Guide →](/concepts/backward-compatibility)
