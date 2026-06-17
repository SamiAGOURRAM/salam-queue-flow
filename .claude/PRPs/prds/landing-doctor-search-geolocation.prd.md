# Landing Hero — Functional Doctor Search + IP Geolocation

> Status: DRAFT (spec gate). Next: `/plan .claude\PRPs\prds\landing-doctor-search-geolocation.prd.md`

## Problem Statement
The landing page (`PremiumLanding.tsx`) hero is the product's front door, but it is **half-wired and pointed at the wrong entity**:
- The location badge is a hard-coded "Morocco" label; "change location" just focuses the input. There is **no geolocation** anywhere in the codebase — every visitor sees the same country-level default regardless of where they are.
- The search box submits to `/clinics?search=…&city=…` (clinic search), but the product intent is **doctor-first discovery** (a patient wants *a doctor*, who happens to sit inside a clinic — the Uber "find a driver", not "find a depot" model). Today a doctor search is a dead end on the landing page.
- Typing does nothing until submit — no live feedback, so the highest-intent moment (a half-typed specialty) is wasted.

Cost of not solving: the hero converts poorly, the doctor-first booking model the rest of the app already supports (`/booking/:clinicId?staffId=`, `DoctorDirectory`, the AI agent's `doctor_search`) is invisible at the entry point, and "minimum friction" is undercut by a country-level location and a submit-only search.

## Evidence
- `PremiumLanding.tsx:138-148` — location badge renders `t('landing.location.morocco')`; "change location" only calls `locationInputRef.current?.focus()`.
- `PremiumLanding.tsx:110-116` — `handleSearch` builds `?search=&city=` and `navigate('/clinics'…)`.
- `DoctorDirectory.tsx:54-122` — a working doctor directory already exists at `/doctors`, but it ignores URL params and fetches/filters entirely client-side.
- `packages/core` already ships a doctor-search contract (`ClinicService.searchDoctors` → `ClinicRepository.searchDoctors` → `DoctorListing[]`, types in `packages/core/src/types/index.ts:181-197`) consumed by the AI agent's `doctor_search` MCP tool (`apps/mcp-server/src/tools/doctor/search.ts`).
- Assumption — validate with Florence: IP-level city accuracy (city, not GPS) is good enough for a *default* that the user can override. (User chose "IP now, GPS opt-in later".)

## Proposed Solution
Make the hero a doctor-first, low-friction entry point in three layers, **backend-first**:

1. **Contract (SSOT):** give the web's own service layer a `searchDoctors(params): Promise<DoctorListing[]>` on `ClinicService` + `ClinicRepository`, reusing the `DoctorListing`/`DoctorSearchParams` types already exported from `@queuemed/core`. This mirrors the logic that today lives inline in `DoctorDirectory` and in `@queuemed/core`'s repository — one stable web contract that the hero typeahead AND `DoctorDirectory` consume. (We deliberately do **not** add a Postgres RPC yet — see Technical Approach.)
2. **Hooks:** `useDoctorSearch(filters)` (debounced react-query over the new service method, mirroring `useClinicSearch`) and `useDetectedLocation()` (silent IP lookup → city, with an opt-in `requestPreciseLocation()` GPS path).
3. **UI:** a live typeahead dropdown in the hero (doctors + a specialty group), each result deep-linking straight to `/booking/:clinicId?staffId=…`; submit/Enter navigates to `/doctors?search=&city=` with filters prefilled; `DoctorDirectory` reads those params. The location field is prefilled from the detected city (falls back to "Morocco"), with a "📍 use exact location" affordance that triggers the GPS prompt only on click.

Why this over alternatives: it reuses the existing, agent-proven contract (no duplicated search semantics, no schema migration), keeps the web's repository pattern intact, and concentrates new work in the UI layer where the Uber-level polish actually lives.

## Key Hypothesis
We believe a **doctor-first live typeahead with an auto-detected city** will raise hero→booking conversion for **first-time patients landing on `/`**. Right when (a) a measurable share of hero searches resolve to a doctor-detail/booking deep-link rather than bouncing, and (b) the location field is correctly pre-filled to the visitor's city on load without a click.

## What We're NOT Building
- **A new Postgres `search_doctors` RPC** — the existing TS contract in `@queuemed/core` + the web service already covers it; an RPC is a later optimization once staff volume exceeds the bounded client-side scan. Noted as a future risk, not v1 scope.
- **GPS-by-default / forced permission prompt** — opt-in only (user decision). No prompt on load.
- **Reverse-geocoding precision beyond city** — IP gives city; GPS opt-in resolves to the nearest known city, not a map pin.
- **Map view, distance sorting, "near me" radius ranking** — out of scope for v1; city-level filter only.
- **Changing the clinic search** (`/clinics`, `useClinicSearch`) — left intact; "Browse all clinics" still works.
- **Auth/booking flow changes** — deep-links use the existing `/booking/:clinicId?staffId=` route unchanged.

## Success Metrics
| Metric | Target | How Measured |
|--------|--------|--------------|
| Hero search reaches a doctor | Submitting/selecting routes to `/doctors?…` or `/booking/:clinicId?staffId=` (never `/clinics`) | Manual + route assertion |
| Location auto-detected on load | City prefilled from IP with **0 clicks**; "Morocco" only on lookup failure | Manual in browser + unit test of fallback |
| Typeahead latency | Dropdown updates ≤ ~300ms after typing stops (debounced), no UI flicker | Manual; `placeholderData` keep-previous |
| `DoctorDirectory` honors deep-link | `/doctors?search=cardio&city=Casablanca` lands pre-filtered | Manual + test |
| No regressions | type-check + existing web tests green | `tsc`/`vitest` |
| Graceful degradation | IP API failure, GPS denial, and zero-results each show a sensible state, never a crash/blank | Manual + unit tests on the hooks |

## Users & Context
**Primary user:** a Moroccan patient arriving at `/` (often mobile, often first-time, no account). Current behavior: types a need, gets sent to a clinic list. Trigger: "I need to see a [dermatologist] [near me], soon." Success state: sees the right doctor (with next-slot context) and reaches booking in the fewest taps.
**Job-to-be-done:** "When I land on the site needing care, I want to find the right *doctor* near me and see when they're free, so I can book without hunting through clinics."
**Non-users:** clinic staff/owners (they use `/clinic/*` and `/auth`); the AI chatbot (already has `doctor_search`) — though it shares the same core contract.

## Solution Detail

### MoSCoW
| Priority | Item | Rationale |
|----------|------|-----------|
| Must | `ClinicService.searchDoctors` + `ClinicRepository.searchDoctors` (web) reusing core `DoctorListing` type | Backend-first stable contract; SSOT on the type |
| Must | `useDoctorSearch` hook (debounced, react-query, keep-previous) | Powers both hero typeahead and `/doctors` |
| Must | `useDetectedLocation` hook: silent IP→city, fallback "Morocco", opt-in GPS | The geolocation requirement |
| Must | Hero typeahead dropdown (doctors + specialty group) with keyboard nav + deep-link on select | The core UX decision |
| Must | Hero submit → `/doctors?search=&city=`; `DoctorDirectory` reads URL params | Makes search functional & doctor-first |
| Should | Location field prefilled from detected city + "use exact location" button | Friction reduction + opt-in GPS |
| Should | `DoctorDirectory` consumes `useDoctorSearch` (remove its inline join) | Kills duplication; one contract |
| Could | Specialty suggestions ranked/counted ("Cardiology · 12 doctors") | Nice typeahead polish |
| Could | Persist last-detected city (localStorage) to skip repeat IP calls | Perf/cost |
| Won't | Postgres RPC, map/distance, GPS-by-default | See "NOT Building" |

### MVP (minimum to test the hypothesis)
Typeahead backed by `useDoctorSearch` + IP-prefilled location with "Morocco" fallback + submit routing to a param-aware `/doctors`. Specialty-group ranking and localStorage caching can follow.

### Critical user flow
1. User lands on `/` → `useDetectedLocation` fires IP lookup → location field shows "Casablanca" (or "Morocco" on failure).
2. User types "cardio" → debounced `useDoctorSearch({ name/specialty: 'cardio', city })` → dropdown shows matching doctors + a "Cardiology" specialty row.
3a. User clicks a doctor → `navigate('/booking/:clinicId?staffId=…')` (existing route).
3b. User presses Enter / clicks Search → `navigate('/doctors?search=cardio&city=Casablanca')` → `DoctorDirectory` opens pre-filtered.
4. (Optional) User clicks "📍 use exact location" → browser GPS prompt → on allow, resolve to nearest known city and refine filter; on deny, keep IP/default.

## Technical Approach
**Feasibility: HIGH.** The contract, types, routes, and booking deep-link all already exist; the booking model is already doctor-first (next-slot RPC keys on `staffId`). Most work is one service method + two hooks + hero UI.

**Architecture notes:**
- Reuse `@queuemed/core` `DoctorListing` / `DoctorSearchParams` types (already a web dep, `"@queuemed/core": "file:../../packages/core"`); do not redefine them.
- New web service method mirrors `packages/core/.../ClinicRepository.searchDoctors` (clinics→clinic_staff→profiles join, role-gated via `isDoctorLikeRole`, bounded staff scan, name/city/specialty filter). Keep `isDoctorLikeRole` in parity (consider one shared helper to avoid drift across web ↔ core ↔ `DoctorDirectory`).
- IP geolocation: a keyless free endpoint (e.g. `ipapi.co/json`) called client-side; wrap in a hook with timeout + abort + fallback. GPS opt-in via `navigator.geolocation`, resolved to nearest known city from `clinicStats.cities` (already fetched in `PremiumLanding`).
- Typeahead: debounce (reuse `useDebounce`, 300ms as `useClinicSearch` does), `placeholderData: keepPrevious` to avoid flicker, `limit` ~6–8 for the dropdown.

**Technical-risk table:**
| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Free IP API rate-limits / is blocked / slow | Med | Timeout + abort; fallback to "Morocco"; optional localStorage cache; keep provider swappable behind the hook |
| Privacy (sending visitor IP to a 3rd party) | Med | Document it; pick a provider with an acceptable policy; confirm with Florence; lazy-call only on landing |
| Detected city ≠ any clinic city (free-text `city`) | Med | City filter is `ilike`/contains, not exact; if zero results, show "no doctors in <city>" with a clear-city CTA (never a blank) |
| `isDoctorLikeRole` drift across 3 copies | Low | Extract/share one helper as part of this work |
| Unbounded staff scan as data grows | Low (now) | Keep core's `MAX_STAFF_SCAN` cap; flag RPC as the future fix when it bites |
| Mixing detected free-text city into an `eq` filter | Low | Use `ilike`-contains semantics matching core, not `eq` |

**AI-feature notes:** No new LLM surface. The same core contract powers the agent's `doctor_search`, so keeping the web method behavior-compatible keeps agent ↔ web parity. No new lethal-trifecta exposure (read-only public discovery; booking deep-link is code-minted, never user/model-authored — preserve that branding).

**Eval/verification:** Unit tests on `useDetectedLocation` fallback paths (success / failure / GPS deny) and on the search service mapping; route-level assertions that hero never routes to `/clinics`; manual browser check of auto-detected city and typeahead.

## Implementation Phases
> Plan: `.claude\PRPs\plans\landing-doctor-search-geolocation.plan.md` (covers phases 1–5 in one pass).

> Report: `.claude\PRPs\reports\landing-doctor-search-geolocation-report.md` — all phases complete (tsc 0 errors · 17/17 tests · build OK · lint clean). Manual browser pass still recommended.

| # | Phase | Description | Status | Depends |
|---|-------|-------------|--------|---------|
| 1 | Backend contract | Add `searchDoctors` to web `ClinicService` + `ClinicRepository`; share `isDoctorLikeRole`; reuse core types | complete | — |
| 2 | Hooks | `useDoctorSearch` (debounced rq) + `useDetectedLocation` (IP + GPS opt-in) | complete | 1 |
| 3 | Hero wiring | Typeahead dropdown, deep-link on select, submit→`/doctors?…`, location prefill + GPS button | complete | 2 |
| 4 | `/doctors` params + dedup | `DoctorDirectory` reads URL params and consumes `useDoctorSearch` (drop inline join) | complete | 1,2 |
| 5 | Verify | type-check, tests, manual browser pass against Success Metrics | complete | 3,4 |

## Open Questions
- [ ] IP provider choice + privacy posture — is `ipapi.co` (keyless, free tier) acceptable, or is there a preferred provider / a need to proxy the call server-side to avoid exposing it? (Default assumed: client-side `ipapi.co` with fallback.)
- [ ] Should the detected city auto-apply as a *filter* on `/doctors`, or only *prefill* the field for the user to confirm? (Default assumed: prefill + auto-apply, user can clear.)
- [ ] Specialty taxonomy for the typeahead's "specialty group" — derive from distinct clinic specialties (free text), or a curated list? (Default assumed: distinct from data, like `DoctorDirectory` does today.)
- [ ] Confirm city matching semantics: `ilike`-contains (core's behavior) vs exact — affects "Rabat" vs "Rabat-Salé". (Default assumed: contains.)
```
