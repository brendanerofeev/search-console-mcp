---
title: "Inspection & Performance"
description: "Monitoring indexing status and page speed."
---

Technical SEO is about ensuring your foundation is solid. These tools allow the agent to verify crawling and performance.

## Tools

### `inspect_url` (Google) & `bing_url_info` (Bing)
Checks the indexing status of a single URL in Google and Bing.
*   **When to use:** When a specific page isn't getting any traffic.
*   **What problem it solves:** Finding out if a page is blocked by robots.txt, redirected, or simply ignored.

### `inspection_batch`
Inspects multiple URLs (up to 5) simultaneously for both Google Search Console and Bing Webmaster Tools. URLs are processed in parallel with concurrency control to avoid rate limiting.
*   **When to use:** When you need to check the indexing status of several pages at once — e.g., after a migration, a bulk content publish, or when auditing a section of the site.
*   **What problem it solves:** Eliminates the need to inspect URLs one at a time. One call gives you the indexing status for up to 5 pages, with per-URL error isolation (one failure won't break the batch).

**Parameters:**
| Parameter | Type | Required | Description |
|---|---|---|---|
| `siteUrl` | string | Yes | The URL of the property |
| `inspectionUrls` | string[] | Yes | List of URLs to inspect (max 5) |
| `languageCode` | string | No | Language code for localized results (Google only, default: `en-US`) |
| `engine` | `"google"` \| `"bing"` | No | The search engine to use (default: `google`) |

### `get_pagespeed`
Runs a full PageSpeed Insights analysis, returning Lighthouse scores and Core Web Vitals (CWV).
*   **When to use:** When a page's rankings are dropping despite good content.
*   **What problem it solves:** Identifying performance bottlenecks like LCP (Largest Contentful Paint) issues.

<Tip>
  Set the `PAGESPEED_API_KEY` environment variable for higher quotas (25,000/day vs ~100/day without a key). See [Authentication](/getting-started/authentication#5-pagespeed-insights-optional-api-key) for setup.
</Tip>

## Combining the Tools

The power of this MCP is the ability to combine these. An agent can:
1.  Notice a traffic drop on a specific page using **Analytics**.
2.  Check if it's still indexed using **Inspection** or **Batch Inspection**.
3.  Check if a recent code change slowed it down using **PageSpeed**.
4.  Tell you the exact root cause.

## Example Agent Prompts

#### 1. Debugging indexing issues
> "I just published https://example.com/new-post. Is it indexed? If not, does the URL inspection tool show any errors?"

#### 2. Batch indexing check
> "I just migrated 5 blog posts to new URLs. Can you batch inspect these URLs to check if they're all indexed: /blog/post-1, /blog/post-2, /blog/post-3, /blog/post-4, /blog/post-5?"

#### 3. Performance Audit
> "Check the PageSpeed scores for my top 10 most visited pages on mobile. List any that have an LCP score over 2.5 seconds."

#### 4. Core Web Vitals Check
> "Run a Core Web Vitals report for the homepage and compare the results for mobile vs. desktop."
