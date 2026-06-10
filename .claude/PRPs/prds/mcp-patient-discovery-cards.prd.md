# MCP Patient Discovery + Clickable Cards

## Problem Statement
Patients using the chat to find care have to read a text list, then leave the conversation and re-navigate the app to book — a multi-step drop-off. The chat already runs an AI-SDK agent over the MCP server, but tools return plain JSON, so the agent can't surface actionable, clickable results. The cost of not solving it: the chat is informational, not transactional, and booking conversion from chat stays near zero.

## Evidence
- `clinic_search` already supports `city`, `specialty`, `query` filters but returns text JSON only (`apps/mcp-server/src/tools/clinic/search.ts:99-115`). The agent can describe clinics but cannot render a tappable result.
- There is no doctor-level discovery tool — `clinic_search` returns clinics, not individual doctors with a next-available slot (registry: `apps/mcp-server/src/tools/index.ts:59-80`).
- Assumption — chat→booking drop-off is high; validate via funnel analytics once instrumented.

## Proposed Solution
Add patient-facing **discovery tools that return typed, structured card payloads**, and render them in the web chat via the AI-SDK's generative UI so each result is a clickable doctor/clinic card that deep-links into the existing `BookingFlow`. Reuse the existing `clinic_search` (extend its output) and add a `doctor_search` tool. No new auth infrastructure — discovery is public/patient level on the proven RBAC in `roleGuard.ts`.

## Key Hypothesis
We believe **clickable doctor/clinic cards in chat** will **turn discovery into one-tap booking** for **patients**. Right when **chat-initiated sessions convert to a started booking at a materially higher rate than the text-list baseline**.

## What We're NOT Building (v1)
- **Prescriptions / reports** — out of scope (clinical + regulatory weight; deferred).
- **Staff/doctor chat operations** (call-next, queue stats, patient search, request-record-access via chat) — deferred to later phases; tools partly scaffolded in `TOOL_PERMISSIONS` already.
- **New booking flow** — we deep-link into the existing `BookingFlow`, not rebuild it.
- **Doctor-gated tools** — none ship in v1 (see role-model note below).

## Success Metrics
| Metric | Target | How Measured |
|--------|--------|--------------|
| Chat→booking-started rate | Beat text-list baseline (set baseline first) | Funnel event from card tap → BookingFlow open |
| Card deep-link accuracy | 100% open correct prefilled clinic/doctor | E2E assertion |
| Discovery tool p95 latency | < 1.5s incl. next-slot | Server timing log |
| Cross-role denial | 100% (patient cannot reach staff/doctor tools) | Auth eval suite |

## Users & Context
**Primary user** — a patient in the chat. *Current behavior:* asks for clinics/doctors, gets text, leaves chat to book. *Trigger:* "doctors in Casablanca for dermatology". *Success state:* taps a card, lands in BookingFlow prefilled.
**Job to be done** — When I'm looking for care in my city/specialty, I want to see real, bookable options inline, so I can book without leaving the conversation.
**Non-users (v1)** — staff, doctors, clinic owners (their chat actions are later phases).

## Solution Detail

### Capabilities (MoSCoW)
| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | Extend `clinic_search` to return structured **card payload** (+ booking deep-link) | Reuse working filters; minimal change |
| Must | New `doctor_search` tool → doctor cards (name, specialty, clinic, **next available slot**, bookingHref) | The discovery you described; doesn't exist yet |
| Must | AI-SDK generative-UI rendering of card payloads in web chat | The "clickable card" experience |
| Must | Card tap deep-links into existing `BookingFlow` prefilled | Closes the loop |
| Must | Auth eval: patient token cannot invoke any staff/doctor tool | Your hard rule, made testable |
| Should | "Next available slot" sourced from `booking_getAvailability` | Makes cards actionable |
| Could | Card empty/error states (no results, region not covered) | UX completeness |
| Won't | Clinical docs, staff/doctor chat ops, doctor-gated tools | Deferred |

### MVP scope
A patient asks for clinics/doctors by city/specialty → the agent calls the discovery tool → the chat renders clickable cards → tapping a card opens `BookingFlow` for that clinic/doctor.

