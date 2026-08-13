import { createServer, IncomingMessage, ServerResponse } from "http";
import { timingSafeEqual } from "crypto";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../utils/logger.js";

/**
 * Constant-time string compare, so a rejected token leaks nothing about how much
 * of it was correct.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Static bearer-token auth for the remote transport.
 *
 * Returns true when the request may proceed. When MCP_AUTH_TOKEN is unset the
 * server is open — acceptable for a loopback stdio/dev run, but it refuses to
 * start unauthenticated in production (see index.ts).
 */
function isAuthorised(req: IncomingMessage): boolean {
  const expected = process.env.MCP_AUTH_TOKEN;
  if (!expected) return true;

  const header = req.headers.authorization ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  // Accept the token in a header too, for clients that cannot set Authorization.
  const alt = (req.headers["x-api-key"] as string | undefined)?.trim() ?? "";
  return (bearer !== "" && safeEqual(bearer, expected)) || (alt !== "" && safeEqual(alt, expected));
}

/**
 * Starts a remote HTTP/SSE transport server implementing the MCP 2026-07-28 Specification.
 * Supports stateless header-based routing (Mcp-Method, Mcp-Name).
 */
export function startSseServer(server: McpServer, port: number = 3000): Promise<{ close: () => void }> {
  const activeTransports = new Map<string, SSEServerTransport>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Method, Mcp-Name");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // /health stays open so container and tunnel health checks work without
    // distributing the token; it exposes no data.
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", activeConnections: activeTransports.size }));
      return;
    }

    if (!isAuthorised(req)) {
      res.writeHead(401, {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer realm="search-console-mcp"',
      });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/sse") {
      // Create new SSE transport endpoint
      const transport = new SSEServerTransport("/messages", res);
      const sessionId = transport.sessionId;
      activeTransports.set(sessionId, transport);

      transport.onclose = () => {
        activeTransports.delete(sessionId);
      };

      await server.connect(transport);
      logger.info(`[MCP SSE] Client connected: ${sessionId}`);
      return;
    }

    if (req.method === "POST" && url.pathname === "/messages") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId || !activeTransports.has(sessionId)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid or expired SSE sessionId" }));
        return;
      }

      const transport = activeTransports.get(sessionId)!;
      await transport.handlePostMessage(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      logger.info(`🚀 Search Console MCP SSE Server listening on http://localhost:${port}/sse`);
      resolve({
        close: () => httpServer.close(),
      });
    });
  });
}
