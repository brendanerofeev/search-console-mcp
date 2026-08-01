import { describe, it, expect, vi } from "vitest";
import { registerMcpPrompts } from "../src/prompts/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("Native MCP Prompts (MCP 2026-07-28 Spec)", () => {
  it("registers all 4 v2.0 native MCP Prompts on server", () => {
    const mockServer = {
      prompt: vi.fn(),
    };

    registerMcpPrompts(mockServer as unknown as McpServer);

    const calls = mockServer.prompt.mock.calls;
    const registeredNames = calls.map((c: any) => c[0]);

    expect(registeredNames).toContain("seo_traffic_detective");
    expect(registeredNames).toContain("seo_striking_distance");
    expect(registeredNames).toContain("seo_cannibalization_audit");
    expect(registeredNames).toContain("seo_compare_google_bing");
  });

  it("generates correct message content for seo_traffic_detective prompt", () => {
    const mockServer = {
      prompt: vi.fn(),
    };

    registerMcpPrompts(mockServer as unknown as McpServer);

    const call = mockServer.prompt.mock.calls.find((c: any) => c[0] === "seo_traffic_detective");
    expect(call).toBeDefined();

    const handler = call[2];
    const result = handler({ siteUrl: "https://example.com", days: "14" });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain("https://example.com");
    expect(result.messages[0].content.text).toContain("14");
    expect(result.messages[0].content.text).toContain("site_health_check");
  });

  it("generates correct message content for seo_striking_distance prompt", () => {
    const mockServer = {
      prompt: vi.fn(),
    };

    registerMcpPrompts(mockServer as unknown as McpServer);

    const call = mockServer.prompt.mock.calls.find((c: any) => c[0] === "seo_striking_distance");
    const handler = call[2];
    const result = handler({ siteUrl: "https://example.com" });
    expect(result.messages[0].content.text).toContain("striking distance");
    expect(result.messages[0].content.text).toContain("500");
  });

  it("generates correct message content for seo_cannibalization_audit prompt", () => {
    const mockServer = {
      prompt: vi.fn(),
    };

    registerMcpPrompts(mockServer as unknown as McpServer);

    const call = mockServer.prompt.mock.calls.find((c: any) => c[0] === "seo_cannibalization_audit");
    const handler = call[2];
    const result = handler({ siteUrl: "https://example.com" });
    expect(result.messages[0].content.text).toContain("cannibalization");
  });

  it("generates correct message content for seo_compare_google_bing prompt", () => {
    const mockServer = {
      prompt: vi.fn(),
    };

    registerMcpPrompts(mockServer as unknown as McpServer);

    const call = mockServer.prompt.mock.calls.find((c: any) => c[0] === "seo_compare_google_bing");
    const handler = call[2];
    const result = handler({ siteUrl: "https://example.com", days: "30" });
    expect(result.messages[0].content.text).toContain("Google Search Console and Bing Webmaster Tools");
  });
});
