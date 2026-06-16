# AI Chatbot Agent Hardening

## Problem Statement
The QueueMed chat agent works end-to-end (web → chat-api → MCP → core → Supabase) and its RBAC is solid, but the **agent layer is fragile in three ways that block it from being a trustworthy transactional assistant**:

1. **Tool failures are laundered through the model.** When `clinic_search` failed with `TypeError: fetch failed` (backend down), the user saw a vague "I'm unable to find clinics in Casablanca… try again later." A real zero-result search produces the *same* apology. The system cannot tell the user (or itself) the difference between *backend down*, *no results*, and *not allowed* — so it can't retry, can't show the right UI, and can't be measured.
2. **The text/card transport is a fragile hack.** `agent.ts` awaits the full reply and returns one JSON blob (no token streaming; `sendMessageStream` is a fake shim). Cards are recovered by `JSON.parse`-ing the tool's *text* result and "last card-bearing tool wins" (`mcp.ts:38,82`). The model is also fed the entire tool JSON — including `bookingHref`/IDs the prompt explicitly says not to reveal.
3. **Mutations are guarded only by a prompt sentence.** `booking_create` / `booking_cancel` are write tools driven by free-text chat; "confirm before booking" lives in `prompt.ts:24`, not in code. A prompt-injected or misunderstood message can book or cancel with no structural human approval.

Cost of not solving: the chat stays a demo — it can't be trusted to take actions, fails opaquely in front of patients, and has no measurable quality bar.

## Evidence
- Live log: `[ERROR] ClinicRepository: Failed to search clinics error: 'TypeError: fetch failed'` → user got a generic apology. Backend-down and no-results are indistinguishable downstream. (mcp-server container logs, 2026-06-16.)
- `apps/chat-api/src/agent.ts:72-73` — `const message = await result.text; res.json({ message, cards })`: no streaming.
- `apps/chat-api/src/mcp.ts:38-49,82-84` — cards parsed from flattened tool text; `if (cards) collectedCards = cards` (last wins); full text returned to the model.
- `apps/web/src/services/chat/ApiChatService.ts:72-79` — `sendMessageStream` resolves the full reply then fires `onDelta` once (fake stream).
- `apps/chat-api/src/prompt.ts:24` — "Confirm the key details … before booking or cancelling" is the *only* guard on mutations.
- Stack: AI SDK **v5** (`ai@^5.0.0`, `@ai-sdk/*@^2.0.0`); web uses a **custom fetch**, not `useChat`.

## Proposed Solution
Harden the agent layer in three sequenced, independently-verifiable phases, **eval-first**:
- **A — Structured tool-outcomes:** a typed outcome contract (`ok | no_results | backend_unavailable | forbidden | needs_confirmation`) produced at the MCP→AI-SDK tool boundary, mapped deterministically so the agent and UI react correctly instead of the model guessing. Evals written before the change.
- **B — Typed streaming transport:** adopt AI SDK v5 UI message streaming (`toUIMessageStreamResponse`) on chat-api and `useChat` on the web; carry discovery cards as **typed data parts** (`data-cards`) instead of JSON-parsing tool text. Restores real token streaming and a clean typed channel.
- **C — Mutation HITL gate:** `booking_create`/`booking_cancel` become **client-approved tool calls** — surfaced without auto-execution, confirmed via a UI card, executed only after the user clicks Confirm (`addToolResult`). The model structurally cannot mutate without a human.

Chosen over alternatives because it fixes the *root* (no typed outcome/channel/gate) rather than patching symptoms, and it aligns with the platform's data-layer-authorization principle and the AI-SDK-tool-wrapper pattern already in use.

## Key Hypothesis
We believe a **typed outcome contract + typed streaming channel + structural mutation gate** will turn the chat from an opaque, prompt-guarded demo into a **trustworthy transactional agent** for patients (and later staff). Right when: failure modes are distinguishable and correctly rendered (100% on the eval set), tokens stream, cards arrive on a typed channel, and **no mutation executes without an explicit human confirmation** (provable, not prompt-dependent).

## What We're NOT Building
- **New MCP tools / new business logic** — this hardens the agent/transport/contract around the *existing* 12 tools. No new clinical capabilities.
- **Conversation persistence / server-side sessions / summarization** — real gap, but separate (P2); history stays client-managed for now.
- **Cost-aware model routing, full tracing/telemetry backend** — deferred (P2); we add minimal structured logging only.
- **Rate limiting / abuse protection on `/api/chat`** — real P0 hardening but a distinct security workstream; tracked separately, not in this PRD.
- **The `doctor` role** — unchanged (PRD open question elsewhere).
- **Auth/RBAC changes** — the wall is proven (Phase 5 matrix); we only consume it.

