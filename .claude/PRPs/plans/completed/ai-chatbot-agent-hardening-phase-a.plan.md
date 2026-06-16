# Plan: AI Chatbot Agent Hardening — Phase A (Structured Tool-Outcomes + Evals)

## Summary
Introduce a typed `ToolOutcome` classification at the chat-api MCP-tool boundary so the agent (and, later, the UI) can distinguish **ok / no_results / backend_unavailable / forbidden** instead of letting the model paraphrase raw errors into a vague apology. Add a compact model-facing summary per outcome (stops dumping raw tool JSON — incl. `bookingHref`/IDs — into the model context). Eval-first: the pure classifier + summarizer are unit-tested before they are wired in.

## User Story
As a patient, when a chat tool fails because the backend is down, I want the assistant to tell me it's a temporary glitch to retry — not the same "no clinics found" it says when there genuinely are none — so I'm not misled.

## Problem → Solution
- **Problem:** `mcp.ts` returns the tool's raw text to the model and only side-channels cards; a `fetch failed` (backend down), an empty result, and an `AUTHORIZATION_ERROR` are indistinguishable downstream → one generic apology, no retry, no measurability.
- **Solution:** a pure `classifyToolResult()` mapping `{ isError, text }` → `ToolOutcomeKind`, a pure `summarizeForModel()` giving the model a short correct sentence per non-ok outcome (and stripping `cards` from `ok` text), aggregation across multi-tool turns, surfaced on the `McpSession` and added to the agent's JSON envelope. Web rendering is **Phase B**.

## Metadata
- **Complexity:** Small (2 new files, 2 edits; < 150 LOC).
- **Source:** `.claude/PRPs/prds/ai-chatbot-agent-hardening.prd.md` — Phase A.
- **Estimated files:** 4 (2 CREATE, 2 UPDATE). No web changes.

## Mandatory Reading
| Priority | File | Lines | Why |
|----------|------|-------|-----|
| P0 | apps/chat-api/src/mcp.ts | 21-96 | The boundary we change: `extractText`, `parseCards`, per-session `collectedCards`, the `tool({ execute })` wrapper, `McpSession` shape |
| P0 | apps/mcp-server/src/utils/errors.ts | 104-145 | EXACT MCP error body shape `{success:false,error:{code,message}}` + which codes exist |
| P0 | apps/mcp-server/src/tools/index.ts | 135-193 | How success/error results are produced: success → `{content:[{text:JSON.stringify(result)}]}` (no isError); error → `formatErrorResponse` (isError:true) |
| P1 | apps/chat-api/src/agent.ts | 44-86 | Envelope return sites (mock path + llm path + error path) to add `outcome` |
| P1 | apps/chat-api/src/mcp.test.ts | 1-23 | Test file style to mirror for the eval suite |
| P2 | apps/mcp-server/src/middleware/auth/roleGuard.ts | 192-201 | Confirms denied tool → `AuthorizationError` (code `AUTHORIZATION_ERROR`) for BOTH unauth + wrong-role |

## Key Facts (captured — do not re-derive)
- **MCP success result** (from `executeToolCall`, tools/index.ts:176-183): `{ content: [{ type:"text", text: JSON.stringify(executorResult, null, 2) }] }`, **no `isError`**. For `clinic_search`/`doctor_search` the executor result has a numeric `count` field and (when non-empty) a `cards` field.
- **MCP error result** (formatErrorResponse, errors.ts:130-144): `{ content:[{type:"text", text: JSON.stringify({success:false, error:{code, message}})}], isError:true }`.
- **Error codes that occur** (errors.ts): `AUTHORIZATION_ERROR` (denied/unauth — assertToolAccess), `VALIDATION_ERROR` (bad args), `NOT_FOUND`, `INTERNAL_ERROR` (any non-MCPError thrown, **incl. `TypeError: fetch failed`** — the Casablanca bug), `DATABASE_ERROR`, `UNKNOWN_TOOL`, `RATE_LIMIT_ERROR`, plus Supabase passthrough codes.
- **`AUTHENTICATION_ERROR` is NOT seen by chat-api at the tool layer**: `resolveAuthContext` swallows token-validation failure → anonymous (requestContext.ts:53), so unauthenticated denials surface as `AUTHORIZATION_ERROR`. (auth-expired-as-its-own-outcome is a PRD open question → out of scope here.)
- **`fetch failed` path**: Supabase network failure rejects `await query` as a raw `TypeError`; it is NOT the `if (error)` branch (ClinicRepository.ts:97-101), so it propagates un-wrapped → `executeToolCall` catch → `formatErrorResponse` → `code:"INTERNAL_ERROR"`, `message:"fetch failed"`.
- **chat-api does not depend on `@queuemed/core`** and is NodeNext. Keep `ToolOutcomeKind` local to chat-api in Phase A (no new dependency, no web edits). Phase B decides promotion to core for the web.
- **Test runner:** `vitest` is configured; `pnpm --filter @queuemed/chat-api test` runs `vitest run`. tsconfig excludes `**/*.test.ts` from build.

