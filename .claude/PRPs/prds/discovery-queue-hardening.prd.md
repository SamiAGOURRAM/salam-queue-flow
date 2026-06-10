# Discovery & Queue-Status Hardening (post-review)

## Problem Statement
The code review of the doctor-search / NodeNext work surfaced six real issues that
ship latent bugs or invite future ones: a phantom appointment status that silently
under-counts queued patients, a doctor filter that surfaces non-clinical staff as
bookable, a UTC date that can be off-by-a-day, and three type-hygiene gaps
(untyped DB rows, a triplicated `DoctorListing`, an `unknown` clinic return) that
let schema drift pass the compiler. None are caught by tests today; each is a
"works until it doesn't" trap. Cost of not fixing: wrong queue counts for staff,
non-doctors in patient discovery, and type errors that surface only at runtime.

## Evidence
- `"checked_in"` is **not** a valid appointment status (the enum is `scheduled | waiting | in_progress | completed | cancelled | no_show | rescheduled`), yet it's compared in `estimateWaitTime.ts:258`, `callNext.ts:181`, `getSchedule.ts:198` and listed in the `getAppointments` filter enum (`:32`,`:102`). The real queued status is `waiting` — so these silently miss waiting patients. (Confirmed; same bug class already fixed in `getPosition.ts`.)
- `isDoctorLikeRole` returns `true` for **any** staff row with a non-empty `specialization` (core `ClinicRepository.ts`; web `DoctorDirectory.tsx:36-55`) — a receptionist with a free-text specialization becomes a bookable "doctor".
- `doctor_search` computes `today` via `new Date().toISOString().slice(0,10)` (UTC) — off by a day around midnight in Morocco (UTC+1).
- `searchDoctors` reads DB rows as `Record<string,unknown>` with `as string` casts; a null/renamed column passes the compiler and crashes/relabels at runtime.
- `DoctorListing` exists in 3 shapes (core, web `DoctorDirectory`, the card) with `null` vs `undefined` drift.
- `BookingService.getClinicInfo` returns `clinic: unknown` (`getClinicDetails` is untyped, selecting only `id,name,specialty,settings`).

## Proposed Solution
A focused hardening batch. Fix the status correctness bug across all sites; make
the doctor filter role-based (identically in core + web per decision); compute
`today` in `Africa/Casablanca`; and close the type gaps by establishing **one
canonical generated `Database` type in `@queuemed/core`** (web re-exports it),
using Row types in core repositories, unifying `DoctorListing` to the core type,
and giving `getClinicDetails`/`getClinicInfo` a precise return type.

## Key Hypothesis
We believe **removing the phantom status + role-based filtering + typed DB rows**
will **eliminate the silent under-counting and non-doctor leakage and stop schema
drift reaching runtime** for **staff and patients**. Right when **queue counts
include waiting patients, discovery shows only clinical providers, and a renamed
column fails the build instead of production.**

