# Core Consolidation & Agent Parity

## Problem Statement
The web app (`apps/web/src/services/queue/QueueService.ts`, ~974 lines) re-implements booking and queue operations that already exist in `@queuemed/core` (`BookingService`, `QueueService`). The MCP server (AI agent) calls **core**; the web UI calls its **own** copy. This is two implementations of "the same" operation, which (a) is a DRY violation that drifts over time, and (b) **threatens agent parity** — the security property that the agent can do nothing the authenticated user can't, because both must run identical, RLS-gated logic. If the agent books via core and the UI books via web's `QueueService`, they can validate differently and diverge. The cost of not solving: silent behavioral drift between the two entry points, and erosion of the one property that makes a write-capable healthcare agent safe.

## Evidence
- `apps/web/src/services/queue/QueueService.ts:171` `createAppointment` overlaps `packages/core/.../BookingService.ts:35` `bookAppointmentForMode`.
- Web `QueueService` also re-declares `getDailySchedule`, `getQueueEntry`, `checkInPatient`, `callNextPatient`, `cancelAppointment` — all present in core `QueueService` (verified by reading both files this session).
- `reorderQueue` (`QueueService.ts:835`) is web-only and is the most general-purpose staff op (per prior session feedback) → belongs in core.
- Assumption — validate via grep: every MCP tool routes through `@queuemed/core` services and never touches Supabase/repositories directly. Must confirm to assert agent parity.

## Proposed Solution
Finish the already-started hexagonal consolidation: make `@queuemed/core` the single source of truth for booking + queue domain logic, and reduce web's `QueueService` to a thin delegating facade over core (keeping only genuinely UI-specific glue). Borrow from `iii` (iii-hq/iii) **only its Function/Trigger mental model** — name each core use-case with a stable id and route every transport (React hook, MCP tool) through it uniformly — as a **zero-runtime TypeScript convention**, not its Rust/ELv2 engine. Chosen over adopting `iii` because we have an in-process monorepo composition problem, not a distributed polyglot-orchestration one.

## Key Hypothesis
We believe consolidating booking creation + queue reorder into `@queuemed/core` (with web delegating) will guarantee the web UI and the AI agent execute identical, RLS-gated logic for those operations. Right when: a single core method backs both call sites, `tsc` is green, existing booking/queue tests pass, and the MCP-purity grep shows no tool bypassing core.

## What We're NOT Building
- The `iii` runtime, workers, or any new process tier — over-engineering for one monorepo; ELv2 engine license is incompatible with our open-source goal.
- An `INotifier` port — valuable but separate concern; deferred to a follow-up phase.
- Migration of web-only domain methods (`markPatientAbsent/Returned`, `resolveAbsentAppointment`, `autoMarkNoShow`, queue breaks, `callSpecificPatient`, payment-status, status tokens) — deferred; out of scope for this slice.
- FHIR export, multi-tenant, telehealth — unrelated to this consolidation.

## Success Metrics
| Metric | Target | How Measured |
|--------|--------|--------------|
| Duplicate booking-create paths | 1 (was 2) | Web `createAppointment` delegates to core; no parallel validation logic |
| `reorderQueue` location | core | Method on core `QueueService`, web delegates |
| Type safety | green | `tsc` / package typecheck passes |
| Regression | none | Existing core + web booking/queue tests pass |
| Agent parity | verified | Grep proves every MCP tool calls core services only |

## Users & Context
Primary user: the **engineering team** maintaining QueueMed (current behavior: must change booking/queue logic in two places and hope they stay in sync; trigger: any future booking/queue change; success state: change once in core, both UI + agent inherit it). Secondary beneficiary: the **patient/staff** using either the UI or the agent, who get identical, correctly-authorized behavior. Job-to-be-done: "When I change how an appointment is booked or a queue is reordered, I want one authoritative implementation, so the AI agent and the web UI can never diverge." Non-users: external integrators (no public API surface changes here).

