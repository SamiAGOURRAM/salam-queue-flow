# Plan: Discovery & Queue-Status Hardening (post-review batch)

## Summary
Behavior-preserving hardening of the doctor-search / queue-status surface from the
code review: (1) replace the phantom `"checked_in"` status with `"waiting"` at all
5 mcp sites; (2) make `isDoctorLikeRole` role-based in **core + web**; (3) compute
`doctor_search`'s `today` in `Africa/Casablanca`; (4) establish a canonical
generated `Database` type in `@queuemed/core` (web re-exports), use Row types in
core repositories, unify `DoctorListing`, and type `getClinicInfo`. Covers all 4
PRD phases in one pass (each is small; do in order).

## Metadata
- **Complexity:** Large (≈14 files; phase 4 moves a 3344-line generated type + repoints web imports)
- **Source PRD:** `.claude/PRPs/prds/discovery-queue-hardening.prd.md` (phases 1–4)
- **Decisions locked:** tighten doctor filter on BOTH sides; canonical shared `Database` in core (adopt web's generated file, no codegen tooling).

## Mandatory Reading
| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `apps/mcp-server/src/tools/queue/getPosition.ts` | 154-156 | The reference fix already applied (`case "waiting"`); mirror its status choice. |
| P0 | `apps/web/src/components/booking/DoctorDirectory.tsx` | 15-24, 36-55, 64-129 | web `DoctorListing`, `isDoctorLikeRole`, the query — both filter + the type to unify. |
| P0 | `packages/core/src/repositories/clinic/ClinicRepository.ts` | (current) | core `isDoctorLikeRole` + `searchDoctors` row casts + `mapToClinic`. |
| P0 | `apps/web/src/integrations/supabase/types.ts` | 1, 9, 3175-3344 | the generated `Database` + helpers + `Constants` to relocate into core. |
| P1 | `packages/core/src/services/booking/BookingService.ts` | 319-340 | `getClinicInfo` return shape. |
| P1 | `packages/core/src/repositories/booking/BookingRepository.ts` | 84-97 | `getClinicDetails` selects only `id,name,specialty,settings`. |
| P1 | `apps/mcp-server/src/tools/doctor/search.ts` | (today calc) | `today = new Date().toISOString().slice(0,10)` to fix. |
| P1 | `packages/core/src/types/index.ts` | (barrel) | where to wire `export * from './database.js'` and `DoctorListing`. |

## Patterns to Mirror
### STATUS FIX — SOURCE: apps/mcp-server/src/tools/queue/getPosition.ts:154-156
```ts
switch (appointment.status) {
  case "waiting":
  case "scheduled":
```
Apply the same `checked_in`→`waiting` substitution at every site.

### CORE TYPE BARREL (NodeNext) — SOURCE: packages/core/src/types/index.ts:8
```ts
export * from './cards.js';
```
Add `export * from './database.js';` the same way (explicit `.js`).

### RE-EXPORT SHIM — SOURCE: packages/core/src/errors.ts:4 (shim pattern)
```ts
export * from './errors/index.js';
```
web's `integrations/supabase/types.ts` becomes an analogous re-export of core's `Database`.

## Files to Change
| File | Action | Phase |
|---|---|---|
| `apps/mcp-server/src/tools/ml/estimateWaitTime.ts` | UPDATE | 1 — `checked_in`→`waiting` (:258) |
| `apps/mcp-server/src/tools/queue/callNext.ts` | UPDATE | 1 — (:181) |
| `apps/mcp-server/src/tools/queue/getSchedule.ts` | UPDATE | 1 — (:198) |
| `apps/mcp-server/src/tools/patient/getAppointments.ts` | UPDATE | 1 — filter enum (:32,:102) `checked_in`→`waiting` |
| `packages/core/src/repositories/clinic/ClinicRepository.ts` | UPDATE | 2,4 — `isDoctorLikeRole` role-based; Row types in `searchDoctors`+`mapToClinic` |
| `apps/web/src/components/booking/DoctorDirectory.tsx` | UPDATE | 2,4 — role-based filter; import `DoctorListing` from core |
| `apps/mcp-server/src/tools/doctor/search.ts` | UPDATE | 3 — `today` in Africa/Casablanca |
| `packages/core/src/types/database.ts` | CREATE | 4 — canonical generated `Database` (copy of web's) |
| `packages/core/src/types/index.ts` | UPDATE | 4 — `export * from './database.js'` |
| `apps/web/src/integrations/supabase/types.ts` | UPDATE | 4 — re-export from `@queuemed/core` |
| `packages/core/src/services/booking/BookingService.ts` | UPDATE | 4 — typed `getClinicInfo.clinic` |
| `packages/core/src/repositories/booking/BookingRepository.ts` | UPDATE | 4 — typed `getClinicDetails` return |
| test files (core + mcp) | UPDATE/CREATE | each phase |

## NOT Building
- No supabase codegen pipeline — copy web's existing generated file as canonical.
- No mcp-server `Database`/`AppointmentStatus` unification (follow-up).
- No queue-status model changes beyond the literal fix.
- No `DoctorListing` field additions; only dedupe + reconcile `null`/`undefined`.

## Step-by-Step Tasks

### Phase 1 — Status correctness (`checked_in` → `waiting`)
**GOTCHA:** `callNext.ts`, `estimateWaitTime.ts`, `getSchedule.ts` are uncommitted resource-aware-queue WIP — these edits layer onto that working tree; commit path-scoped and flag for coordination.
- **Task 1.1** UPDATE `estimateWaitTime.ts:258`, `callNext.ts:181`, `getSchedule.ts:198`: replace `"checked_in"` with `"waiting"` (keep `"scheduled"`). MIRROR getPosition.
- **Task 1.2** UPDATE `getAppointments.ts:32,102`: replace `"checked_in"` with `"waiting"` in the zod `.enum([...])` and the JSON-schema `enum: [...]` (the filter surface).
- **Task 1.3** Add/extend a unit test asserting the wait-time / call-next counters include a `waiting` appointment (mirror the chainable-mock style from `searchDoctors.test.ts`); if those tools aren't unit-testable without heavy mocks, add a focused test on the status-filter predicate extracted to a pure helper.
- **VALIDATE:** `grep -rn "checked_in" apps/mcp-server/src` returns only `*_at` columns (zero status literals); mcp typecheck 0, tests pass.

### Phase 2 — Role-based `isDoctorLikeRole` (core + web)
- **Task 2.1** UPDATE core `ClinicRepository.isDoctorLikeRole`: remove the `if (specialization) return true` shortcut. Keep: `role.toLowerCase().includes('doctor')` OR membership in the clinical-role allowlist. (Null-guard already added.)
- **Task 2.2** UPDATE web `DoctorDirectory.tsx:36-55` identically (delete the `if (specialization) return true` line) so the two surfaces stay in parity.
- **Task 2.3** UPDATE `searchDoctors.test.ts`: the existing case "nurse with specialization → included" must flip to **excluded**; add a case proving `role` membership still includes a doctor with no specialization.
- **GOTCHA:** This is the one intentional behavior change (product-approved). A genuinely-clinical row whose `role` is non-standard AND has only a specialization will no longer surface — acceptable per decision.
- **VALIDATE:** core tests updated & green; web typecheck/build green.

### Phase 3 — `doctor_search` today in Africa/Casablanca
- **Task 3.1** UPDATE `doctor/search.ts`: replace `new Date().toISOString().slice(0,10)` with a civil-date in Morocco tz:
  ```ts
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(new Date());
  ```
  (`en-CA` yields `YYYY-MM-DD`.) Optionally extract `function todayInClinicTz(): string` for clarity.
- **GOTCHA:** `Intl` `Africa/Casablanca` tracks Morocco's civil offset (incl. Ramadan shifts) — don't hardcode `+1`. Not unit-tested (boundary `new Date()`); validated by typecheck + manual reasoning.
- **VALIDATE:** mcp typecheck 0; `doctor_search` still returns cards.

### Phase 4 — Canonical `Database` types + unify `DoctorListing` + typed clinic
- **Task 4.1** CREATE `packages/core/src/types/database.ts` = exact copy of `apps/web/src/integrations/supabase/types.ts` (exports `Json`, `Database`, `Tables`, `TablesInsert`, `TablesUpdate`, `Enums`, `CompositeTypes`, `Constants`). It has no relative imports → no `.js` edits needed.
- **Task 4.2** UPDATE `packages/core/src/types/index.ts`: add `export * from './database.js';` (MIRROR the cards barrel line).
- **Task 4.3** UPDATE `apps/web/src/integrations/supabase/types.ts`: replace its body with re-exports —
  ```ts
  export type { Json, Database, Tables, TablesInsert, TablesUpdate, Enums, CompositeTypes } from "@queuemed/core";
  export { Constants } from "@queuemed/core";
  ```
  (Preserves every name web imports today.)
- **Task 4.4** UPDATE core `ClinicRepository`: type the rows in `searchDoctors` and `mapToClinic` with `Tables<'clinics'>` / `Tables<'clinic_staff'>` / `Tables<'profiles'>` (import `Tables` from `'../../types.js'`); remove `Record<string,unknown>` + `as string` casts. Keep behavior identical (null/undefined coercions stay).
- **Task 4.5** UPDATE web `DoctorDirectory.tsx`: delete the local `DoctorListing` interface; `import type { DoctorListing } from "@queuemed/core"`. Reconcile fields: core uses optional `?: string` (undefined); web previously used `specialization: string | null`, `clinicSpecialty: string`, `city: string`. Adjust web usages to handle `undefined` (e.g. `specialization ?? null` at render, or update the JSX guards). 
- **Task 4.6** UPDATE `BookingRepository.getClinicDetails`: annotate return as `Promise<Pick<Tables<'clinics'>, 'id'|'name'|'specialty'|'settings'> | ...>` matching the `.select('id,name,specialty,settings')`. UPDATE `BookingService.getClinicInfo` so `clinic` is that picked type, not `unknown`.
- **GOTCHA:** core is NodeNext — `database.ts` is self-contained (no relative imports) so it's fine; the barrel add uses `.js`. Do NOT type `getClinicInfo.clinic` as full `Clinic` (the select is partial — missing `createdAt`, etc.).
- **VALIDATE:** core typecheck/test/build; mcp typecheck/test/build; **web build** (proves the re-export + DoctorListing unify); `grep "Record<string, unknown>" packages/core/src/repositories/clinic/ClinicRepository.ts` → none in searchDoctors.

## Testing Strategy
| Unit | Input | Expected | Phase |
|---|---|---|---|
| status filter | a `waiting` appointment | counted in callNext/estimateWaitTime/getSchedule | 1 |
| isDoctorLikeRole | `("receptionist","Administrative")` | `false` (was `true`) | 2 |
| isDoctorLikeRole | `("nurse","Cardiology")` | `false` (was `true`) | 2 |
| isDoctorLikeRole | `("doctor", undefined)` | `true` | 2 |
| isDoctorLikeRole | `("dentist", undefined)` | `true` (allowlist) | 2 |
| searchDoctors rows | typed rows, null column | compiles; null handled | 4 |
Edge checklist: empty results · null role/specialization · web build with unified type · grep shows zero `checked_in` status literals.

## Validation Commands
- `corepack pnpm --filter @queuemed/core typecheck|test|build`
- `corepack pnpm --filter @queuemed/mcp-server typecheck|test|build`
- `corepack pnpm --filter @queuemed/web build`
- `grep -rn "checked_in" apps/mcp-server/src` → only `*_at` columns
- `grep -n "Record<string, unknown>" packages/core/src/repositories/clinic/ClinicRepository.ts` → none in searchDoctors

## Acceptance Criteria
- [ ] Zero `"checked_in"` status literals in mcp-server; `waiting` counted everywhere.
- [ ] `isDoctorLikeRole` role-based, identical in core + web; non-clinical staff excluded; tests updated.
- [ ] `doctor_search` `today` computed in Africa/Casablanca.
- [ ] One canonical `Database` in core; web re-exports; core repos use Row types (no `Record<string,unknown>`/`as string` in searchDoctors); `DoctorListing` defined once; `getClinicInfo.clinic` precisely typed.
- [ ] core + mcp + web all typecheck/test/build green.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Web re-export breaks `Database["public"]...` imports | M | H | Re-export every original name; run web build (Task 4 VALIDATE) |
| `DoctorListing` unify surfaces `null`/`undefined` mismatches in web JSX | M | M | Adjust web render guards; web build catches all |
| Editing foreign-WIP queue files entangles commits | M | M | Path-scoped commits; coordinate with queue-WIP author |
| Tightened filter hides a mis-roled doctor | M | M | Broad clinical allowlist; product-approved |
| Generated `database.ts` drifts from real schema over time | L | M | Single canonical copy in core; regenerate there in future (noted, not built) |

## Confidence: 7/10
Phases 1–3 are small and certain. Phase 4's web `Database` relocation + `DoctorListing` unify is the −3: it touches a large generated file and web render code, validated by the web build. Recommend implementing phase-by-phase (1→2→3→4), validating after each.

> Next: `/implement .claude\PRPs\plans\discovery-queue-hardening.plan.md` (phase by phase).