## Success Metrics
| Metric | Target | How Measured |
|--------|--------|--------------|
| Outcome classification accuracy | 100% on eval set (backend-down vs no-results vs forbidden vs ok) | Phase-A eval suite (deterministic, mocked tool results) |
| Distinct UX per outcome | 4 distinct rendered states (not one apology) | Web component test asserting render per outcome |
| Token streaming | Visible incremental text in UI | Manual + stream-frame assertion (first delta < full reply) |
| Card channel integrity | Cards arrive typed; multiple card-bearing tools all survive | Transport test (no JSON.parse of model text) |
| Mutation safety | 0 mutations execute without explicit confirm | HITL eval: assert `executeToolCall(booking_*)` not reached pre-confirm |
| No model-authored side-effects/links | bookingHref still code-minted; model never triggers a write | Existing brand + new HITL assertion |

## Users & Context
**Primary user** — a patient in the chat. *Current behavior:* gets a vague apology on any failure; waits for a non-streamed blob; can in principle have a booking made/cancelled from a misread message. *Trigger:* "find a dermatologist in Casablanca", "book that one", "cancel my appointment". *Success state:* sees results stream in as cards; on failure sees a clear, correct message (sign-in vs try-later vs no-matches); a booking happens only after they tap Confirm.
**Job-to-be-done** — When I act through chat, I want clear feedback and a confirm step before anything changes, so I can trust it with real bookings.
**Non-users (v1)** — staff/owner mutation flows beyond existing tools; admin.

## Solution Detail

