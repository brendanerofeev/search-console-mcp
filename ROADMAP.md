# Google Search Console MCP Server - Roadmap

This document outlines the planned features and improvements for this project.

## ✅ Completed

### v1.0.0 - Initial Release

- Sites management (list, add, delete, get)
- Sitemaps management (list, submit, delete, get)
- Search Analytics queries with filtering
- Performance summary with metrics
- URL inspection
- MCP resources and prompts
- Error handling with user-friendly messages

### v1.1.0 - Documentation Resources

- Embedded documentation as MCP resources
- Dimensions reference (`docs://dimensions`)
- Filters reference (`docs://filters`)
- Search types reference (`docs://search-types`)
- Common patterns & recipes (`docs://patterns`)

### v1.2.0 - Enhanced Analytics Tools

- `analytics_compare_periods` - Compare two date ranges
- `analytics_top_queries` - Top queries by clicks/impressions
- `analytics_top_pages` - Top pages by clicks/impressions
- Pagination support via `startRow` parameter
- Comprehensive README with installation guides

### v1.3.0 - More Prompts

- `compare-performance` - Compare this week vs last week
- `find-declining-pages` - Identify pages losing traffic
- `keyword-opportunities` - Find low-CTR high-impression queries
- `new-content-impact` - Analyze new content performance
- `mobile-vs-desktop` - Compare device performance

### v1.4.0 - Additional Resources

- `sitemaps://list/{siteUrl}` - List sitemaps for a site
- `analytics://summary/{siteUrl}` - Performance summary for a site

### v1.5.0 - CI/CD & PageSpeed Integration

- GitHub Actions CI workflow (Node 18/20/22)
- Automated npm publish on release
- `pagespeed_analyze` - PageSpeed Insights analysis
- `pagespeed_core_web_vitals` - Core Web Vitals (LCP, FID, CLS, FCP, TTI, TBT)

### v1.8.0 - SEO Insights

- `seo_recommendations` - Generate actionable SEO improvement suggestions
- `seo_low_hanging_fruit` - Find high-impression keywords at positions 5-20
- `seo_cannibalization` - Detect pages competing for the same keywords
- `seo_quick_wins` - Find pages close to page 1 (positions 11-20)

### v1.9.0 - Schema Validator & Experience

### v1.9.1 - Advanced Analytics

