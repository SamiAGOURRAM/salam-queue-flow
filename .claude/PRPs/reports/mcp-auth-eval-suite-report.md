# Phase 5 Report — Auth Eval Suite (Deterministic RBAC Matrix)

**PRD:** mcp-patient-discovery-cards.prd.md · **Status:** complete · **Date:** 2026-06-16

## What shipped
`apps/mcp-server/src/middleware/auth/roleGuard.eval.test.ts` — a deterministic
RBAC eval that locks the cross-role denial property ("a patient/anonymous caller
can never reach a staff tool") that the PRD's success metric demands.

No new auth code. The authorization layer (`canAccessTool`, `assertToolAccess`,
`executeToolCall`) already existed and was unchanged. Phase 5 *tests* it.

## Decisions (locked in /spec)
1. **Deterministic RBAC matrix**, not LLM sampling. "Never" can't be proven
   probabilistically; cross-role denial is a pure function of the guard.
2. **In-process vitest** — synthetic `AuthContext`s, no network/Supabase.
3. **Deterministic capability check now** — assert patient CAN reach discovery
   tools; defer the LLM "agent picks the right tool" eval to a later phase.

## Design
- **Hand-authored `EXPECTED_ACCESS` matrix** (5 callers × 12 registered tools),
  authored *independently* of `TOOL_PERMISSIONS`. If the permission map drifts
  (e.g. a staff tool silently widened to patient), the matrix disagrees and the
  suite fails. This is the drift lock.
- **Coverage guard:** asserts the matrix's tool set equals `registerTools()`'s
  actual names — a newly registered tool can't slip in untested.
- **Three enforcement layers** asserted per (caller, tool): `canAccessTool`
  boolean, `assertToolAccess` throws-iff-denied, and live `executeToolCall`
  returns `AUTHORIZATION_ERROR` on denied combos (denial precedes the executor,
  so no data-layer call). Allowed combos are NOT run live (would hit Supabase).
- **Explicit security invariant** block names the hard rule directly:
  patient + anonymous denied on `queue_getSchedule`/`queue_callNext`, plus
  deny-by-default for unknown tools.

## Verification
- **146/146** mcp-server tests pass (136 new eval + 10 pre-existing); `tsc --noEmit` clean.
- **Negative control** (per lessons): temporarily set `queue_callNext → patient`
  in `TOOL_PERMISSIONS` → suite FAILED at 3 points (matrix, assert, invariant),
  confirming the gate is not a rubber stamp. Reverted. Note: the live
  `executeToolCall` check did *not* flag that combo because `queue_callNext`'s
  executor has its own defense-in-depth staff check — the matrix/invariant
  layers caught it, which is exactly why we assert at the guard level not only
  end-to-end.

## Follow-ups (not blockers)
- LLM capability eval ("doctors in Casa for dermatology" → correct cards) deferred.
- Unregistered tools listed in `TOOL_PERMISSIONS` (staff/owner/admin ops) are
  intentionally out of the matrix until their executors land in a later phase;
  the coverage guard will force them into the matrix when registered.
