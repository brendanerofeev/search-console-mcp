import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ALGORITHM_UPDATES } from "../google/tools/advanced-analytics.js";
import { loadConfig } from "../common/auth/config.js";

/**
 * Register native MCP Resources (resources/list and resources/read) for Search Console MCP.
 * Implements the Model Context Protocol 2026-07-28 Resources specification.
 */
export function registerMcpResources(server: McpServer): void {
  // 1. Google Algorithm Updates Timeline Resource
  server.resource(
    "google-algorithm-updates",
    "seo://algorithm-updates",
    {
      description: "Comprehensive timeline of Google Search Core Updates and Spam Policy updates (2024-2026).",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(ALGORITHM_UPDATES, null, 2),
          mimeType: "application/json",
        },
      ],
    })
  );

  // 2. Connected Properties & Accounts Resource
  server.resource(
    "connected-sites",
    "seo://connected-sites",
    {
      description: "List of configured Google Search Console, Bing Webmaster Tools, and GA4 properties.",
      mimeType: "application/json",
    },
    async (uri) => {
      let accounts: any[] = [];
      try {
        const config = await loadConfig();
        accounts = Object.values(config.accounts).map((acc) => ({
          id: acc.id,
          alias: acc.alias,
          engine: acc.engine,
          websites: acc.websites || [],
          ga4PropertyId: acc.ga4PropertyId,
        }));
      } catch {
        // Fallback if config read fails
      }

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify({ count: accounts.length, accounts }, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }
  );

  // 3. Backward Compatibility Migration Map Resource
  server.resource(
    "backward-compatibility-map",
    "seo://backward-compatibility",
    {
      description: "Migration mapping table for legacy tool names to Search Console MCP v2.0 Fluent Domain Tools.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: `# Search Console MCP v2.0 Tool Migration Map\n\n` +
            `| Legacy Tool Name | v2.0 Fluent Domain Tool | Engine |\n` +
            `| :--- | :--- | :--- |\n` +
            `| \`sites_list\` / \`bing_sites_list\` | \`sites_list\` | All |\n` +
            `| \`analytics_query\` / \`bing_analytics_query\` | \`analytics_query\` | All |\n` +
            `| \`sites_health_check\` / \`bing_sites_health\` | \`site_health_check\` | All |\n` +
            `| \`seo_recommendations\` / \`seo_quick_wins\` | \`seo_audit\` | All |\n` +
            `| \`sitemaps_list\` / \`bing_sitemaps_list\` | \`sitemaps_list\` | Google / Bing |\n` +
            `| \`inspection_inspect\` / \`bing_url_info\` | \`url_inspect\` | Google / Bing |\n` +
            `| \`bing_index_now\` / \`sitemaps_submit\` | \`indexing_submit\` | Google / Bing |\n`,
          mimeType: "text/markdown",
        },
      ],
    })
  );
}
