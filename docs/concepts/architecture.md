---
title: "Architecture"
description: "How the Search Console MCP server is built."
---

The `search-console-mcp` server acts as a middle layer between your AI agent and the Google Search Console APIs.

## Logic Layers

### 1. The Client (e.g., Claude)
The agent initiates a request. It doesn't need to know the GSC API schema; it only needs to know the tools exposed by the MCP.

### 2. The MCP Server (Middleware)
This is where the magic happens.
*   **Tool Registration:** Defines the JSON schema for tools like `analytics_time_series`.
*   **Request Handlers:** Receives inputs, validates them with **Zod**, and routes them to the correct tool logic.
*   **SEO Intelligence Engine:** Performs the heavy lifting—calculating rolling averages, standard deviations, and trend analysis.

### 3. API Layer
The server communicates with multiple upstream providers:
*   **Google Search Console API:** Performance data and site management.
*   **Bing Webmaster Tools API:** Search data, crawl issues, and IndexNow.
*   **Google Analytics 4 API:** Real user behavior and conversion data.
*   **PageSpeed Insights API:** Performance and Lighthouse data (supports optional `PAGESPEED_API_KEY` for higher quota).

## Data Flow

```mermaid
graph LR
    A[Agent] -- JSON-RPC --> B[MCP Server]
    B -- Intelligence Tools --> C[SEO Engine]
    C -- GSC API --> D[Google Search Console]
    D -- Data --> C
    C -- Insights --> B
    B -- Structured Markdown/JSON --> A
```

## Security Design

*   **Local Execution:** The server runs on your machine (or your own cloud instance). Your data never touches our servers.
*   **Read-Only Defaults:** While we support management tools (adding sites), most analysis tools are strictly read-only by design.
*   **Deterministic Output:** We prefer returning structured data or markdown tables that the agent can read and process reliably.
