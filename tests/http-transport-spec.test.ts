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

    const instance = await startSseServer(() => server, 3456);

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

  it("handles GET /sse connection and POST /messages with valid sessionId", async () => {
    const server = new McpServer({
      name: "test-sse-server",
      version: "1.0.0",
    });

    const instance = await startSseServer(() => server, 3460);

    let sseReq: http.ClientRequest;
    const sessionId = await new Promise<string>((resolve) => {
      sseReq = http.get("http://localhost:3460/sse", (res) => {
        res.on("data", (chunk) => {
          const str = chunk.toString();
          if (str.includes("event: endpoint")) {
            const match = str.match(/sessionId=([a-f0-9-]+)/);
            if (match) {
              resolve(match[1]);
            }
          }
        });
      });
    });

    expect(sessionId).toBeDefined();

    // POST message to active sessionId
    const postResStatus = await new Promise<number>((resolve) => {
      const postReq = http.request(
        `http://localhost:3460/messages?sessionId=${sessionId}`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
        (res) => resolve(res.statusCode || 500)
      );
      postReq.write(JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }));
      postReq.end();
    });

    expect(postResStatus).toBe(202);

    sseReq!.destroy();
    instance.close();
  });

  it("handles OPTIONS preflight request with 204 No Content", async () => {
    const server = new McpServer({
      name: "test-sse-server",
      version: "1.0.0",
    });

    const instance = await startSseServer(() => server, 3458);

    const res = await new Promise<{ status: number }>((resolve) => {
      const req = http.request(
        "http://localhost:3458/sse",
        { method: "OPTIONS" },
        (res) => resolve({ status: res.statusCode || 500 })
      );
      req.end();
    });

    expect(res.status).toBe(204);
    instance.close();
  });

  it("returns 400 Bad Request for POST /messages with missing or invalid sessionId", async () => {
    const server = new McpServer({
      name: "test-sse-server",
      version: "1.0.0",
    });

    const instance = await startSseServer(() => server, 3459);

    const res = await new Promise<{ status: number; body: any }>((resolve) => {
      const req = http.request(
        "http://localhost:3459/messages?sessionId=invalid_123",
        { method: "POST", headers: { "Content-Type": "application/json" } },
        (res) => {
          let raw = "";
          res.on("data", (chunk) => (raw += chunk));
          res.on("end", () => resolve({ status: res.statusCode || 500, body: JSON.parse(raw) }));
        }
      );
      req.write(JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }));
      req.end();
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid or expired SSE sessionId");
    instance.close();
  });

  it("returns 404 for unknown endpoints", async () => {
    const server = new McpServer({
      name: "test-sse-server",
      version: "1.0.0",
    });

    const instance = await startSseServer(() => server, 3457);

    const res = await new Promise<{ status: number }>((resolve) => {
      http.get("http://localhost:3457/unknown-path", (res) => {
        resolve({ status: res.statusCode || 500 });
      });
    });

    expect(res.status).toBe(404);
    instance.close();
  });

  // Two regressions in one test.
  //
  // 1. A shared McpServer capped the process at ONE client and threw "Already
  //    connected to a transport" on the second, which — unhandled inside the
  //    http callback — took the whole process down. startSseServer takes a
  //    FACTORY and mints a server per request, so this must stay green.
  // 2. /mcp is stateless. It used to mint a session id and hold the transport
  //    in a process-local Map, which meant every restart invalidated every
  //    client ("Server not initialized") and a second replica could not serve
  //    an existing client. A request must now stand alone.
  it("serves concurrent /mcp requests statelessly, each with its own server", async () => {
    const port = 3461;
    const instance = await startSseServer(() => {
      const server = new McpServer({ name: "test-mcp-server", version: "1.0.0" });
      // A registered tool, so tools/list exercises the real path rather than
      // returning "Method not found" from a server with no capabilities.
      server.registerTool(
        "ping",
        { description: "Test tool", inputSchema: {} },
        async () => ({ content: [{ type: "text" as const, text: "pong" }] }),
      );
      return server;
    }, port);

    const post = async (body: unknown, sessionId?: string) =>
      fetch(`http://localhost:${port}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-06-18",
          ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
        },
        body: JSON.stringify(body),
      });

    const initialize = async (clientName: string) => {
      const res = await post({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: clientName, version: "1.0.0" },
        },
      });
      expect(res.status).toBe(200);
      return res;
    };

    // Concurrency: three clients at once, none of them killing the others.
    const opened = await Promise.all(
      ["client-a", "client-b", "client-c"].map(initialize),
    );
    expect(opened.map((r) => r.status)).toEqual([200, 200, 200]);

    // Stateless: no session id is handed out, so there is nothing for a restart
    // or a second replica to invalidate.
    expect(opened.every((r) => r.headers.get("mcp-session-id") === null)).toBe(true);

    // And a request with no prior initialize and no session header still works.
    // Under the old session-based transport this returned "Server not
    // initialized" — the exact failure every client hit after a deploy.
    const cold = await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    expect(cold.status).toBe(200);
    const body = await cold.json();
    expect(body.error, JSON.stringify(body.error)).toBeUndefined();
    expect(Array.isArray(body.result?.tools)).toBe(true);

    instance.close();
  });
});
