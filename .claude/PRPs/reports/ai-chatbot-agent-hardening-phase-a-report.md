# Phase A Report — Structured Tool-Outcomes + Evals

**PRD:** ai-chatbot-agent-hardening.prd.md · **Phase:** A · **Status:** complete · **Date:** 2026-06-16
**Branch:** feat/showcase-ai-chatbot

## Summary
Added a typed `ToolOutcome` classification at the chat-api MCP-tool boundary so failure modes are distinguishable (`ok | no_results | backend_unavailable | forbidden`) instead of the model paraphrasing raw errors. The model now receives a compact, outcome-shaped summary (and the branded `cards`/`bookingHref` is stripped from `ok` text). The aggregate outcome is surfaced on `McpSession.getOutcome()` and added to the agent's JSON envelope. Web rendering is deferred to Phase B.

## Predicted vs actual
| | Predicted | Actual |
|---|---|---|
| Complexity | Small (<150 LOC, 4 files) | Small — 2 CREATE, 2 UPDATE, ~190 LOC incl. tests |
| Confidence | 9/10 | Held — no surprises in the code change |
| Files | 4 | 4 (no web/core changes, no new deps, as planned) |

## Tasks
| # | Task | Result |
|---|------|--------|
| 1 | `outcomes.ts` (classify / summarize / aggregate) | done |
| 2 | `outcomes.test.ts` eval suite (21 cases) | done |
| 3 | Wire into `mcp.ts` (classify + summarize + getOutcome) | done |
| 4 | `outcome` in agent envelope (3 paths) | done |

## Validation
- **Typecheck:** `tsc --noEmit` → 0 errors.
- **Tests:** `pnpm --filter @queuemed/chat-api test` → 25 passed (21 new outcomes + 4 existing mcp).
- **Build:** `tsc` → success.
- **Negative control:** flipped `backend_unavailable`→`forbidden` mapping → 3 tests failed (incl. the Casablanca-bug lock); reverted → 25 green. Gate is real.
- **Data-layer smoke (live):** started local Supabase (was down — the entire cause of the original bug), confirmed mcp-server→Supabase reachable (http 200), called `clinic_search({city:'Casablanca'})` directly → `count:1, hasCards:true, Casa Family Care (Casablanca)`. This maps to `outcome:"ok"` under the new classifier.

## Files changed
- CREATE `apps/chat-api/src/outcomes.ts`
- CREATE `apps/chat-api/src/outcomes.test.ts`
- UPDATE `apps/chat-api/src/mcp.ts` (McpSession.getOutcome; classify+summarize in execute)
- UPDATE `apps/chat-api/src/agent.ts` (envelope `outcome` on mock/llm/error paths)

## Deviations
None. Scope held exactly (no web, no core, no new dependency; `ToolOutcomeKind` kept local to chat-api as planned).

## Issues discovered (out of Phase A scope — flagged, not fixed)
1. **Local Supabase was down** → root cause of the user's "unable to find clinics in Casablanca." Fixed by `supabase stop && supabase start` (db had exited 137 ~15h prior; data volume intact — Casa Family Care seed already present, no seeding needed).
2. **Groq tool-calling failure (NEW, separate bug) — DIAGNOSED.** Symptom: a Casablanca query intermittently returns an empty message; chat-api logs `Failed to call a function. Please adjust your prompt. See 'failed_generation'… type: 'invalid_request_error'`.
   - **Not a schema bug, not our code.** Dumped all 4 tool schemas handed to Groq — clean, valid JSON Schema. The identical request then succeeded **9/9** on repeat (1 manual + an 8/8 loop), returning "Casa Family Care… outcome: ok". The earlier failure was a one-off.
   - **Root cause:** `llama-3.3-70b-versatile` occasionally emits a tool call Groq's validator rejects → HTTP **400 `invalid_request_error`**. Intermittent, low rate.
   - **Why it reaches the user:** AI SDK `maxRetries` (default 2) only retries 429/5xx/network; a **400 is non-retryable**, so the transient generation error is not retried and our agent has no fallback → 502 (now tagged `outcome: backend_unavailable`).
   - **Recommended fix (NOT implemented — investigation only):** (a) targeted bounded retry on the `Failed to call a function`/400 tool-gen signature (one retry ≈ p² user-facing rate → negligible); (b) optionally a sturdier tool-use model on Groq. Best folded into a small hardening commit or Phase B.

## Tests written
21 cases in `outcomes.test.ts`: 11 `classifyToolResult` (incl. `fetch failed`→backend_unavailable lock, both auth codes, count:0, no-count, success:false bodies, non-JSON), 5 `aggregateOutcomes` (precedence), 5 `summarizeForModel` (cards-strip + each canonical sentence).

## Next
- `/code-review` (code-reviewer agent) on the diff → `/learn` → commit.
- Then Phase B (typed streaming transport) — and the Groq tool-calling bug should be resolved before/with it, since an un-callable tool blocks the whole agent regardless of outcome typing.
