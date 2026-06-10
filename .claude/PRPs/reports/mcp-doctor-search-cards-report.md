# Implementation Report: doctor_search → Doctor Cards incl. Next Slot (Phase 3)

## Summary
Added a public `doctor_search` MCP tool returning the `doctor_cards` `DiscoveryCards`
payload — each card a real provider with specialty, clinic, **next available slot**,
and a code-minted `bookingHref` that preselects the doctor (`?staffId=`). Built
backend-first: new `@queuemed/core` `ClinicService.searchDoctors` (+ repository) and
`BookingService.getNextAvailableSlot`, both unit-tested, land first; the MCP tool
composes them and maps to cards.

## Assessment vs Reality
| Metric | Predicted | Actual |
|---|---|---|
| Complexity | Large | Large — held (5 core + 3 mcp files) |
| Confidence | 8/10 | Held; no surprises (NodeNext dep landed first, so all calls were genuinely typed) |
| Files | ~5 core + ~3 mcp | 5 core (types, repo, service, +2 tests) + 4 mcp (tool, test, registry, roleGuard) |

## Tasks Completed
| # | Task | Status |
|---|---|---|
| 1 | Core types `DoctorListing`/`DoctorSearchParams` | ✅ |
| 2 | `ClinicRepository.searchDoctors` + ported `isDoctorLikeRole` | ✅ |
| 3 | `ClinicService.searchDoctors` | ✅ |
| 4 | `BookingService.getNextAvailableSlot` (capped forward scan) | ✅ |
| 5 | Core unit tests (slot scan + doctor query) | ✅ 10 tests |
| 6 | `doctor/search.ts` tool + `buildDoctorCards` | ✅ |
| 7 | Register tool + **`doctor_search: "public"` permission** | ✅ |
| 8 | `buildDoctorCards` unit test | ✅ 4 tests |

## Validation Results
| Level | Status | Notes |
|---|---|---|
| core typecheck | ✅ 0 | |
| core tests | ✅ 14/14 | +5 `getNextAvailableSlot`, +5 `searchDoctors` |
| core build | ✅ | dist rebuilt (consumed by mcp-server) |
| mcp-server typecheck | ✅ 0 | calls genuinely typed (NodeNext dep) |
| mcp-server tests | ✅ 10/10 | +4 `buildDoctorCards` |
| mcp-server build | ✅ | clean, no test-file leak |

## Files Changed
| File | Action | Notes |
|---|---|---|
| `packages/core/src/types/index.ts` | UPDATE | `DoctorListing`, `DoctorSearchParams` |
| `packages/core/src/repositories/clinic/ClinicRepository.ts` | UPDATE | `searchDoctors` + module `isDoctorLikeRole` |
| `packages/core/src/services/clinic/ClinicService.ts` | UPDATE | `searchDoctors` wrapper |
| `packages/core/src/services/booking/BookingService.ts` | UPDATE | `getNextAvailableSlot` + `addDaysUtc` |
| `packages/core/src/services/booking/getNextAvailableSlot.test.ts` | CREATE | 5 tests |
| `packages/core/src/repositories/clinic/searchDoctors.test.ts` | CREATE | 5 tests (chainable db mock) |
| `apps/mcp-server/src/tools/doctor/search.ts` | CREATE | tool + `buildDoctorCards` |
| `apps/mcp-server/src/tools/doctor/search.test.ts` | CREATE | 4 tests |
| `apps/mcp-server/src/tools/index.ts` | UPDATE | register def + executor |
| `apps/mcp-server/src/middleware/auth/roleGuard.ts` | UPDATE | `doctor_search: "public"` |

## Deviations from Plan (WHAT / WHY)
1. **`searchDoctors` lives on `ClinicService`** (method, not a new `StaffService`) — as decided in plan (avoids container churn; clinic-scoped discovery). No deviation, recorded for clarity.
2. **`getNextAvailableSlot` calls `this.repository.getAvailableSlotsForMode` directly** instead of the service wrapper — avoids nested `setContext/clearContext` log-context churn per scanned day. Same data, cleaner logging.
3. **Plan's "no TOOL_PERMISSIONS entry needed" was wrong.** roleGuard is **deny-by-default** (a tool absent from `TOOL_PERMISSIONS` is denied), and `clinic_search` *does* have an explicit `"public"` entry. Added `"doctor_search": "public"` — without it the tool would be unreachable. Caught during Task 7 by reading `canAccessTool` ("if tool not in list, deny by default").

## Tests Written
| File | Tests | Coverage |
|---|---|---|
| `getNextAvailableSlot.test.ts` | 5 | slot day0 · forward-scan to later day · fluid date-only · null within cap · maxDays cap honored |
| `searchDoctors.test.ts` | 5 | doctor-like filter (excl. receptionist, incl. specialized nurse) · field mapping · name filter · limit · empty clinics → [] |
| `doctor/search.test.ts` | 4 | empty→undefined · full mapping w/ slot + `?staffId=` href · missing slot→undefined · shared clinic slot + distinct hrefs |

## Architecture / Security Notes
- **Next-slot N+1 avoided:** computed once per **unique clinic** (deduped `Set`), shared across that clinic's doctors; `limit` (default 10) + `maxDays` (default 14) cap the work. `getNextAvailableSlot` takes `fromDate` as a param (kept out of core), so it's deterministic/testable; the tool supplies `today` at its boundary.
- **Auth:** `doctor_search` is `public`, read-only, public fields only (name, specialty, clinic, city, slot) — no provider PHI. Reads run under the caller's JWT-scoped container (RLS).
- **bookingHref** branded + code-minted via `buildBookingHref({clinicId, staffId})` — never model-authored.

## Open / Follow-up
- **RLS:** depends on the existing public-SELECT policies on `clinic_staff` + `profiles` (project lesson) — verify with an anon query before Phase 4 wiring.
- Phase 4 (chat rendering) and Phase 5 (auth eval suite incl. cross-role denial) still pending.
- Nothing committed for Phase 3 + the NodeNext fix yet (staged on `feat/showcase-ai-chatbot`).
