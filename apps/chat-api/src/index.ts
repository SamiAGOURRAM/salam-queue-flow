/**
 * QueueMed chat-api — HTTP entry point.
 *
 * POST /api/chat   { messages: [{ role, content }] }  +  Authorization: Bearer <supabase-jwt>
 *                  -> AI SDK v5 UI message stream (text deltas + data-cards / data-outcome parts)
 * GET  /health
 */
import express, { type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { streamChatToResponse, type QueueMedUIMessage } from "./agent.js";
import { resolveModel } from "./llm.js";
import { config } from "./config.js";
import { validateToken, assertAuthConfigured } from "./auth.js";

function extractBearerToken(req: Request): string | undefined {
  const header = req.headers["authorization"];
  if (typeof header === "string" && header.length > 0) {
    return header.startsWith("Bearer ") ? header.slice(7) : header;
  }
  return undefined;
}

/**
 * Validate the AI SDK v5 UI message shape the web client sends: each message has
 * a role and a `parts` array. (Phase C: the full UI messages — including tool
 * calls + their approval results — must reach the server for the HITL gate, so
 * we no longer accept the old flattened `{ role, content }` form.)
 */
function isValidMessages(value: unknown): value is QueueMedUIMessage[] {
  return (
    Array.isArray(value) &&
    value.every((m) => {
      const msg = m as { role?: unknown; parts?: unknown };
      return (
        !!msg &&
        typeof msg === "object" &&
        typeof msg.role === "string" &&
        ["user", "assistant", "system"].includes(msg.role) &&
        Array.isArray(msg.parts)
      );
    })
  );
}

const app = express();
app.use(express.json({ limit: "1mb" }));

// ── CORS ──────────────────────────────────────────────────
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

// Fail fast: crash at startup if auth is unconfigured in production.
assertAuthConfigured();

// Warn in non-production when auth is not configured (requests will 401 unless
// ALLOW_UNAUTHENTICATED=true is explicitly set for local dev).
if (!config.supabaseUrl) {
  console.warn(
    "[chat-api] WARNING: SUPABASE_URL not set — auth validation is disabled. " +
      (config.allowUnauthenticated
        ? "ALLOW_UNAUTHENTICATED=true → requests allowed WITHOUT authentication (dev only)."
        : "Requests will be rejected (401). Set SUPABASE_URL + SUPABASE_ANON_KEY, or ALLOW_UNAUTHENTICATED=true for local dev."),
  );
}

// ── Rate limiting ─────────────────────────────────────────
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 30,             // max 30 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

const healthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Routes ────────────────────────────────────────────────
app.get("/health", healthLimiter, (_req, res) => {
  const model = resolveModel();
  res.json({
    status: "ok",
    service: "queuemed-chat-api",
    mode: model ? "llm" : "mock",
    provider: model?.label ?? null,
    mcpUrl: config.mcpUrl,
  });
});

app.post("/api/chat", chatLimiter, async (req: Request, res: Response) => {
  // ── Auth gate ───────────────────────────────────────────
  // Validate the caller's Supabase JWT. When SUPABASE_URL is
  // unset (local dev), validation is skipped with a warning.
  const token = extractBearerToken(req);
  const auth = await validateToken(token);
  if (!auth.authenticated) {
    res.status(401).json({ error: auth.error ?? "Unauthorized" });
    return;
  }

  const messages = req.body?.messages;
  if (!isValidMessages(messages) || messages.length === 0) {
    res.status(400).json({ error: "Body must be { messages: [{ role, content }] } with at least one message." });
    return;
  }

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
