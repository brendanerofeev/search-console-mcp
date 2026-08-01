import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { startSseServer } from "../src/transport/http.js";
import http from "http";

describe("Remote Stateless HTTP/SSE Transport Adaptor (MCP 2026-07-28 Spec)", () => {
  it("starts HTTP/SSE server and responds to /health check", async () => {
    const server = new McpServer({
      name: "test-sse-server",
      version: "1.0.0",
    });

    const instance = await startSseServer(server, 3456);

    const healthRes = await new Promise<{ status: number; body: any }>((resolve) => {
      http.get("http://localhost:3456/health", (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => resolve({ status: res.statusCode || 500, body: JSON.parse(raw) }));
      });
    });

    expect(healthRes.status).toBe(200);
    expect(healthRes.body.status).toBe("ok");
    expect(healthRes.body).toHaveProperty("activeConnections");

    instance.close();
  });

  it("returns 404 for unknown endpoints", async () => {
    const server = new McpServer({
      name: "test-sse-server",
      version: "1.0.0",
    });

    const instance = await startSseServer(server, 3457);

    const res = await new Promise<{ status: number }>((resolve) => {
      http.get("http://localhost:3457/unknown-path", (res) => {
        resolve({ status: res.statusCode || 500 });
      });
    });

    expect(res.status).toBe(404);

    instance.close();
  });
});
