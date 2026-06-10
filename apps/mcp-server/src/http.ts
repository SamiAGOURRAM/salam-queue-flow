/**
 * QueueMed MCP Server — Streamable HTTP entry point.
 *
 * Exposes the same MCP server over HTTP so it can be consumed by network
 * clients (the chat-api agent backend) and deployed independently. Each request
 * is stateless and runs inside an auth context derived from the incoming
 * `Authorization: Bearer <supabase-jwt>` header, so RBAC guardrails are enforced
 * per caller.
 *
 * The stdio entry point (index.ts) remains for desktop MCP clients.
 */

import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMCPServer } from "./server.js";
import { config } from "./config.js";
import { runWithAuthToken } from "./middleware/auth/requestContext.js";
import { logger } from "./utils/logger.js";

function extractBearerToken(req: Request): string | undefined {
  const header = req.headers["authorization"];
  if (typeof header === "string" && header.length > 0) {
    return header.startsWith("Bearer ") ? header.slice(7) : header;
  }
  return undefined;
}

async function main(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Permissive CORS — the MCP endpoint is called server-to-server by chat-api,
  // but allow direct browser/inspector use in dev too.
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Expose-Headers", "Mcp-Session-Id");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "queuemed-mcp", transport: "streamable-http" });
  });

  // Stateless Streamable HTTP: a fresh server + transport per request.
  app.post("/mcp", async (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    const server = createMCPServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await runWithAuthToken(token, () => transport.handleRequest(req, res, req.body));
    } catch (error) {
      logger.error("MCP HTTP request failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // Streamable HTTP also expects GET (for server-initiated streams). In stateless
  // mode we don't support it; respond per spec.
  app.get("/mcp", (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed (stateless server)" },
      id: null,
    });
  });

  const port = config.serverPort;
  app.listen(port, () => {
    logger.info("QueueMed MCP Server running on Streamable HTTP", {
      port,
      endpoint: `/mcp`,
      environment: config.nodeEnv,
    });
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
