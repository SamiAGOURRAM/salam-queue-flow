/**
 * QueueMed chat-api — HTTP entry point.
 *
 * POST /api/chat   { messages: [{ role, content }] }  +  Authorization: Bearer <supabase-jwt>
 *                  -> streamed text/plain assistant reply
 * GET  /health
 */
import express, { type Request, type Response } from "express";
import { streamChatToResponse, type ChatMessage } from "./agent.js";
import { resolveModel } from "./llm.js";
import { config } from "./config.js";

function extractBearerToken(req: Request): string | undefined {
  const header = req.headers["authorization"];
  if (typeof header === "string" && header.length > 0) {
    return header.startsWith("Bearer ") ? header.slice(7) : header;
  }
  return undefined;
}

function isValidMessages(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (m) =>
        !!m &&
        typeof m === "object" &&
        (m as ChatMessage).role &&
        ["user", "assistant"].includes((m as ChatMessage).role) &&
        typeof (m as ChatMessage).content === "string",
    )
  );
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  const origin = config.corsOrigins;
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (origin !== "*") res.header("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get("/health", (_req, res) => {
  const model = resolveModel();
  res.json({
    status: "ok",
    service: "queuemed-chat-api",
    mode: model ? "llm" : "mock",
    provider: model?.label ?? null,
    mcpUrl: config.mcpUrl,
  });
});

app.post("/api/chat", async (req: Request, res: Response) => {
  const messages = req.body?.messages;
  if (!isValidMessages(messages) || messages.length === 0) {
    res.status(400).json({ error: "Body must be { messages: [{ role, content }] } with at least one message." });
    return;
  }

  const token = extractBearerToken(req);
  try {
    await streamChatToResponse({ messages, token, res });
  } catch (error) {
    console.error("[chat-api] /api/chat handler error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.end();
    }
  }
});

app.listen(config.port, () => {
  const model = resolveModel();
  console.log(
    `[chat-api] listening on :${config.port} | mode=${model ? "llm" : "mock"}` +
      `${model ? ` (${model.label})` : ""} | mcp=${config.mcpUrl}`,
  );
});
