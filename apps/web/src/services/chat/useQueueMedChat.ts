/**
 * useQueueMedChat — the web client's binding to the chat-api agent.
 *
 * AI SDK v5 `useChat` over a `DefaultChatTransport` that attaches the Supabase
 * session JWT per request (so the MCP tools enforce per-user RBAC). The FULL UI
 * messages are sent (Phase C) — including tool calls and their approval results —
 * so the server can run the human-in-the-loop booking gate.
 *
 * Response is a typed UI message stream: text streams token-by-token; discovery
 * `cards` / aggregate `outcome` arrive as typed `data-cards` / `data-outcome`
 * parts; and `booking_create` / `booking_cancel` arrive as un-executed tool
 * calls that the UI confirms before the server runs them.
 */
import { useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import type { DiscoveryCards } from "@queuemed/core";
import { supabase } from "@/integrations/supabase/client";

/** Aggregate tool-outcome classification mirrored from chat-api `outcomes.ts`. */
export type ToolOutcome = "ok" | "no_results" | "backend_unavailable" | "forbidden";

/** Client-provided decision for a gated mutation tool call. */
export interface BookingDecision {
  approved: boolean;
}

/** Names of the human-in-the-loop mutation tools (must match chat-api HITL_TOOLS). */
export const HITL_TOOL_NAMES = ["booking_create", "booking_cancel"] as const;
export type HitlToolName = (typeof HITL_TOOL_NAMES)[number];

/** Tool typing so `addToolResult` is type-safe for the gated booking tools. */
type QueueMedTools = {
  booking_create: { input: Record<string, unknown>; output: BookingDecision };
  booking_cancel: { input: Record<string, unknown>; output: BookingDecision };
};

/** The typed UI message exchanged with chat-api. */
export type QueueMedUIMessage = UIMessage<never, { cards: DiscoveryCards; outcome: ToolOutcome }, QueueMedTools>;

/** A surfaced booking tool call awaiting (or past) the user's confirmation. */
export interface BookingCall {
  toolCallId: string;
  toolName: HitlToolName;
  input: Record<string, unknown>;
  /** True once the user has decided (output present). */
  decided: boolean;
  /** The user's decision, if decided. */
  approved?: boolean;
}

/**
 * The masked-error message chat-api emits for a *transient* generation failure
 * (the only one worth a silent retry). Capacity/rate-limit uses a different
 * message and is NOT retried. Keep in sync with `agent.ts` RETRYABLE_ERROR.
 */
const RETRYABLE_ERROR = "⚠️ Sorry, I couldn't complete that request. Please try again.";

function chatApiUrl(): string {
  const base = (import.meta.env.VITE_CHAT_API_URL || "http://localhost:8787").replace(/\/$/, "");
  return `${base}/api/chat`;
}

async function authToken(): Promise<string | undefined> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token;
  } catch {
    return undefined;
  }
}

function isHitlTool(name: string): name is HitlToolName {
  return (HITL_TOOL_NAMES as readonly string[]).includes(name);
}

/** If a UI message part is a (gated) booking tool call, describe it; else null. */
function asBookingCall(part: unknown): BookingCall | null {
  const p = part as { type?: unknown; toolName?: unknown; toolCallId?: unknown; input?: unknown; output?: unknown };
  if (typeof p?.type !== "string") return null;
  let name: string | undefined;
  if (p.type.startsWith("tool-")) name = p.type.slice("tool-".length);
  else if (p.type === "dynamic-tool" && typeof p.toolName === "string") name = p.toolName;
  if (!name || !isHitlTool(name)) return null;
  const decision = p.output as BookingDecision | undefined;
  const decided = !!decision && typeof decision === "object" && "approved" in decision;
  return {
    toolCallId: String(p.toolCallId ?? ""),
    toolName: name,
    input: (p.input ?? {}) as Record<string, unknown>,
    decided,
    approved: decided ? decision!.approved : undefined,
  };
}

/** Read the renderable content out of a UI message (text + data parts + booking calls). */
export function readMessage(m: QueueMedUIMessage): {
  text: string;
  cards?: DiscoveryCards;
  outcome?: ToolOutcome;
  bookingCalls: BookingCall[];
} {
  let text = "";
  let cards: DiscoveryCards | undefined;
  let outcome: ToolOutcome | undefined;
  const bookingCalls: BookingCall[] = [];
  for (const part of m.parts) {
    if (part.type === "text") text += part.text;
    else if (part.type === "data-cards") cards = part.data;
    else if (part.type === "data-outcome") outcome = part.data;
    else {
      const booking = asBookingCall(part);
      if (booking) bookingCalls.push(booking);
    }
  }
  return { text, cards, outcome, bookingCalls };
}

/** Bind `useChat` to the QueueMed chat-api with JWT-forwarding transport + HITL. */
export function useQueueMedChat() {
  const transport = useMemo(
    () =>
      new DefaultChatTransport<QueueMedUIMessage>({
        api: chatApiUrl(),
        prepareSendMessagesRequest: async ({ messages }) => {
          const token = await authToken();
          return {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            // Send the FULL UI messages (tool calls + approval results) so the
            // server can run the HITL booking gate.
            body: { messages },
          };
        },
      }),
    [],
  );

  const chat = useChat<QueueMedUIMessage>({
    transport,
    // After the user confirms a booking (addToolResult completes the tool call),
    // auto-resubmit so the server executes it and the model summarizes.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  // Resilience: Groq intermittently emits an invalid tool call (provider 400) —
  // transient, non-deterministic, almost always fine on a re-run. A silent
  // server-side retry is incompatible with live streaming, so we retry on the
  // client: on a *transient* error, regenerate once per user turn. Capacity /
  // rate-limit errors use a different message and are NOT retried.
  const retriedTurns = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (chat.status !== "error") return;
    if (chat.error?.message !== RETRYABLE_ERROR) return;
    let lastUserId: string | undefined;
    for (const m of chat.messages) if (m.role === "user") lastUserId = m.id;
    if (!lastUserId || retriedTurns.current.has(lastUserId)) return;
    retriedTurns.current.add(lastUserId);
    void chat.regenerate();
  }, [chat.status, chat.messages, chat]);

  return chat;
}
