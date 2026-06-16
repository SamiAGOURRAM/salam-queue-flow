/**
 * Typed classification of an MCP tool result, so the agent/UI can react to
 * failure modes instead of the model paraphrasing raw errors into a vague
 * apology. All functions here are pure and unit-tested (see outcomes.test.ts).
 *
 * Outcome kinds:
 *  - ok                  tool succeeded with usable data
 *  - no_results          tool succeeded but matched nothing (count === 0)
 *  - backend_unavailable transient/server failure (incl. `fetch failed`) — retryable
 *  - forbidden           caller lacks permission / needs to sign in
 */

export type ToolOutcomeKind = "ok" | "no_results" | "backend_unavailable" | "forbidden";

/** Precedence when a turn calls multiple tools (worst wins). */
const PRECEDENCE: Record<ToolOutcomeKind, number> = {
  forbidden: 3,
  backend_unavailable: 2,
  no_results: 1,
  ok: 0,
};

function codeFromBody(text: string): string | undefined {
  try {
    const p = JSON.parse(text) as { error?: { code?: unknown } };
    const code = p?.error?.code;
    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}

/** Map a single MCP tool result to an outcome. */
export function classifyToolResult(input: { isError: boolean; text: string }): ToolOutcomeKind {
  if (input.isError) {
    const code = codeFromBody(input.text);
    if (code === "AUTHORIZATION_ERROR" || code === "AUTHENTICATION_ERROR") return "forbidden";
    // INTERNAL_ERROR (incl. `fetch failed`), DATABASE_ERROR, unknown → safe/retryable default.
    return "backend_unavailable";
  }

  // Success path.
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.text);
  } catch {
    return "ok"; // plain-text answer, no structured tool data
  }

  if (parsed && typeof parsed === "object") {
    const o = parsed as { success?: unknown; error?: { code?: unknown }; count?: unknown };
    if (o.success === false) {
      const code = typeof o.error?.code === "string" ? o.error.code : undefined;
      return code === "AUTHORIZATION_ERROR" || code === "AUTHENTICATION_ERROR"
        ? "forbidden"
        : "backend_unavailable";
    }
    if (typeof o.count === "number" && o.count === 0) return "no_results";
  }

  return "ok";
}

/** Aggregate per-tool outcomes for the turn (worst wins); undefined if no tool ran. */
export function aggregateOutcomes(outcomes: ToolOutcomeKind[]): ToolOutcomeKind | undefined {
  if (outcomes.length === 0) return undefined;
  return outcomes.reduce((a, b) => (PRECEDENCE[b] > PRECEDENCE[a] ? b : a));
}

/**
 * The text the MODEL should see for a result. Non-ok outcomes get a short,
 * correct instruction (so the model replies appropriately); `ok` returns the
 * original text with any `cards` key removed (cards travel via a side-channel,
 * keeping the branded bookingHref / internal IDs out of the model context).
 */
export function summarizeForModel(kind: ToolOutcomeKind, text: string): string {
  switch (kind) {
    case "forbidden":
      return "TOOL_RESULT: permission denied. Tell the user they need to sign in or lack permission for this; do not retry.";
    case "backend_unavailable":
      return "TOOL_RESULT: this information is temporarily unavailable. Ask the user to try again in a moment; do not invent data.";
    case "no_results":
      return "TOOL_RESULT: no matching results were found. Tell the user plainly and suggest adjusting their search.";
    case "ok": {
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if ("cards" in parsed) {
          delete parsed.cards;
          return JSON.stringify(parsed);
        }
      } catch {
        // plain text — return as-is
      }
      return text;
    }
  }
}
