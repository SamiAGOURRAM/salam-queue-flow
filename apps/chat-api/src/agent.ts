/**
 * The QueueMed chat agent: runs an AI SDK tool-calling loop over the MCP tools
 * and streams plain-text output to the HTTP response.
 *
 * Degrades gracefully:
 *  - no LLM key  -> deterministic mock responder (service still runs/demos)
 *  - MCP down    -> answers without tools and says data actions are unavailable
 */
import { streamText, stepCountIs, type ModelMessage, type ToolSet } from "ai";
import type { Response } from "express";
import { resolveModel } from "./llm.js";
import { createMcpSession, type McpSession } from "./mcp.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { config } from "./config.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function mockReply(lastUserMessage: string): string {
  const q = lastUserMessage.trim();
  return [
    "🤖 (demo mode — no LLM key configured)",
    "",
    q
      ? `I received: “${q}”.`
      : "Hi! I'm the QueueMed assistant.",
    "",
    "Once a GROQ_API_KEY (or another provider key) is set on the chat-api service, I can search clinics, check availability, book appointments, and report your queue position — all through authenticated, permission-checked MCP tools.",
  ].join("\n");
}

export async function streamChatToResponse(opts: {
  messages: ChatMessage[];
  token?: string;
  res: Response;
}): Promise<void> {
  const { messages, token, res } = opts;
  const resolved = resolveModel();

  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Chat-Mode", resolved ? "llm" : "mock");

  // No model configured -> deterministic mock.
  if (!resolved) {
    res.json({ message: mockReply(messages[messages.length - 1]?.content ?? ""), cards: undefined, outcome: undefined });
    return;
  }

  // Best-effort MCP connection; degrade to no-tools if it fails.
  let session: McpSession | null = null;
  let tools: ToolSet = {};
  try {
    session = await createMcpSession(config.mcpUrl, token);
    tools = session.tools;
  } catch (error) {
    console.warn("[chat-api] MCP unavailable, continuing without tools:", error);
  }

  try {
    const result = streamText({
      model: resolved.model,
      system: SYSTEM_PROMPT,
      messages: messages as ModelMessage[],
      tools,
      stopWhen: stepCountIs(config.maxSteps),
    });

    // Await the full text (the tool loop runs to completion, populating any
    // side-channeled cards on the session), then return both as one JSON envelope.
    const message = await result.text;
    res.json({ message, cards: session?.getCollectedCards(), outcome: session?.getOutcome() });
  } catch (error) {
    console.error("[chat-api] generation failed:", error);
    if (!res.headersSent) {
      res.status(502).json({
        message: "⚠️ Sorry, I couldn't complete that request. Please try again.",
        cards: undefined,
        outcome: "backend_unavailable",
      });
    }
  } finally {
    if (session) {
      await session.close().catch(() => undefined);
    }
  }
}
