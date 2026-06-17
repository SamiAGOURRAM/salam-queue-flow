/**
 * The QueueMed chat agent: runs an AI SDK tool-calling loop over the MCP tools
 * and streams a typed AI SDK v5 UI message stream to the HTTP response.
 *
 * Transport (Phase B): real token streaming via `createUIMessageStream` +
 * `pipeUIMessageStreamToResponse` (Express). Text streams incrementally; the
 * structured discovery `cards` and the aggregate `outcome` ride the SAME stream
 * as typed data parts (`data-cards` / `data-outcome`) — no more JSON envelope,
 * no model-visible IDs/hrefs.
 *
 * Degrades gracefully:
 *  - no LLM key  -> deterministic mock responder, emitted as a text part
 *  - MCP down    -> answers without tools and says data actions are unavailable
 *  - transient generation error -> friendly message via the stream's onError
 */
import {
  streamText,
  stepCountIs,
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  convertToModelMessages,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";
import type { Response } from "express";
import { resolveModel } from "./llm.js";
import { createMcpSession, type McpSession } from "./mcp.js";
import { processApprovedBookings } from "./hitl.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { config } from "./config.js";
import type { ToolOutcomeKind } from "./outcomes.js";

/**
 * The typed UI message for this agent: no metadata, and two custom data parts —
 * `data-cards` (structured discovery cards, validated on the web side against the
 * `@queuemed/core` `DiscoveryCards` type) and `data-outcome` (the aggregate
 * tool-outcome classification). chat-api stays decoupled from core, so `cards`
 * is `unknown` here and shaped by the client.
 */
export type QueueMedUIMessage = UIMessage<never, { cards: unknown; outcome: ToolOutcomeKind }>;

/**
 * User-facing messages for a masked generation failure (raw provider errors
 * never reach the user). The web client treats RETRYABLE_ERROR as the only
 * signal to auto-retry — keep this string in sync with `useQueueMedChat.ts`.
 */
export const RETRYABLE_ERROR = "⚠️ Sorry, I couldn't complete that request. Please try again.";
const CAPACITY_ERROR = "⚠️ The assistant is at capacity right now. Please try again in a few minutes.";

/** Map a provider error to a friendly message; rate-limit/quota is non-retryable "capacity". */
function friendlyError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (/rate.?limit|quota|tokens per day|\bTPD\b|429|capacity|too many requests/i.test(msg)) {
    return CAPACITY_ERROR;
  }
  return RETRYABLE_ERROR;
}

/**
 * Stream one agent turn into the UI message writer: real token streaming via
 * `writer.merge(result.toUIMessageStream())`, then — once generation completes —
 * attach the structured cards/outcome captured on the MCP session as typed data
 * parts. `await result.finishReason` waits for the tool loop to finish (and
 * surfaces a transient generation error to the stream's `onError`) without
 * consuming the merged stream (it is an independent, teed promise).
 *
 * Note: real token streaming and a silent server-side retry on Groq's transient
 * tool-call 400 are mutually exclusive for a single generation (you cannot
 * un-send a partial stream), so the bounded retry is dropped on this path; the
 * transient error degrades to a friendly message via `onError` instead.
 */
async function streamAgentInto(
  model: LanguageModel,
  messages: ModelMessage[],
  tools: ToolSet,
  session: McpSession | null,
  writer: UIMessageStreamWriter<QueueMedUIMessage>,
): Promise<void> {
  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages,
    tools,
    stopWhen: stepCountIs(config.maxSteps),
  });

  // Mask provider errors at the merge boundary: a transient Groq tool-call 400
  // ("Failed to call a function …") is forwarded through the merged stream, and
  // toUIMessageStream's default handler would surface the RAW provider body to
  // the user. Map it to a friendly message here (this is the only handler that
  // sees a merged-stream error — createUIMessageStream's onError does not).
  writer.merge(
    result.toUIMessageStream({
      onError: (error) => {
        console.error("[chat-api] generation failed:", error);
        return friendlyError(error);
      },
    }),
  );

  try {
    await result.finishReason;
  } catch {
    // Generation failed; the friendly message was already surfaced via the
    // merged stream's onError above. No cards/outcome to attach.
    return;
  }

  const cards = session?.getCollectedCards();
  if (cards) writer.write({ type: "data-cards", data: cards });
  const outcome = session?.getOutcome();
  if (outcome) writer.write({ type: "data-outcome", data: outcome });
}

/** Concatenated text of the most recent user message in a UI message list. */
function lastUserText(messages: QueueMedUIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    return m.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ");
  }
  return "";
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

/** Emit a plain string as a single text part on the UI message stream. */
function writeText(writer: UIMessageStreamWriter<QueueMedUIMessage>, text: string): void {
  const id = "txt-0";
  writer.write({ type: "text-start", id });
  writer.write({ type: "text-delta", id, delta: text });
  writer.write({ type: "text-end", id });
}

export async function streamChatToResponse(opts: {
  messages: QueueMedUIMessage[];
  token?: string;
  res: Response;
}): Promise<void> {
  const { messages, token, res } = opts;
  const resolved = resolveModel();

  res.setHeader("X-Chat-Mode", resolved ? "llm" : "mock");

  // No model configured -> deterministic mock, emitted as a text part so the
  // web client consumes both modes through the same UI message stream.
  if (!resolved) {
    const stream = createUIMessageStream<QueueMedUIMessage>({
      execute: ({ writer }) => writeText(writer, mockReply(lastUserText(messages))),
    });
    pipeUIMessageStreamToResponse({ response: res, stream });
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

  const stream = createUIMessageStream<QueueMedUIMessage>({
    execute: async ({ writer }) => {
      // HITL gate: execute any booking the user just approved (rewriting the
      // tool result in-place) BEFORE the model generates. No session -> no
      // approved mutation can run (the executor is unreachable).
      if (session) {
        const executed = await processApprovedBookings(messages, session);
        if (executed > 0) console.log(`[chat-api] HITL: executed ${executed} approved mutation(s)`);
      }
      const modelMessages = convertToModelMessages(messages, { ignoreIncompleteToolCalls: true });
      await streamAgentInto(resolved.model, modelMessages, tools, session, writer);
    },
    onError: (error) => {
      // Fallback for errors thrown in execute (e.g. MCP wiring). Merged-stream
      // generation errors are masked inside streamAgentInto's toUIMessageStream.
      console.error("[chat-api] stream execute failed:", error);
      return friendlyError(error);
    },
    onFinish: () => {
      if (session) void session.close().catch(() => undefined);
    },
  });

  pipeUIMessageStreamToResponse({ response: res, stream });
}