## Solution Detail
MoSCoW:
| Priority | Item | Rationale |
|---|---|---|
| Must | Booking SSOT: web `createAppointment` → core `BookingService` | Feedback item 1; protects agent parity for the highest-risk mutation |
| Must | Port `reorderQueue` to core; web delegates | Feedback item 2; most general staff op |
| Must | MCP tool-purity audit (grep + fix any bypass) | Asserts agent parity by construction |
| Should | Collapse trivially-duplicated reads (`getDailySchedule`, `getQueueEntry`, `callNextPatient`) to delegate to core | Low-risk DRY; only if call sites are few |
| Should | Borrow `iii` framing: stable use-case ids on core services | Zero-runtime; improves discoverability + observability hooks later |
| Could | ESLint `no-restricted-imports` boundary on core/services | Makes "core never imports Supabase/transport" a compile guarantee |
| Won't | `INotifier`, web-only domain method migration, FHIR | Deferred / out of scope |

MVP scope: the three **Must** items + verification. Critical flow: a booking created through the web UI and a booking created through the agent both funnel into `BookingService.bookAppointmentForMode` against the same RLS-scoped Supabase client.

## Technical Approach
Feasibility: **HIGH**. The ports/adapters skeleton, the DI container (`packages/core/src/container.ts`), and a clean `BookingService` already exist; this is consolidation, not new architecture.

Architecture notes: web `QueueService` keeps its constructor/repository for UI-specific methods but delegates booking-create and reorder to core via `createServiceContainer` (or an injected core service). DTO reconciliation: map web `CreateQueueEntryDTO` → core `BookingRequest` at the boundary (or unify the type in core).

For AI features: model boundary unchanged (LLM only calls MCP tools); tool/agent surface unchanged in capability — this work *narrows* it to core-only. Eval approach: existing booking/queue unit + integration tests as the regression gate; the MCP-purity grep is a structural eval. Lethal-trifecta note: consolidation reduces the attack surface (one validated path) and preserves RLS-at-data-layer authorization; no new external comms channel introduced.

Technical-risk table:
| Risk | Likelihood | Mitigation |
|---|---|---|
| DTO mismatch (`CreateQueueEntryDTO` vs `BookingRequest`) drops a field | Med | Map explicitly at boundary; diff fields before deleting web logic |
| Web `createAppointment` has extra side-effects (events, status-token) not in core | Med | Read full web method first; keep side-effects in web facade, push only domain logic to core |
| Hidden call sites break when signatures change | Med | Grep all callers (`useQueueService`, components) before editing; keep web method signature stable |
| Core lacks its own test runner → ported `reorderQueue` test silently never runs | Low | Confirm core's vitest config includes the new test (standing monorepo lesson) |
| Browser flow regresses despite green tests | Med | Item 3 (manual browser test) flagged as user step — type/test-green ≠ runtime-green |

## Implementation Phases
| # | Phase | Description | Status | Depends |
|---|-------|-------------|--------|---------|
| 1 | Audit | Read web `createAppointment` + `reorderQueue` fully; grep call sites + MCP tools; diff DTOs | **complete** | — |
| 2 | Booking SSOT | **Dropped — phantom.** Patient booking already core-consolidated (agent + UI both call `bookAppointmentForMode`); web `createAppointment` is a *distinct* walk-in RPC (`create_queue_entry`), not a duplicate. No merge. | **complete (n/a)** | 1 |
| 3 | reorderQueue → core | Added to core `QueueService` + `IQueueRepository` (`updateQueuePosition`, `createQueueOverride`) + 6 tests; web delegates, keeps UI event | **complete** | 1 |
| 4 | Boundary guard | Added `architecture.boundary.test.ts` enforcing core-imports-no-infra; fixed dishonest `ClinicSettings` type (root-caused 2 pre-existing web errors) | **complete** | — |
| 5 | Verify | `tsc` green across core/mcp/chat/web; core 24 tests, web queue+clinic suites pass | **complete** | 2,3,4 |
| 6 | Manual | User browser-tests the web reorder + booking flows | pending (user) | 5 |

## Open Questions
- [ ] Does web `createAppointment` carry side-effects (event emits, status-token creation) that must stay in the web facade vs move to core?
- [ ] Is `reorderQueue` backed by a Supabase RPC, or in-app row updates? (determines repo-port shape)
- [ ] Adopt the `iii`-style stable use-case ids now (light touch) or note as convention for later?
