---
title: "Architecture"
description: "How Search Console MCP v2.0 is built."
---

Search Console MCP v2.0 acts as a high-performance intelligence layer between your AI agent and search engine APIs (Google Search Console, Bing Webmaster Tools, Google Analytics 4, and PageSpeed Insights).

## System Architecture Overview

```
                      ┌─────────────────────────────────────────┐
                      │             MCP AI Client               │
                      │   (Claude Desktop, Cursor, AGY CLI)     │
                      └────────────────────┬────────────────────┘
                                           │ JSON-RPC (MCP)
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │           Search Console MCP            │
                      │          (src/tools/fluent/*)           │
                      └──────┬───────────────────────────┬──────┘
                             │                           │
                 Fluent Tool Call                Legacy Fallback Tool Call
                             │                           │
                             │                  ┌────────┴────────┐
                             │                  │ Fallback Router │
                             │                  └────────┬────────┘
                             ▼                           ▼
                      ┌─────────────────────────────────────────┐
                      │    Parallel Execution Engine (GSC/Bing) │
                      │       (src/common/utils/parallel.ts)    │
                      └──────┬──────────────┬─────────────┬─────┘
                             │              │             │
                             ▼              ▼             ▼
                      ┌────────────┐  ┌───────────┐  ┌──────────┐
                      │ Google GSC │  │ Bing WMT  │  │   GA4    │
                      └────────────┘  └───────────┘  └──────────┘
```

---

## Key Subsystems

### 1. Fluent Domain Architecture (`src/tools/fluent/`)
Search Console MCP v2.0 groups all operations into **7 clean domain modules**:
* **`sites.ts`**: Site property management & multi-account configuration (`sites_list`, `sites_manage`, `accounts_manage`).
* **`sitemaps.ts`**: Sitemap listing, submission, and removal (`sitemaps_list`, `sitemaps_submit`, `sitemaps_delete`).
* **`analytics.ts`**: Unified search queries, PoP comparison, trends, anomalies, and drop attribution (`analytics_query`, `analytics_compare`, `analytics_anomalies`).
* **`inspection.ts`**: URL inspection & Core Web Vitals audit (`inspection_inspect`, `pagespeed_analyze`).
* **`indexing.ts`**: Instant URL indexing via IndexNow or Google/Bing APIs (`indexing_submit`, `indexing_status`).
* **`seo.ts`**: Automated SEO audits and keyword research (`seo_audit`, `seo_keywords_research`, `schema_validate`).
* **`health.ts`**: Cross-platform health checks & engine comparison (`site_health_check`, `compare_engines`).

---

### 2. Parallel Multi-Engine Runner (`src/common/utils/parallel.ts`)
Multi-engine queries (`engine: "all"`) run concurrently using `Promise.allSettled`. If one engine encounters a temporary auth issue or timeout, the remaining engines return valid data without failing the overall query. This architecture reduces multi-engine latency by **50%+**.

---

### 3. Fallback Router Layer (`src/legacy/fallback-router.ts`)
To ensure **100% backward compatibility** for all ~96 legacy tool names (`bing_sites_list`, `seo_quick_wins`, `sitemaps_get`, `bing_index_now`, etc.), the Fallback Router intercepts legacy invocations and delegates them directly to the corresponding Fluent handler.

[Read full Backward Compatibility Documentation →](/concepts/backward-compatibility)

---

## Security & Privacy Design

* **Local Execution**: The server runs locally on your machine. Your API keys and search data are never sent to third-party tracking servers.
* **Encrypted Token Vault**: Credentials are stored in system Keychains (macOS Keychain, Windows Credential Manager) with AES-256-GCM hardware-bound file encryption fallback.
* **Deterministic Server-Side Calculations**: SEO math (cannibalization scores, standard deviations, moving averages) is calculated deterministically on the server before passing cleaned results to the LLM context window.
