/**
 * Human-in-the-loop (Phase C) mutation gate.
 *
 * `booking_create` / `booking_cancel` are registered WITHOUT an `execute` (see
 * mcp.ts), so when the model calls one the call surfaces to the client as an
 * un-executed tool invocation. The client renders a confirm card and, on the
 * user's decision, attaches a `{ approved }` result via `addToolResult`, then
 * resubmits the conversation.
 *
 * On that follow-up request, `processApprovedBookings` runs here BEFORE the
 * model generates: it finds gated tool calls the user approved, executes them
 * through the real MCP tool, and rewrites the message part's output from the
 * approval sentinel to the real result (so the model summarizes the outcome).
 * Declined calls are rewritten to a "not performed" note. This is the structural
 * guarantee that no mutation runs without an explicit human click.
 */
import { HITL_TOOLS, type McpSession } from "./mcp.js";

/** Client-provided decision for a gated mutation tool call. */
export interface BookingApproval {
  approved: boolean;
}

export function isBookingApproval(output: unknown): output is BookingApproval {
  return (
    !!output &&
    typeof output === "object" &&
    "approved" in output &&
    typeof (output as { approved: unknown }).approved === "boolean"
  );
}

interface GatedToolPart {
  toolName: string;
  input: unknown;
}

/**
 * If a UI message part is a gated mutation tool call, return its name + input;
 * else null. Handles both static (`tool-<name>`) and dynamic-tool wire shapes.
 */
export function asGatedToolPart(part: unknown): GatedToolPart | null {
  const p = part as { type?: unknown; toolName?: unknown; input?: unknown };
  if (typeof p?.type !== "string") return null;
  let name: string | undefined;
  if (p.type.startsWith("tool-")) name = p.type.slice("tool-".length);
  else if (p.type === "dynamic-tool" && typeof p.toolName === "string") name = p.toolName;
  if (!name || !HITL_TOOLS.has(name)) return null;
  return { toolName: name, input: p.input };
}

/** Note written as the tool result when the user declines a gated mutation. */
export const DECLINED_RESULT = "TOOL_RESULT: the user declined this action; it was not performed.";

/**
 * Execute every gated mutation tool call the user has APPROVED, rewriting each
 * part's output from the approval sentinel to the real tool result (so the model
 * summarizes it). Mutates `messages` in place; returns the number of executions.
 * A part whose output is already a real result (not an approval sentinel) is
 * skipped — so re-sending a conversation never double-books (idempotent).
 */
export async function processApprovedBookings(
  messages: Array<{ role: string; parts: unknown[] }>,
  session: Pick<McpSession, "executeTool">,
): Promise<number> {
  let executed = 0;
  for (const msg of messages) {
    if (msg.role !== "assistant" || !Array.isArray(msg.parts)) continue;
    for (const part of msg.parts) {
      const gated = asGatedToolPart(part);
      if (!gated) continue;
      const target = part as { output?: unknown };
      if (!isBookingApproval(target.output)) continue; // unconfirmed, or already executed
      if (target.output.approved) {
        const { summary } = await session.executeTool(gated.toolName, gated.input);
        target.output = summary;
      } else {
        target.output = DECLINED_RESULT;
      }
      executed++;
    }
  }
  return executed;
}