## Patterns to Mirror (real snippets)

### TYPES / PURE-FN + JSDOC
```ts
// SOURCE: apps/chat-api/src/mcp.ts:33-49  (pure, JSON-tolerant parser returning a typed value or undefined)
export function parseCards(text: string): unknown | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "cards" in parsed) {
      const cards = (parsed as { cards?: unknown }).cards;
      return cards ? cards : undefined;
    }
  } catch {
    // not JSON — nothing to capture
  }
  return undefined;
}
```

### SESSION COLLECTION (per-request accumulator exposed via getter)
```ts
// SOURCE: apps/chat-api/src/mcp.ts:66-95
let collectedCards: unknown | undefined;
// ...inside execute:
const cards = parseCards(text);
if (cards) collectedCards = cards;
return text;
// ...returned session:
return {
  tools,
  getCollectedCards: () => collectedCards,
  close: async () => { await client.close(); },
};
```

### ENVELOPE RETURN (agent)
```ts
// SOURCE: apps/chat-api/src/agent.ts:72-73
const message = await result.text;
res.json({ message, cards: session?.getCollectedCards() });
```

### TEST_STRUCTURE
```ts
// SOURCE: apps/chat-api/src/mcp.test.ts:1-13
import { describe, it, expect } from "vitest";
import { parseCards } from "./mcp.js";

describe("parseCards", () => {
  it("returns the cards payload when the tool-result JSON carries non-empty cards", () => {
    const cards = { kind: "clinic_cards", items: [/*...*/] };
    const text = JSON.stringify({ success: true, count: 1, clinics: [], cards });
    expect(parseCards(text)).toEqual(cards);
  });
});
```

## Files to Change
| File | Action | Justification |
|------|--------|---------------|
| apps/chat-api/src/outcomes.ts | CREATE | `ToolOutcomeKind`, `classifyToolResult`, `summarizeForModel`, `aggregateOutcomes` — all pure |
| apps/chat-api/src/outcomes.test.ts | CREATE | Eval suite (one case per error code + empty + ok + non-JSON + precedence) — written/validated first |
| apps/chat-api/src/mcp.ts | UPDATE | Wire classify+summarize into the tool `execute`; collect outcomes; expose `getOutcome()` on `McpSession`; return summary to model |
| apps/chat-api/src/agent.ts | UPDATE | Add `outcome` to the JSON envelope (llm path; mock/error paths set it explicitly) |

## NOT Building (Phase A)
- **No streaming / no `useChat` / no `data-parts`** — that's Phase B. Envelope stays request/response `{ message, cards, outcome }`.
- **No web/UI changes** — no distinct per-outcome rendering yet (Phase B).
- **No mutation HITL** — `booking_*` still execute normally (Phase C).
- **No `@queuemed/core` changes / no new shared type** — `ToolOutcomeKind` stays in chat-api this phase.
- **No `needs_confirmation` outcome** — added in Phase C.
- **No auth-expired outcome** — folded into `forbidden`; PRD open question.
- **No deep field-stripping of `ok` payloads** — Phase A only removes the `cards` key from model-facing `ok` text (the branded-href leak); per-field PHI trimming is later.

## Step-by-Step Tasks

### Task 1: Create the pure outcome module
- **ACTION:** CREATE `apps/chat-api/src/outcomes.ts`.
- **IMPLEMENT:**
  ```ts
  /**
   * Typed classification of an MCP tool result, so the agent/UI can react to
   * failure modes instead of the model paraphrasing raw errors. Pure + unit-tested.
   */
  export type ToolOutcomeKind = "ok" | "no_results" | "backend_unavailable" | "forbidden";

  /** Precedence when a turn calls multiple tools (worst wins). */
  const PRECEDENCE: Record<ToolOutcomeKind, number> = {
    forbidden: 3, backend_unavailable: 2, no_results: 1, ok: 0,
  };

  function codeFromBody(text: string): string | undefined {
    try {
      const p = JSON.parse(text) as { error?: { code?: unknown }; success?: unknown };
      const code = p?.error?.code;
      return typeof code === "string" ? code : undefined;
    } catch { return undefined; }
  }

  /** Map a single MCP tool result to an outcome. */
  export function classifyToolResult(input: { isError: boolean; text: string }): ToolOutcomeKind {
    if (input.isError) {
      const code = codeFromBody(input.text);
      if (code === "AUTHORIZATION_ERROR" || code === "AUTHENTICATION_ERROR") return "forbidden";
      return "backend_unavailable"; // INTERNAL_ERROR (incl. fetch failed), DATABASE_ERROR, unknown → safe/retryable default
    }
    // success path
    let parsed: unknown;
    try { parsed = JSON.parse(input.text); }
    catch { return "ok"; } // plain-text answer, no tool data
    if (parsed && typeof parsed === "object") {
      const o = parsed as { success?: unknown; error?: { code?: unknown }; count?: unknown };
      if (o.success === false) {
        const code = typeof o.error?.code === "string" ? o.error.code : undefined;
        return code === "AUTHORIZATION_ERROR" || code === "AUTHENTICATION_ERROR" ? "forbidden" : "backend_unavailable";
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
   * original text with any `cards` key removed (cards travel via side-channel;
   * keeps branded bookingHref/IDs out of the model context).
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
          if ("cards" in parsed) { delete parsed.cards; return JSON.stringify(parsed); }
        } catch { /* plain text — return as-is */ }
        return text;
      }
    }
  }
  ```