### Capabilities (MoSCoW)
| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | Typed `ToolOutcome` contract + deterministic mapping at the MCP→AI-SDK boundary | Root fix for the apology bug; makes failure measurable |
| Must | Evals for outcome classification (written first) | Eval-first; locks the contract |
| Must | AI SDK v5 UI message streaming on chat-api (`toUIMessageStreamResponse`) | Real token streaming |
| Must | `useChat` on web consuming the stream + JWT headers | Idiomatic client; removes fake shim |
| Must | Cards as typed `data-cards` data parts (drop JSON.parse side-channel) | Clean typed channel; multi-tool safe; stop feeding IDs to model |
| Must | `booking_create`/`booking_cancel` as client-approved (HITL) tool calls | Structural mutation gate |
| Must | Confirmation card UI ([Confirm]/[Cancel]) → `addToolResult` → server executes | The human-in-the-loop |
| Must | HITL eval: no write before confirm | Proves mutation safety |
| Should | Compact model-facing tool summary (model sees a short text, not raw JSON) | Token cost + no ID leakage |
| Should | Distinct web rendering per outcome (empty / retry / sign-in) | UX completeness |
| Could | Auth-expired outcome surfaced (vs silent anonymous downgrade) | Better session UX (links to P0 #3) |
| Won't | New tools, persistence, routing, rate limiting | Out of scope above |

### MVP scope
Phase A alone is shippable and high-value: the agent distinguishes failure modes and the UI renders them correctly — today's bug becomes a clear, correct message. B and C build on it.

### Critical user flow
`patient prompt → agent picks tool → MCP returns data OR typed failure → outcome mapped (ok/no_results/backend_unavailable/forbidden) → [B] text streams + cards as data parts → for a mutation [C] agent emits an un-executed tool call → UI confirm card → user taps Confirm → addToolResult → server runs booking_create → result streams back`

## Technical Approach
**Feasibility: HIGH for A, MEDIUM for B/C.** A is additive at a boundary we own (`mcp.ts` tool wrapper). B/C require migrating the web client to `useChat` and re-wiring JWT/headers through its transport, plus the AI SDK v5 HITL recipe (tool-without-execute + `addToolResult` + server-side execution on approval) — APIs evolve, so signatures must be verified against current AI SDK docs in `/plan` (use the `vercel:ai-sdk` skill).

**Architecture notes**
- **Outcome boundary = `apps/chat-api/src/mcp.ts` tool wrapper.** The MCP result already carries `isError` and a JSON body with `error.code` (e.g. `AUTHORIZATION_ERROR`, `VALIDATION_ERROR`, `INTERNAL_ERROR`/`fetch failed`). Map these → `ToolOutcome` there; return a typed object to the agent and a compact text summary to the model. `no_results` = success + empty `count`. `backend_unavailable` = `fetch failed`/DB error. `forbidden` = `AUTHORIZATION_ERROR`. This is where today's bug is fixed.
- **Transport.** chat-api: `return result.toUIMessageStreamResponse({ ... })`; write cards/outcome via the stream writer as `data-cards` / `data-outcome` parts. web: replace `ApiChatService` usage in `ChatWindow`/`MorphChat` with `useChat({ api, headers })`; render `message.parts` (text + `data-cards` + `data-outcome`). Keep the `IChatService`/Mock path for offline demo, or gate Mock behind a flag.
- **HITL.** Define `booking_create`/`booking_cancel` to the AI SDK **without `execute`** so the call surfaces to the client; the existing MCP executor runs **only** after the user confirms (client `addToolResult` → follow-up request → chat-api invokes the MCP tool). The branded `bookingHref` and server-side `assertToolAccess` remain untouched (defense in depth).

**For this AI feature**
- *Model boundary:* model still only selects tool + args and writes prose; outcomes, cards, hrefs, and the decision to execute a mutation are all code/human-controlled. Mutation execution now additionally requires a human click.
- *Tool/agent surface:* unchanged set (12 tools); `booking_create`/`booking_cancel` change execution *mechanism* (deferred to client approval), not their RBAC.
- *Eval approach:* **(A)** deterministic outcome-mapping evals over mocked MCP results (one case per `error.code` + empty + ok) — pass^k=1.0. **(C)** HITL eval asserting the MCP executor is not reached until a confirmation result is supplied. **(B)** transport/integration test: a stream yields ≥1 text delta before completion and cards arrive as typed parts. Capability eval ("dermatologist in Casablanca → doctor_cards") added once Supabase seed is available.
- *Lethal-trifecta note:* rises from LOW toward MEDIUM in C — the agent reads untrusted input and can trigger a *write*. The HITL gate is the isolation boundary (no autonomous mutation); no external comms added. Acceptable with the gate.

### Technical risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| AI SDK v5 HITL / data-parts API differs from assumed signatures | M | Verify against current docs in `/plan` (`vercel:ai-sdk`); spike the recipe before wiring UI |
| `useChat` migration loses JWT/CORS/history wiring | M | Map current `ApiChatService` behavior to `useChat` transport options 1:1; keep a thin adapter; test authed + anonymous |
| Outcome mapping misclassifies a new error code | M | Default unknown → `backend_unavailable` (safe, retryable); eval one case per known code; deny-by-default ethos |
| Streaming + cards regress the working Phase-4 card render | M | Phase B has its own tests; keep card components unchanged, only swap their data source |
| HITL adds a turn that confuses multi-step tool loops | L | Constrain mutation tools to terminal steps; cap `maxSteps`; eval the confirm round-trip |
| Mock/offline demo path breaks under `useChat` | L | Gate Mock behind a flag or keep a non-streaming fallback route |

## Implementation Phases
| # | Phase | Description | Status | Depends |
|---|-------|-------------|--------|---------|
| A | Structured tool-outcomes + evals | Typed `ToolOutcome` contract; deterministic mapping in `mcp.ts`; compact model summary; evals first | complete | - | → reports/ai-chatbot-agent-hardening-phase-a-report.md |
| B | Typed streaming transport | `toUIMessageStreamResponse` on chat-api; `useChat` on web; cards/outcome as typed data parts; drop JSON.parse side-channel | pending | A |
| C | Mutation HITL gate | `booking_*` as client-approved tool calls; confirm card UI; execute on approval; HITL eval | pending | B |

## Open Questions
- [ ] Keep the offline **Mock** chat path under `useChat`, or gate it behind a dev flag / separate route?
- [ ] Should the **auth-expired** case get its own outcome (vs folding into `forbidden`) so the UI can prompt re-login? (Links to the silent-anonymous-downgrade P0.)
- [ ] On HITL approval, does chat-api re-invoke the MCP tool in the *same* request continuation or a fresh `/api/chat` round-trip? (Confirm against AI SDK v5 recipe in `/plan`.)
- [ ] Capability eval needs Supabase **seed data** (Casablanca clinics/doctors) — gate that eval on the seed being available.