- \`analytics_trends\` - Detect traffic trends (growing/declining)
- \`analytics_anomalies\` - Identify unusual spikes or drops
- \`analytics_by_country\` - Performance breakdown by country
- \`analytics_search_appearance\` - Data by search appearance type

### v1.9.2 - Security & Docs Site

- `schema_validate` - Validate structured data (JSON-LD)
- Enhanced Setup Wizard with project support and better UX
- \`analytics_drop_attribution\` - Device impact & Google Algorithm correlation
- \`analytics_time_series\` - Dynamic rolling averages & trend forecasting
- **Security Hardening**: Path traversal protection in setup wizard
- **Expanded Documentation**: Algorithm updates reference (\`docs://algorithm-updates\`)

### v1.9.3 - Schema Validator & Experience

- `sites_health_check` - Check all sites for issues


### v1.11.0 - Bing & Multi-Engine Foundation

- **Bing Webmaster Tools Support**: Comprehensive integration
  - `bing_sites` - Manage Bing sites
  - `bing_sitemaps` - List and submit Bing sitemaps
  - `bing_inspection` - URL status and crawl details
  - `bing_analytics` - Query and page performance (with client-side date filtering)
  - `bing_url_submission` - Manual submission and IndexNow support
- **Advanced Bing Tools**:
  - `bing_keywords` - Keyword stats and related suggestions
  - `bing_crawl` - Monitor crawl issues and statistics
  - `bing_links` - Backlink monitoring
  - `bing_sites_health` - Overall site health checks for Bing

### v1.11.1 - Cross-Engine Analysis & Advanced SEO

- **Cross-Engine Comparison Tool**: 
  - `compare_engines` - Side-by-side Google vs Bing performance analysis
  - **SEO Signals**: Engine-aware signals (`bing_opportunity`, `google_dependency_risk`, `ctr_mismatch`)
- **Advanced Bing Analytics**:
  - `bing_analytics_compare_periods` - Comparison between date ranges
  - `bing_analytics_time_series` - Forecasting and rolling averages
  - `bing_analytics_anomalies` - Detection of traffic spikes/drops
- **Bing SEO Intelligence**:
  - `bing_seo_recommendations` - Automated optimization suggestions
  - `bing_low_hanging_fruit` - Rapid growth opportunities
  - `bing_cannibalization` - Detect competing pages in Bing SERPs
- **Prompt Enhancements**: All analytical prompts updated with engine selection and date range defaults.

### v1.12.0 - Multi-Account Support & CLI Accounts Management

- **Multi-Account Architecture**: Manage multiple Google and Bing accounts seamlessly
  - Dynamic account resolution based on `siteUrl` (exact match → domain match → global fallback)
  - Encrypted unified config (`~/.search-console-mcp-config.enc`) with per-machine encryption
  - Secure token storage in OS keychain via `@napi-rs/keyring`
- **CLI Accounts Management** (`accounts` subcommand):
  - `accounts list` - Display all connected accounts, sites, and engines (JSON output)
  - `accounts remove --account=<alias>` - Remove an account by alias or ID
  - `accounts remove --site=<url>` - Remove a site boundary from an account
  - `accounts add-site --account=<alias> --site=<url>` - Add a site boundary to an account
  - Supports both positional args (human) and flags (agent)
- **Legacy Account Detection**: Automatic discovery of all legacy auth methods
  - Encrypted legacy tokens (`~/.search-console-mcp-tokens.enc`)
  - Unencrypted legacy OAuth tokens (`~/.search-console-mcp-tokens.json`)
  - Service Account env vars (`GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLIENT_EMAIL`/`GOOGLE_PRIVATE_KEY`)
  - Bing API Key env var (`BING_API_KEY`)
- **Setup Wizard DX Improvements**:
  - `--accounts` flag routes directly to accounts management
  - Connection Status only shown when accounts exist
  - Re-running setup for the same alias updates the account instead of creating duplicates

### v1.13.0 - GA4 & Cross-Platform Integration

- **Google Analytics 4 (GA4) Support**:
  - Comprehensive suite of analytics tools: `analytics_page_performance`, `analytics_traffic_sources`, `analytics_ecommerce`, `analytics_realtime`
  - Auth support for OAuth and Service Accounts via Setup Wizard
- **URL Inspection & Utilities**:
  - `inspection_batch` - **[NEW]** Bulk URL inspection for GSC and Bing (up to 5 URLs in parallel)
- **Cross-Platform Comparison Tools**:
  - `page_analysis` - Correlate ranking (GSC) with behavior (GA4)
  - `opportunity_matrix` - Master prioritization list combining GSC, Bing, and GA4 signals
  - `traffic_health_check` - Diagnose tracking gaps
  - `brand_analysis` - Brand share across all platforms
  - `analytics_pagespeed_correlation` - Correlate Core Web Vitals with GA4 engagement metrics

### v1.13.1 - Performance & Export

- **In-Memory Configuration Caching**:
  - Implemented a caching layer for `loadConfig` providing ~5000x speedup for subsequent calls.
  - Automatic cache synchronization on `saveConfig`.
- **CSV Export Capabilities**:
  - Added `format: "csv"` support to `analytics_query`, `bing_analytics_query`, and `analytics_page_performance`.
  - Robust CSV formatting with proper escaping for special characters.
- **Bing SEO Insights Expansion**:
  - `bing_seo_lost_queries` - Identify queries with significant traffic loss on Bing.
  - `bing_brand_analysis` - Performance segmentation between Brand vs. Non-Brand for Bing.
  - Optimized `generateRecommendations` for Bing with parallel request execution.
- **Enhanced Bing Analytics**:
  - Added `startDate`, `endDate`, and `limit` parameters to `bing_analytics_query`.

### v1.14.0 - Indexing API Integration

- **Google Indexing API Support**:
  - `indexing_submit_url` - Submit URL updates to Google (via Indexing API v3) or Bing (via URL Submission API).
  - `indexing_remove_url` - Notify Google of page deletion.
  - `indexing_status` - Retrieve URL notification metadata.
  - `indexing_batch_submit` - Batch submission with concurrency control.
- **Isolated Auth Scopes**:
  - Added dedicated indexing client factory with `https://www.googleapis.com/auth/indexing` scope to ensure principle of least privilege.
- **MCP Resource Documentation**:
  - Added `docs://indexing` resource reference for user guidelines and best practices.

---

## 🚧 In Progress

- **Performance Optimizations**: Further reducing API footprint across all insight modules.
- **Enhanced Documentation**: Mintlify-driven user guides and cross-platform strategies. SEO upgrade (title, description, keywords)

---

## Experience & Scalability

- **Batch Processing**: Higher-order tools for automated bulk fixes

---

## AI Exposure
-- AI Search Visibility tracking 
-- AI Content Gap Analysis
-- AI Competitor Analysis

## 🔮 Future Considerations

### Additional APIs

| API                  | Use Case                               |
| -------------------- | -------------------------------------- |
| Screaming Frog API   | Technical SEO audits                   |
| Perplexity/OpenAI    | AI Search Visibility tracking           |




### Developer Experience

- Debug logging mode (`--verbose`)
- Request/response caching (Redis support)
- Rate limit handling with exponential backoff


---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to contribute to this project.

Ideas and feature requests are welcome! Please open an issue to discuss.
