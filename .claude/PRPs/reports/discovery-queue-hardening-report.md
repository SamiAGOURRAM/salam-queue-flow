# Implementation Report: Discovery & Queue-Status Hardening (post-review batch)

## Summary
Implemented all 4 PRD phases: (1) `checked_in`→`waiting` across mcp; (2) role-based
`isDoctorLikeRole` in core + web; (3) `doctor_search` `today` in Africa/Casablanca;
(4) canonical generated `Database` in `@queuemed/core` (web re-exports), typed rows
in `searchDoctors`, unified `DoctorListing`, and typed `getClinicInfo`. Done
phase-by-phase with validation after each.

## Assessment vs Reality
| Metric | Predicted | Actual |
|---|---|---|
| Complexity | Large | Large — held |
| Confidence | 7/10 | Held; Phase 4's web `Database` move landed clean (re-export type-neutral) |
| Files | ~14 | 13 source + 1 generated copy |

## Validation Results
| Level | Status | Notes |
|---|---|---|
| core typecheck | ✅ 0 | |
| core tests | ✅ 14/14 | searchDoctors filter test updated for role-based behavior |
| core build | ✅ | |
| mcp typecheck | ✅ 0 | |
| mcp tests | ✅ 10/10 | |
| mcp build | ✅ | no test-file leak |
| web build | ✅ | `vite build` 12.6s |
| web `tsc --noEmit` | ⚠️ 11 pre-existing | all in foreign WIP (analytics/queue/referrals); **0 in my files**; my change reduced errors vs stale-HEAD baseline (97→11) |
| grep `checked_in` (status) | ✅ 0 | only `*_at` columns remain |

## Files Changed
| File | Phase | Change |
|---|---|---|
| `apps/mcp-server/src/tools/ml/estimateWaitTime.ts` | 1 | `checked_in`→`waiting` |
| `apps/mcp-server/src/tools/queue/callNext.ts` | 1 | `checked_in`→`waiting` |
| `apps/mcp-server/src/tools/queue/getSchedule.ts` | 1 | filter `waiting` (kept `checkedIn` key) |
| `apps/mcp-server/src/tools/patient/getAppointments.ts` | 1 | filter enum (zod + JSON-schema) |
| `apps/mcp-server/src/tools/booking/cancel.ts` | 1 | stale message text (6th site found) |
| `packages/core/src/repositories/clinic/ClinicRepository.ts` | 2,4 | role-based filter; typed rows in searchDoctors |
| `apps/web/src/components/booking/DoctorDirectory.tsx` | 2,4 | role-based filter; import core `DoctorListing` |
| `apps/mcp-server/src/tools/doctor/search.ts` | 3 | `today` via Africa/Casablanca |
| `packages/core/src/types/database.ts` | 4 | CREATE — canonical generated `Database` (copied from web working-tree) |
| `packages/core/src/types/index.ts` | 4 | `export * from './database.js'` |
| `apps/web/src/integrations/supabase/types.ts` | 4 | re-export from `@queuemed/core` |
| `packages/core/src/services/booking/BookingService.ts` | 4 | typed `getClinicInfo.clinic` |
| `packages/core/src/repositories/booking/BookingRepository.ts` | 4 | exported `ClinicDetails`; typed `getClinicDetails` |
| `packages/core/src/repositories/clinic/searchDoctors.test.ts` | 2 | flipped nurse+spec → excluded; added dentist allowlist case |

## Deviations from Plan (WHAT / WHY)
1. **6th `checked_in` site fixed** — `cancel.ts:164` had a stale *message* listing `checked_in` as cancellable (logic is denylist-based, so no behavior bug); corrected to `waiting` for accuracy.
2. **`getSchedule` summary key kept as `checkedIn`** — only the status literal in its filter changed to `waiting` (renaming the output key risked breaking the agent-facing JSON shape; a waiting patient is "checked in").
3. **`isDoctorLikeRole` lost its `specialization` parameter** (not just the shortcut line) — it became unused; removed it and updated both callers (core + web) for cleanliness.
4. **Phase-4 row typing scoped to `searchDoctors` only, NOT `mapToClinic`** — typing `mapToClinic` with `Tables<'clinics'>` surfaced a SEPARATE pre-existing bug: the `clinics` table column is `phone`, not `phone_number`, so `mapToClinic` reads a nonexistent `row.phone_number` and `clinic.phoneNumber` is always `undefined`. Fixing that changes clinic-info behavior app-wide → out of scope for this review batch. **Flagged as follow-up.**
5. **No dedicated Phase-1 status test added** — the affected tools (`callNext`/`estimateWaitTime`/`getSchedule`) are foreign queue-WIP with no unit harness; extracting their inline predicates into testable helpers would refactor foreign code. Verified instead by grep (zero status literals) + typecheck. (Plan Task 1.3 allowed this fallback.)
6. **`getClinicInfo.clinic` typed as `ClinicDetails` (a `Pick`), not full `Clinic`** — `getClinicDetails` selects only `id,name,specialty,settings`; full `Clinic` would be a lie (missing `createdAt` etc.). Exported `ClinicDetails` from `BookingRepository` as the single source.
7. **Canonical `database.ts` copied from web's WORKING-TREE generated file** (newer than HEAD's, which is stale vs referral/medical-records code). This is why the re-export *reduced* web's error count from the stale-HEAD baseline.