## What We're NOT Building
- **Supabase type-generation CLI/tooling** — we adopt the existing generated file (web's, the most complete) as the canonical copy in core; no new codegen pipeline.
- **Full mcp-server `Database` unification** — mcp-server's `adapters/supabase/types.ts` (its `AppointmentStatus` union) stays for now; re-pointing it at core is a follow-up (its enum usage needs care).
- **Re-architecting queue status handling** — we only correct `checked_in`→`waiting`; no new status model.
- **New discovery features** — behavior-preserving hardening only (except the deliberate role-filter tightening).

## Success Metrics
| Metric | Target | How Measured |
|--------|--------|--------------|
| Queued patients counted | `waiting` included everywhere (0 sites reference `checked_in`) | grep + unit test |
| Non-clinical staff in discovery | 0 (receptionist/admin excluded) | unit test on `isDoctorLikeRole` |
| `today` correctness | matches Africa/Casablanca civil date | unit test with mocked tz |
| Type safety | 0 `Record<string,unknown>`/`as string` row casts in `searchDoctors`; `DoctorListing` defined once; no `unknown` clinic | typecheck + grep |
| Regression | core + mcp typecheck/test/build green; web build green | CI commands |

## Users & Context
**Primary** — clinic **staff/owners** (correct queue counts via callNext/estimateWaitTime/getSchedule) and **patients** (only real doctors in discovery). **Job:** when I view the queue or search for a doctor, the numbers and results are correct. **Non-users:** none new.

## Solution Detail

### Capabilities (MoSCoW)
| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | `checked_in`→`waiting` at all 5 sites | correctness; staff see real counts |
| Must | Role-based `isDoctorLikeRole` in core **and** web (drop specialization rule) | no non-doctors in booking |
| Must | `today` in Africa/Casablanca for `doctor_search` | correct next-slot anchor |
| Must | Canonical `Database` types in core; Row types in `searchDoctors`/`mapToClinic` | kill silent schema drift |
| Should | `DoctorListing` defined once in core; web imports it | remove triplication/`null`-vs-`undefined` drift |
| Should | Typed `getClinicDetails`/`getClinicInfo` (picked clinic type, not `unknown`) | safe service boundary |
| Won't | mcp `Database` unification, codegen tooling | deferred |

### Critical flows preserved
- Staff "call next" / wait-time / schedule counts now include `waiting`.
- Patient `doctor_search` returns the same clinical providers minus non-doctors; cards/booking unchanged.

## Technical Approach
**Feasibility: HIGH** — all changes are localized; the generated `Database` type already exists (copy into core); status values are confirmed.

**Architecture notes**
- **Canonical types in core (lowest package):** add `packages/core/src/types/database.ts` (the generated `Database` + `Tables<>` helpers). Core repos use `Tables<'clinics'>` etc. Web's `integrations/supabase/types.ts` becomes a thin re-export of core's `Database` (dedupe). mcp-server unchanged (follow-up).
- **`getClinicDetails`** selects only `id,name,specialty,settings` → type it as `Pick<Tables<'clinics'>, 'id'|'name'|'specialty'|'settings'>` (NOT full `Clinic`), and `getClinicInfo.clinic` to match.
- **Status:** prefer core's `AppointmentStatus` enum values over string literals where the variable is typed; at minimum replace the literal `"checked_in"` with `"waiting"`.
- **Foreign-WIP caveat:** `callNext.ts`, `estimateWaitTime.ts`, `getSchedule.ts` are uncommitted resource-aware-queue WIP — these edits layer onto that working tree; commit coordination needed.

### Technical risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Web re-export of core `Database` breaks existing `Database["public"]...` imports | M | Keep the same exported names/shape; typecheck web build |
| Tightened doctor filter hides a real but mis-roled doctor | M | Keep a broad clinical-role allowlist; product-approved (decision) |
| Editing foreign-WIP files entangles commits | M | Path-scoped commits; flag for coordination |
| Morocco DST/Ramadan tz nuance | L | Use `Intl` `Africa/Casablanca` (handles civil offset) |

## Implementation Phases
| # | Phase | Description | Status | Depends |
|---|-------|-------------|--------|---------|
| 1 | Status fix | `checked_in`→`waiting` at all 5 mcp sites + test | complete | - | → reports/discovery-queue-hardening-report.md |
| 2 | Doctor filter | Role-based `isDoctorLikeRole` in core + web + test | complete | - | → reports/discovery-queue-hardening-report.md |
| 3 | today tz | `doctor_search` `today` via Africa/Casablanca + test | complete | - | → reports/discovery-queue-hardening-report.md |
| 4 | Canonical DB types | `Database` in core; web re-export; Row types in core repos; `DoctorListing` unify; typed `getClinicInfo` | complete | - | → reports/discovery-queue-hardening-report.md |

## Open Questions
- [ ] Commit strategy given phases 1 touches foreign WIP — separate or coordinate with the queue-WIP author?
- [ ] Should mcp-server later re-point at core's `Database` (its `AppointmentStatus` union)? (deferred)