- **MIRROR:** TYPES / PURE-FN (parseCards), the JSON-tolerant try/catch.
- **IMPORTS:** none (pure).
- **GOTCHA:** `count === 0` is the only reliable cross-tool empty signal (clinic/doctor search expose it); tools without `count` correctly fall through to `ok`. Default unknown error → `backend_unavailable` (retryable) per PRD risk mitigation.
- **VALIDATE:** `pnpm --filter @queuemed/chat-api exec tsc --noEmit`.

### Task 2: Write the eval suite (before wiring)
- **ACTION:** CREATE `apps/chat-api/src/outcomes.test.ts`.
- **IMPLEMENT:** cases —
  - `classifyToolResult`:
    - isError + `{error:{code:"AUTHORIZATION_ERROR"}}` → `forbidden`
    - isError + `{error:{code:"INTERNAL_ERROR",message:"fetch failed"}}` → `backend_unavailable` (**the Casablanca bug, locked**)
    - isError + `{error:{code:"DATABASE_ERROR"}}` → `backend_unavailable`
    - isError + non-JSON text → `backend_unavailable`
    - success + `{success:true,count:0,clinics:[]}` → `no_results`
    - success + `{success:true,count:2,clinics:[...]}` → `ok`
    - success + `{success:false,error:{code:"VALIDATION_ERROR"}}` → `backend_unavailable`
    - success + `{success:false,error:{code:"AUTHORIZATION_ERROR"}}` → `forbidden`
    - success + non-JSON plain text → `ok`
    - success + JSON without `count` (e.g. availability) → `ok`
  - `aggregateOutcomes`: `[]`→undefined; `["ok","no_results"]`→`no_results`; `["no_results","backend_unavailable"]`→`backend_unavailable`; `["backend_unavailable","forbidden"]`→`forbidden`; `["ok","ok"]`→`ok`.
  - `summarizeForModel`: `ok` strips `cards` key (assert result parsed has no `cards`, still has `count`); `ok` non-JSON returns input unchanged; each non-ok returns its canonical sentence (assert contains key phrase).
- **MIRROR:** TEST_STRUCTURE (mcp.test.ts).
- **IMPORTS:** `import { classifyToolResult, aggregateOutcomes, summarizeForModel } from "./outcomes.js";`
- **GOTCHA:** import with `.js` extension (NodeNext), matching `mcp.test.ts` importing `./mcp.js`.
- **VALIDATE:** `pnpm --filter @queuemed/chat-api test` → all green (negative control: temporarily flip one expected value, confirm fail, revert — per lessons).

### Task 3: Wire classify + summarize into the MCP tool boundary
- **ACTION:** UPDATE `apps/chat-api/src/mcp.ts`.
- **IMPLEMENT:**
  1. Import: `import { classifyToolResult, aggregateOutcomes, summarizeForModel, type ToolOutcomeKind } from "./outcomes.js";`
  2. Extend the interface:
     ```ts
     export interface McpSession {
       tools: ToolSet;
       getCollectedCards: () => unknown | undefined;
       getOutcome: () => ToolOutcomeKind | undefined; // NEW: aggregate over the turn
       close: () => Promise<void>;
     }
     ```
  3. Add accumulator next to `collectedCards`: `const outcomes: ToolOutcomeKind[] = [];`
  4. In `execute`, after `const text = extractText(result.content);`:
     ```ts
     const kind = classifyToolResult({ isError: !!result.isError, text });
     outcomes.push(kind);
     const cards = parseCards(text);
     if (cards) collectedCards = cards;
     return summarizeForModel(kind, text); // model sees the summary, not raw error/JSON
     ```
  5. Return `getOutcome: () => aggregateOutcomes(outcomes)` in the session object.
