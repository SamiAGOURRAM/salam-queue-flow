# Implementation Report: Landing Hero — Functional Doctor Search + IP Geolocation

## Summary
Rewired the `PremiumLanding` hero into a doctor-first, low-friction entry point: a live debounced typeahead (doctors + specialty group) backed by a new web `ClinicService.searchDoctors` contract, an IP-detected city default (client-side `ipapi.co`, "Morocco" fallback, GPS opt-in), submit→`/doctors?search=&city=`, and a param-aware `DoctorDirectory` that now consumes the same hook (its duplicated 3-query join removed). Built backend-first by reusing the `DoctorListing`/`DoctorSearchParams` contract already shipped in `@queuemed/core`.

## Predicted vs Actual
| | Predicted | Actual |
|---|-----------|--------|
| Complexity | Medium (~7 src + 3 i18n + 2 tests) | Medium — matched exactly |
| Confidence | 8/10 | Justified; all code gates passed first try |
| Files | 10 | 10 (+0 unplanned source files) |
| Surprise | — | **Toolchain was broken**: `apps/web` & others had `node_modules` installed by **npm**, not pnpm → no CLI tool (tsc/vitest/vite) could launch. Required a `pnpm install` repair (see Issues). |

## Tasks
| # | Task | Status |
|---|------|--------|
| 1 | Shared `isDoctorLikeRole` helper (`src/lib/isDoctorLikeRole.ts`) | ✅ |
| 2 | `ClinicRepository.searchDoctors` (web) mirroring core | ✅ |
| 3 | `ClinicService.searchDoctors` delegating + error coercion | ✅ |
| 4 | `useDoctorSearch` debounced react-query hook | ✅ |
| 5 | `useDetectedLocation` (IP + GPS opt-in, abort/timeout, fallback) | ✅ |
| 6 | Hero typeahead + geolocation wiring + submit→/doctors | ✅ |
| 7 | Param-aware `DoctorDirectory` consuming the hook (join removed) | ✅ |
| 8 | i18n keys (en + fr + ar) | ✅ |
| 9 | Tests (ClinicService.searchDoctors ×2, useDetectedLocation ×4) | ✅ |

## Validation Results
- **Type-check**: `tsc -p tsconfig.app.json --noEmit` → **0 errors** (whole web app).
- **Unit tests**: `vitest run` on the two suites → **17 passed** (13 ClinicService incl. 2 new + 4 useDetectedLocation).
- **Build**: `pnpm build` (vite) → **success** (EXIT 0). Pre-existing chunk-size warning only (large image assets), unrelated.
- **Lint**: `eslint` on all 8 changed files → **0 problems**.

## Files Changed
- CREATE `apps/web/src/lib/isDoctorLikeRole.ts`
- CREATE `apps/web/src/hooks/useDoctorSearch.ts`
- CREATE `apps/web/src/hooks/useDetectedLocation.ts`
- CREATE `apps/web/src/hooks/useDetectedLocation.test.ts`
- UPDATE `apps/web/src/services/clinic/repositories/ClinicRepository.ts` (+`searchDoctors`)
- UPDATE `apps/web/src/services/clinic/ClinicService.ts` (+`searchDoctors`)
- UPDATE `apps/web/src/components/landing/PremiumLanding.tsx` (typeahead + geolocation + routing)
- UPDATE `apps/web/src/components/booking/DoctorDirectory.tsx` (URL params + hook; inline join & local role helper removed)
- UPDATE `apps/web/src/locales/{en,fr,ar}/translation.json` (hero doctor-search + location keys)
- UPDATE `apps/web/src/services/clinic/ClinicService.test.ts` (+searchDoctors cases)

## Deviations (WHAT / WHY)
1. **DoctorDirectory data flow** — WHAT: fetch the full doctor set once via `useDoctorSearch({})` and keep city/specialty/text filtering client-side, rather than pushing all three filters server-side. WHY: preserves the directory's existing dropdown-option UX (server-side specialty filtering would collapse the specialty dropdown to a single option) while still removing the duplicated join. The hero typeahead uses the scalable server-filtered path (`search`+`city`+`limit`).
2. **GPS reverse-geocoding** — WHAT: used keyless BigDataCloud reverse-geocode for the opt-in GPS path (plan said "nearest known city"). WHY: GPS yields lat/lng but known cities have no coordinates, so nearest-by-distance isn't computable; resolve the coords to a city name, then prefer a `knownCities` match. Same keyless/client-side constraint as the IP decision.

## Issues & Resolutions
- **Toolchain dead on arrival (root-caused & fixed).** No spawned process (Bash sandbox, PowerShell, or turbo) could launch `tsc`/`vitest`/`vite` — every invocation failed with "Cannot find module react" / "vitest not found". Root cause: `apps/web`, `apps/chat-api`, `apps/mcp-server`, `packages/core` had `node_modules` **installed by npm**, not pnpm, so the per-package symlinks and Windows `.CMD`/`.ps1` bin shims the pnpm workspace expects were absent/stale (the VS Code TS server, already loaded, still resolved fine — masking it). Fix: `pnpm install` at the root, which migrated the foreign npm packages to `.ignored` and laid down proper pnpm symlinks/shims. One stale `.ignored/@types/node` blocked the first run with `EACCES`; removed the four leftover `.ignored` dirs and re-ran → clean. After the repair, all gates ran normally.
- **Misleading IDE diagnostics.** During implementation, `mcp__ide__getDiagnostics` reported `DoctorDirectory.tsx` as full of "Cannot find module 'react'" errors while sibling files with identical imports were clean — a stale/degraded tsserver program snapshot caused by the broken install. The authoritative `tsc` run post-repair confirmed the file is error-free.

## Tests Written
- `ClinicService.searchDoctors`: delegates to repo with params; coerces unexpected errors to `DatabaseError`.
- `useDetectedLocation`: IP success → city/detected/source=ip; IP failure → fallback/null; empty payload → fallback; GPS denial → keeps current city.

## Follow-ups / Notes
- The npm-vs-pnpm `node_modules` conflict likely came from a tool running `npm install` in `apps/web`. Recommend always using `pnpm` in this workspace to avoid recurrence.
- Manual browser pass against Success Metrics still recommended (IP prefill, typeahead select → booking, submit → `/doctors` pre-filtered) — covered next by `/verify` or a dev-server check.
- Scaling note unchanged from plan: `MAX_STAFF_SCAN=200` cap retained; a Postgres `search_doctors` RPC remains the documented future optimization.