## Issues Encountered & Resolutions
- **`isDoctorLikeRole` test flip:** the role tightening makes "nurse + specialization" excluded — updated the test (added a `dentist` allowlist case to prove role-based inclusion still works).
- **`vite build` doesn't type-check:** ran `tsc --noEmit -p tsconfig.app.json` directly; confirmed 11 errors are all pre-existing foreign WIP (none mine).
- **searchDoctors `.limit()` mock gap** (from the prior review fix) already resolved.

## Flags for Florence
- **`mapToClinic` reads `row.phone_number` but the column is `phone`** → clinic phone is always undefined app-wide. Pre-existing; deferred (out of this batch's scope). Worth a small follow-up.
- **Web has no `tsc` typecheck gate** — 11 latent type errors in analytics/queue/referrals/medical-records WIP. Consider adding a `typecheck` script + CI step.
- **mcp-server `Database` unification deferred** — its `adapters/supabase/types.ts` still independent.
- **Commit coordination:** Phase 1 edited foreign queue-WIP files (`callNext`/`estimateWaitTime`/`getSchedule`) and Phase 4 touched the foreign-WIP web `types.ts`/referral-adjacent area — path-scoped commits + coordinate with the queue/referrals workstream owner.

## Acceptance Criteria
- [x] Zero `checked_in` status literals; `waiting` counted everywhere.
- [x] Role-based `isDoctorLikeRole` identical in core + web; non-clinical staff excluded; tests updated.
- [x] `doctor_search` `today` in Africa/Casablanca.
- [x] Canonical `Database` in core; web re-exports; `searchDoctors` uses Row types (no `Record<string,unknown>`/`as string`); `DoctorListing` defined once; `getClinicInfo.clinic` precisely typed.
- [x] core + mcp typecheck/test/build green; web build green; no new web type errors.

## Code Review (post-implementation: code-reviewer + general-purpose blast-radius + type-design-analyzer)
3 parallel finders → candidates verified against code + tsc.

**Fixed (2):**
- **`DoctorDirectory` `cities` memo** lacked the undefined-filter its sibling `specialties` memo has; with `DoctorListing.city` now `string|undefined` this was a (theoretical — `clinics.city` is NOT NULL, so no runtime crash today) gap. Added `.filter((v): v is string => Boolean(v))` for parity + type-cleanliness.
- **`getSchedule` summary key `checkedIn`** counted `status === "waiting"` — misleading name. Renamed key → `waiting` (interface + object); no other references.

**Refuted / deferred (not changed):**
- `getClinicInfo.clinic.settings: Json|null` "moves the unknown problem" — the `clinic_getInfo` settings reader uses a *different* typed `Clinic` path (mcp typecheck 0); `getClinicInfo`'s `clinic.settings` is unused by callers and is strictly better than the old `unknown`. Deferred: narrow to `ClinicSettings` later.
- `getClinicDetails` `data as ClinicDetails` null risk — `.single()` errors (PGRST116) on no rows and is caught, so `data` is non-null. Refuted.
- `MAX_STAFF_SCAN` cap applied before role filter can under-deliver when a clinic set has >200 mostly-non-doctor staff — real but low-impact (generous cap); deferred (DB-side role filter is a separate refinement).
- `DoctorListing.role: string` not `StaffRole`; `export * from './database.js'` exposes the whole schema as core's public surface — valid layering/enhancement notes, not bugs; deferred.

Re-validated: mcp typecheck 0, tests 10/10; web DoctorDirectory clean.

## Next Steps
- [ ] `/code-review` the batch (optional — small, well-tested).
- [ ] Commit (path-scoped; coordinate foreign-WIP files).
- [ ] Follow-ups: `phone_number`→`phone` in `mapToClinic`; web `tsc` gate; mcp `Database` unification.