### Critical user flow
`patient prompt → agent picks doctor_search/clinic_search → MCP returns structured cards → AI-SDK render() shows <DoctorCard/> → onClick routes to BookingFlow(clinicId/doctorId)`

## Technical Approach
**Feasibility: HIGH** — filters, RBAC, and BookingFlow already exist; this is additive.

**Architecture notes**
- **MCP layer returns DATA, not UI.** MCP tools cannot return React. Define a typed structured payload (e.g. `{ kind: "doctor_cards", items: [{ id, name, specialty, clinic, nextSlot, bookingHref }] }`). The MCP tool's job is the data + the deep-link href.
- **Generative UI lives in the web app.** The AI-SDK tool wrapper around the MCP tool provides `render()` returning `<DoctorCard/>` (per the existing "wrap each MCP tool as an AI-SDK tool" pattern in lessons). This is the chosen rendering mechanism.
- **Auth** — discovery tools registered at `public`/`patient` level in `TOOL_PERMISSIONS`; existing `assertToolAccess` enforces the wall; discovery reads only public clinic/doctor data (no PHI).
- **Doctor data** — `doctor_search` joins `clinic_staff` + `profiles` (+ availability for next slot), returning only public-facing fields.

**For this AI feature**
- *Model boundary:* the model only selects the tool and arguments; all data + the booking href come from code. No model-authored links.
- *Tool/agent surface (v1):* `clinic_search` (extended), `doctor_search` (new). Both read-only, public/patient.
- *Eval approach:* (1) capability — "doctors in Casa for dermatology" returns correct doctor cards with valid bookingHref; (2) regression/security — patient token denied on `queue_callNext`, `patient_search`, etc. (pass^k = 1.0).
- *Lethal-trifecta note:* LOW — discovery is read-only public data, no PHI, no external comms. The card href is code-generated, not model-generated (prevents prompt-injected links).

**Role-model decision (recorded, see Decisions Log):** adopt a distinct `doctor` role in `UserRole` + `ROLE_HIERARCHY`. v1 ships **no** doctor-gated tools, so to avoid a dead abstraction the enum/hierarchy change lands with the first doctor-tool phase (or earlier as a no-op foundation) — flagged as an open question.

### Technical risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Generative UI couples rendering to AI-SDK pattern | M | Keep MCP payload a stable typed contract; UI mapping is a thin web-app layer that can be swapped |
| "Next available slot" adds latency / N+1 across doctors | M | Batch availability; cap results; cache per clinic-day |
| Card deep-link contract drift vs BookingFlow params | M | Single shared type for `bookingHref` params; E2E test |
| Doctor data leaks non-public fields | L | Explicit public-field allowlist in `doctor_search`; RLS on read |
| Adding `doctor` role touches auth core/JWT | M | Defer enum change to doctor-tool phase; additive, hierarchy-ordered |

## Implementation Phases
| # | Phase | Description | Status | Depends |
|---|-------|-------------|--------|---------|
| 1 | Card contract | Define typed structured card payload + bookingHref param type (shared) | complete | - | → reports/mcp-discovery-card-contract-report.md |
| 2 | clinic_search cards | Extend `clinic_search` output to card payload | complete | 1 | → reports/mcp-clinic-search-cards-report.md
| 3 | doctor_search tool | New patient/public tool → doctor cards incl. next slot | complete | 1 | → reports/mcp-doctor-search-cards-report.md (infra: reports/core-nodenext-resolution-report.md)
| 4 | Chat rendering | Extend chat contract → {message,cards}; render DoctorCard/ClinicCard, deep-link to BookingFlow | complete | 2,3 | → reports/mcp-chat-card-rendering-report.md
| 5 | Auth + evals | Register perms; eval suite for capability + cross-role denial | pending | 2,3 |

## Open Questions
- [ ] When do we land the distinct `doctor` role — now as a no-op foundation, or with the first doctor-tool phase? (No v1 consumer.)
- [ ] Set the chat→booking baseline before launch — what's today's number?
- [ ] Does `BookingFlow` already accept a preselected clinic/doctor via route/props, or is a prefill entry point needed? (Confirm in `/plan`.)
- [ ] "Next available slot" — show per doctor in cards (costlier) or only after tap?