- **MIRROR:** SESSION COLLECTION pattern.
- **GOTCHA:** `client.callTool` result may have `isError` undefined → coerce with `!!`. Keep `parseCards(text)` on the ORIGINAL text (cards still carried by side-channel in Phase A); only the model-facing return value changes.
- **VALIDATE:** `tsc --noEmit` clean; existing `mcp.test.ts` still passes (parseCards untouched).

### Task 4: Surface outcome in the agent envelope
- **ACTION:** UPDATE `apps/chat-api/src/agent.ts`.
- **IMPLEMENT:**
  - llm path (lines 72-73): `res.json({ message, cards: session?.getCollectedCards(), outcome: session?.getOutcome() });`
  - mock path (line 47): add `outcome: undefined` (no tools run).
  - error path (lines 77-80): add `outcome: "backend_unavailable"` (generation failed → retryable signal).
- **MIRROR:** ENVELOPE RETURN.
- **GOTCHA:** `outcome` is additive and optional; the web ignores it until Phase B, so no client change is required or made.
- **VALIDATE:** `tsc --noEmit` clean; `pnpm --filter @queuemed/chat-api build` succeeds.

## Testing Strategy
| Function | Input | Expected | Edge? |
|----------|-------|----------|-------|
| classifyToolResult | isError, INTERNAL_ERROR "fetch failed" | backend_unavailable | the bug |
| classifyToolResult | isError, AUTHORIZATION_ERROR | forbidden | |
| classifyToolResult | isError, non-JSON | backend_unavailable | malformed |
| classifyToolResult | success count:0 | no_results | empty |
| classifyToolResult | success count:2 | ok | |
| classifyToolResult | success, no count key | ok | tool w/o count |
| classifyToolResult | success:false body, VALIDATION_ERROR | backend_unavailable | body-level error |
| aggregateOutcomes | [] | undefined | no tool ran |
| aggregateOutcomes | [no_results, backend_unavailable] | backend_unavailable | precedence |
| summarizeForModel | ok with cards | JSON minus `cards` key | leak fix |
| summarizeForModel | backend_unavailable | retry sentence | |
- **Edge checklist:** empty (count:0 ✓), invalid type (non-JSON ✓), permission denied (forbidden ✓), network fail (fetch failed ✓), no-tool turn (aggregate undefined ✓), multi-tool turn (precedence ✓).

## Validation Commands
- Type-check → `pnpm --filter @queuemed/chat-api exec tsc --noEmit` → 0 errors.
- Tests → `pnpm --filter @queuemed/chat-api test` → all pass (new outcomes.test.ts + existing mcp.test.ts).
- Build → `pnpm --filter @queuemed/chat-api build` → success.
- Negative control → flip one expected outcome value, confirm the suite FAILS, revert (per lessons).
- Live smoke (optional, needs stack): with Supabase **down**, ask "find a clinic in Casablanca" → chat-api log/envelope shows `outcome:"backend_unavailable"` and the model says "try again in a moment" (not "no clinics found"). With Supabase **up + seed**, same query → `outcome:"ok"` + cards.

## Acceptance Criteria
- [ ] `classifyToolResult` distinguishes ok / no_results / backend_unavailable / forbidden with 100% accuracy on the eval set.
- [ ] `summarizeForModel` removes `cards` from `ok` text (no branded href reaches the model) and returns a correct sentence for each non-ok outcome.
- [ ] `McpSession.getOutcome()` returns the aggregated outcome (worst wins) or undefined when no tool ran.
- [ ] Agent envelope includes `outcome` on all three paths.
- [ ] tsc 0 errors; all chat-api tests pass; build succeeds; negative control fails-then-passes.

## Completion Checklist
- [ ] outcomes.ts + outcomes.test.ts created; mcp.ts + agent.ts updated.
- [ ] No web changes; no core changes; no new dependency.
- [ ] Phase A marked complete in the PRD; short report written to `.claude/PRPs/reports/`.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A future MCP error code misclassifies | M | M | default unknown → backend_unavailable (retryable); one eval case per known code; revisit when codes change |
| Model behaves oddly on the new `TOOL_RESULT:` summary strings | L | M | sentences are explicit imperatives aligned with prompt.ts tone; tune wording without changing the contract; live smoke check |
| Stripping `cards` from `ok` text removes data the model needs | L | L | model only needs human-readable fields (still present); cards were never meant for the model (side-channel) |
| Aggregation hides a useful per-tool outcome from UI | L | L | Phase A surfaces one aggregate; per-tool detail can be added with the typed transport in Phase B |
```
