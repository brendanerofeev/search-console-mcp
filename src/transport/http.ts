import { createServer, IncomingMessage, ServerResponse } from "http";
import { timingSafeEqual } from "crypto";
import { readFile } from "fs/promises";
import { join, extname, normalize } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { handleApi } from "../web/api.js";
import {
  uiEnabled, hasSession, passwordMatches, createSession, sessionCookie, clearCookie,
} from "../web/auth.js";
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

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "../web/public");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/** Read a JSON request body, capped so a large POST cannot exhaust memory. */
async function readJsonBody(req: IncomingMessage, limit = 1_000_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("Request body too large");
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

/** Serve a static asset from the UI bundle, refusing to escape PUBLIC_DIR. */
async function serveStatic(res: ServerResponse, pathname: string): Promise<boolean> {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  // normalize() collapses ../ before we join, so a crafted path cannot walk out.
  const target = join(PUBLIC_DIR, normalize(rel));
  if (!target.startsWith(PUBLIC_DIR)) return false;
  try {
    const data = await readFile(target);
    res.writeHead(200, {
      "Content-Type": MIME[extname(target)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
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

    // ---- Reporting UI (separate credential from the MCP bearer token) ----
    if (uiEnabled()) {
      if (req.method === "POST" && url.pathname === "/login") {
        const body = (await readJsonBody(req)) as { password?: string } | undefined;
        if (body?.password && passwordMatches(body.password)) {
          sendJson(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(createSession()) });
        } else {
          // Uniform delay-free 401; the password check itself is constant-time.
          sendJson(res, 401, { error: "Invalid password" });
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/logout") {
        sendJson(res, 200, { ok: true }, { "Set-Cookie": clearCookie() });
        return;
      }

      if (url.pathname.startsWith("/api/")) {
        // The UI session OR the MCP bearer token may call the API, so scripts
        // and the dashboard share one surface.
        if (!hasSession(req) && !isAuthorised(req)) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
        try {
          const body = req.method === "POST" ? await readJsonBody(req) : undefined;
          const result = await handleApi(
            url.pathname.slice(4),
            url.searchParams,
            req.method ?? "GET",
            body
          );
          sendJson(res, result.status, result.body);
        } catch (e) {
          logger.error(`[UI API] ${(e as Error).message}`);
          sendJson(res, 500, { error: (e as Error).message });
        }
        return;
      }

      // Static assets. index.html is public because the app itself renders the
      // login form; every data path above is guarded.
      if (req.method === "GET" && !url.pathname.startsWith("/sse") && !url.pathname.startsWith("/messages")) {
        if (await serveStatic(res, url.pathname)) return;
      }
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
