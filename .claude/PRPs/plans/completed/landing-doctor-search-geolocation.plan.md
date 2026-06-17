# Plan: Landing Hero — Functional Doctor Search + IP Geolocation

## Summary
Make the `PremiumLanding` hero a doctor-first, low-friction entry point: a live typeahead (doctors + specialty group) backed by a new web `ClinicService.searchDoctors` contract, an IP-detected city default (client-side `ipapi.co`, "Morocco" fallback, GPS opt-in), submit→`/doctors?search=&city=`, and a param-aware `DoctorDirectory` that consumes the same hook (removing its duplicated inline join).

## User Story
As a first-time Moroccan patient landing on `/`, I want to type a doctor or specialty and immediately see matching providers near my (auto-detected) city, so I can jump straight to booking with minimum friction.

## Problem → Solution
- **Problem:** hero location is a hard-coded "Morocco" label; search routes to `/clinics`; typing gives no live feedback.
- **Solution:** doctor-first typeahead + IP city default, built on the doctor-search contract that already exists in `@queuemed/core` (reuse its `DoctorListing` type), surfaced through one web hook used by both the hero and `/doctors`.

## Metadata
- **Complexity:** Medium (≈7 files: 2 service-layer, 2 hooks, 1 hero, 1 directory, 3 i18n + 2 test files).
- **Source PRD:** `.claude\PRPs\prds\landing-doctor-search-geolocation.prd.md` — covers PRD phases 1–5 in one pass (they are tightly coupled and individually small).
- **Decision locked:** IP geolocation is **client-side** (`ipapi.co/json`, keyless), with timeout/abort + "Morocco" fallback.

---

## Mandatory Reading
| Priority | File | Lines | Why |
|----------|------|-------|-----|
| P0 | `apps/web/src/components/landing/PremiumLanding.tsx` | 31-243 | Hero state, `handleSearch`, location badge, search form — the surface being rewired |
| P0 | `apps/web/src/components/booking/DoctorDirectory.tsx` | 47-162 | Existing doctor join + JS filters to replace with the hook + URL params |
| P0 | `apps/web/src/services/clinic/repositories/ClinicRepository.ts` | 1-58 | Web repo pattern (supabase client, try/catch + `DatabaseError`) to mirror for `searchDoctors` |
| P0 | `apps/web/src/services/clinic/ClinicService.ts` | 56-103, 295 | Web service pattern + singleton `clinicService` export to extend |
| P0 | `packages/core/src/repositories/clinic/ClinicRepository.ts` | 30-188 | Canonical `searchDoctors` logic + `isDoctorLikeRole` to mirror exactly |
| P0 | `packages/core/src/types/index.ts` | 181-197 | `DoctorListing` / `DoctorSearchParams` — reuse, do NOT redefine |
| P1 | `apps/web/src/hooks/useClinicSearch.ts` | 161-251 | react-query + `useDebounce` + `placeholderData` + sort/limit pattern to mirror for `useDoctorSearch` |
| P1 | `apps/web/src/hooks/useDebounce.ts` | 11-23 | Debounce signature `useDebounce(value, 300)` |
| P1 | `apps/web/src/services/clinic/ClinicService.test.ts` | 16-74 | Vitest mock-repository test structure to mirror |
| P1 | `apps/web/src/locales/en/translation.json` | `landing.location`, `landing.search` | Keys to add (also fr + ar) |
| P2 | `apps/web/src/App.tsx` | 107-112 | Routes confirmed: `/doctors`, `/clinics`, `/booking/:clinicId` |

**RLS note:** migrations `20260603000003_open_clinic_staff_public_read.sql` and `20260603000004_open_doctor_profiles_for_patient_booking.sql` already grant public read on `clinic_staff` + `profiles`, so unauthenticated discovery works. No migration needed.

---

## Patterns to Mirror (real snippets)

### DATA_ACCESS — web repository (supabase + try/catch + DatabaseError)
```ts
// SOURCE: apps/web/src/services/clinic/repositories/ClinicRepository.ts:39-58
async getClinic(clinicId: string): Promise<ClinicRow> {
  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('*')
      .eq('id', clinicId)
      .single();
    if (error || !data) {
      logger.error('Clinic not found', error, { clinicId });
      throw new DatabaseError('Clinic not found', error);
    }
    return data as ClinicRow;
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    logger.error('Unexpected error getting clinic', error as Error, { clinicId });
    throw new DatabaseError('Unexpected error getting clinic', error as Error);
  }
}
```

### DATA_ACCESS — canonical doctor-search logic to mirror (clinics→staff→profiles, role-gated, bounded scan)
```ts
// SOURCE: packages/core/src/repositories/clinic/ClinicRepository.ts:30-39, 113-188 (abridged)
function isDoctorLikeRole(role: string | null | undefined): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase();
  if (normalized.includes('doctor')) return true;
  const clinicalRoles = new Set([
    'surgeon','dentist','radiologist','anesthesiologist','physiotherapist',
    'cardiologist','neurologist','pediatrician','orthopedist','dermatologist',
  ]);
  return clinicalRoles.has(normalized);
}
// ...searchDoctors: 1) active clinics (ilike city/specialty) → 2) active staff IN clinicIds
// .limit(MAX_STAFF_SCAN=200), filter isDoctorLikeRole → 3) profiles for names → 4) join + name
// filter (lowercase includes) + params.limit break. Returns DoctorListing[].
```

### SERVICE — web service method + delegation + error coercion
```ts
// SOURCE: apps/web/src/services/clinic/ClinicService.ts:87-103
async getClinicByOwner(ownerId: string): Promise<Clinic | null> {
  try {
    logger.debug('Fetching clinic by owner', { ownerId });
    const clinic = await this.repository.getClinicByOwner(ownerId);
    if (!clinic) return null;
    return this.mapClinic(clinic);
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    logger.error('Unexpected error fetching clinic by owner', error as Error, { ownerId });
    throw new DatabaseError('Unexpected error fetching clinic by owner', error as Error);
  }
}
```

### HOOK — debounced react-query search (mirror for useDoctorSearch)
```ts
// SOURCE: apps/web/src/hooks/useClinicSearch.ts:161-176, 246-250
export function useClinicSearch(filters: ClinicSearchFilters) {
  const debouncedSearch = useDebounce(filters.search, 300);
  const debouncedFilters = { ...filters, search: debouncedSearch };
  return useQuery({
    queryKey: ['clinic-search', debouncedFilters],
    queryFn: async () => { /* ... */ },
    placeholderData: (prev) => prev,   // keep previous → no flicker
    staleTime: 5 * 60 * 1000,
  });
}
```

### TEST — vitest with mocked repository
```ts
// SOURCE: apps/web/src/services/clinic/ClinicService.test.ts:16-30
describe('ClinicService', () => {
  let service: ClinicService;
  let mockRepository: Partial<ClinicRepository>;
  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = { getClinic: vi.fn(), /* ... */ };
    service = new ClinicService(mockRepository as ClinicRepository);
  });
});
```

### UI — current hero search form + handlers being rewired
```tsx
// SOURCE: apps/web/src/components/landing/PremiumLanding.tsx:110-116
const handleSearch = (e?: React.FormEvent) => {
  e?.preventDefault();
  const params = new URLSearchParams();
  if (searchQuery) params.set('search', searchQuery);
  if (location) params.set('city', location);
  navigate(`/clinics${params.toString() ? '?' + params.toString() : ''}`);  // ← change to /doctors
};
```

### UI — existing deep-link to booking (reuse verbatim on typeahead select)
```tsx
// SOURCE: apps/web/src/components/booking/DoctorDirectory.tsx:295
navigate(`/booking/${doctor.clinicId}?staffId=${encodeURIComponent(doctor.staffId)}`)
```

---

## Files to Change
| File | Action | Justification |
|------|--------|---------------|
| `apps/web/src/services/clinic/repositories/ClinicRepository.ts` | UPDATE | Add `searchDoctors(params): Promise<DoctorListing[]>` mirroring core |
| `apps/web/src/services/clinic/ClinicService.ts` | UPDATE | Add `searchDoctors` delegating to repo (+ add to default singleton) |
| `apps/web/src/lib/isDoctorLikeRole.ts` | CREATE | Single shared role helper (kills the 2-copy drift: web repo + DoctorDirectory) |
| `apps/web/src/hooks/useDoctorSearch.ts` | CREATE | Debounced react-query hook over `clinicService.searchDoctors` |
| `apps/web/src/hooks/useDetectedLocation.ts` | CREATE | Client-side IP→city (ipapi.co, timeout/abort, "Morocco" fallback) + GPS opt-in |
| `apps/web/src/components/landing/PremiumLanding.tsx` | UPDATE | Typeahead dropdown, deep-link on select, submit→`/doctors`, location prefill + GPS button |
| `apps/web/src/components/booking/DoctorDirectory.tsx` | UPDATE | Read URL params; consume `useDoctorSearch`; drop inline join; use shared role helper |
| `apps/web/src/locales/{en,fr,ar}/translation.json` | UPDATE | Doctor-oriented hero search keys + GPS/location strings |
| `apps/web/src/services/clinic/ClinicService.test.ts` | UPDATE | Add `searchDoctors` cases |
| `apps/web/src/hooks/useDetectedLocation.test.ts` | CREATE | Fallback/abort/GPS-deny paths |

---

## NOT Building
- No Postgres `search_doctors` RPC (existing TS contract suffices; RPC is a later optimization past the 200-staff scan cap).
- No GPS-by-default / on-load permission prompt — opt-in button only.
- No map view, distance/radius ranking, reverse-geocoding beyond nearest known city.
- No changes to `/clinics`, `useClinicSearch`, auth, or the booking flow itself.
- No server-side proxy for the IP call (decided: client-side).

---

## Step-by-Step Tasks

### Task 1: Shared `isDoctorLikeRole` helper
- ACTION: CREATE `apps/web/src/lib/isDoctorLikeRole.ts`.
- IMPLEMENT: export `isDoctorLikeRole(role: string | null | undefined): boolean` — copy the core implementation verbatim (snippet above).
- MIRROR: core `ClinicRepository.ts:30-39`.
- GOTCHA: keep the clinical-role set identical to core to preserve agent↔web parity.
- VALIDATE: `tsc`.

### Task 2: `ClinicRepository.searchDoctors` (web)
- ACTION: UPDATE `apps/web/src/services/clinic/repositories/ClinicRepository.ts`.
- IMPLEMENT: add `async searchDoctors(params: DoctorSearchParams): Promise<DoctorListing[]>` mirroring core's 4-step logic: active clinics (`ilike` city/specialty) → active `clinic_staff` `.in('clinic_id', ids).limit(200)` filtered by `isDoctorLikeRole` → `profiles` names → join + lowercase-`includes` name filter + `params.limit` break. Map to `DoctorListing` (fields: staffId, clinicId, fullName||'Doctor', role, specialization||undefined, clinicName, clinicSpecialty||undefined, city||undefined).
- IMPORTS: `import type { DoctorListing, DoctorSearchParams } from '@queuemed/core';` · `import { isDoctorLikeRole } from '@/lib/isDoctorLikeRole';` · existing `supabase`, `logger`, `DatabaseError`.
- MIRROR: error-handling from `getClinic` (Task snippet); search logic from core repo.
- GOTCHA: use **`ilike`** for city (contains semantics — "Casablanca" must match even with a detected free-text city), never `eq`. Type the selected rows with `Pick<Tables<'clinic_staff'>...>` style as core does, or local row interfaces.
- VALIDATE: `tsc`.

### Task 3: `ClinicService.searchDoctors` (web)
- ACTION: UPDATE `apps/web/src/services/clinic/ClinicService.ts`.
- IMPLEMENT: `async searchDoctors(params: DoctorSearchParams): Promise<DoctorListing[]>` delegating to `this.repository.searchDoctors(params)` wrapped in the standard try/catch→`DatabaseError` shape. Add `searchDoctors` to the mocked repo type usage. Re-export nothing new; the `clinicService` singleton (line 295) auto-gains the method.
- IMPORTS: `import type { DoctorListing, DoctorSearchParams } from '@queuemed/core';`
- MIRROR: `getClinicByOwner` (snippet above).
- GOTCHA: `ClinicRepository` constructor arg is optional and defaults to `new ClinicRepository()` — no DI wiring change needed.
- VALIDATE: `tsc`.

### Task 4: `useDoctorSearch` hook
- ACTION: CREATE `apps/web/src/hooks/useDoctorSearch.ts`.
- IMPLEMENT: `useDoctorSearch(filters: { search?: string; city?: string; specialty?: string; limit?: number; enabled?: boolean })`. Debounce `filters.search` (and `city`) via `useDebounce(…, 300)`; `useQuery({ queryKey: ['doctor-search', debounced], queryFn: () => clinicService.searchDoctors({ name: search, city, specialty, limit }), placeholderData: prev => prev, staleTime: 5*60*1000, enabled })`. Map `search`→`name` param (core uses `name`).
- IMPORTS: `useQuery` from `@tanstack/react-query`; `clinicService` from `@/services/clinic/ClinicService`; `useDebounce`; types from `@queuemed/core`.
- MIRROR: `useClinicSearch` (snippet above).
- GOTCHA: hero passes a small `limit` (6–8) and `enabled: search.length >= 2` to avoid empty-query full scans; `/doctors` passes no limit (or larger).
- VALIDATE: `tsc`.

### Task 5: `useDetectedLocation` hook (client-side IP + GPS opt-in)
- ACTION: CREATE `apps/web/src/hooks/useDetectedLocation.ts`.
- IMPLEMENT: returns `{ city: string | null, status: 'detecting'|'detected'|'fallback', requestPreciseLocation: () => void }`. On mount, `fetch('https://ipapi.co/json/', { signal })` with an `AbortController` + ~3s timeout; on success read `data.city` (string) → set city + status `detected`; on any error/empty → `city = null`, status `fallback` (caller renders the "Morocco" label). `requestPreciseLocation()` calls `navigator.geolocation.getCurrentPosition`; on success resolve to nearest known city (accept an optional `knownCities: string[]` arg from `PremiumLanding`'s `clinicStats.cities`; pick exact/`includes` match, else leave detected city) — keep simple: if no match, keep current. On deny/error: no-op (keep IP/default).
- IMPORTS: `useEffect, useState, useCallback, useRef` from react; `logger` from `@/services/shared/logging/Logger`.
- MIRROR: standard hook + `useDebounce`'s cleanup style (clear timeout / abort in effect cleanup).
- GOTCHA (lessons): swallow network failure into the fallback path — never throw to the UI; abort on unmount to avoid setState-after-unmount. Do NOT block render on the fetch (hero must paint immediately with "Morocco").
- VALIDATE: `tsc` + Task 9 tests.

### Task 6: Rewire hero search (typeahead + routing)
- ACTION: UPDATE `apps/web/src/components/landing/PremiumLanding.tsx`.
- IMPLEMENT:
  - Call `useDoctorSearch({ search: searchQuery, city: location, limit: 8, enabled: searchQuery.trim().length >= 2 })`.
  - Render a dropdown under the specialty input when focused & query≥2 & results exist: list up to ~6 doctors (name · specialization · clinicName · city) + a "specialty group" derived from distinct `specialization||clinicSpecialty` of results (label + count). Keyboard nav (ArrowUp/Down/Enter/Escape); click/Enter-on-item → `navigate('/booking/${clinicId}?staffId=${encodeURIComponent(staffId)}')`.
  - `handleSearch` → change target from `/clinics` to `/doctors` (keep `search`/`city` params).
  - Location: prefill `location` state from `useDetectedLocation().city` once detected (only if user hasn't typed); badge shows detected city or `t('landing.location.morocco')` on fallback. Add a "📍 use exact location" button calling `requestPreciseLocation(clinicStats?.cities)`.
- MIRROR: deep-link snippet (DoctorDirectory:295); existing form markup (PremiumLanding:163-210).
- IMPORTS: `useDoctorSearch`, `useDetectedLocation`; existing `useNavigate`, `useTranslation`.
- GOTCHA: don't clobber a user-typed location with a late IP result — gate prefill on "field untouched" (track a `locationTouched` ref/state). Close dropdown on outside-click/blur (use a small `onBlur` timeout or a click-away). Specialty group click → `navigate('/doctors?specialty=…')`.
- VALIDATE: `tsc`; manual browser pass.

### Task 7: Param-aware `DoctorDirectory` consuming the hook
- ACTION: UPDATE `apps/web/src/components/booking/DoctorDirectory.tsx`.
- IMPLEMENT: read `useSearchParams()` for `search`/`city`/`specialty`; seed the existing `searchTerm`/`selectedCity`/`selectedSpecialty` state from them; replace the inline `useQuery` join with `useDoctorSearch({ search, city, specialty })`. Keep the existing card UI, city/specialty `Select`s (derive options from results as today), empty state, and skeleton. Replace local `isDoctorLikeRole` (lines 27-45) with the shared helper import (it's only used server-side now, so it can simply be deleted here since filtering moved into the service).
- MIRROR: existing component structure (DoctorDirectory:138-313 stays; only the data source changes).
- IMPORTS: `useSearchParams` from `react-router-dom`; `useDoctorSearch`.
- GOTCHA: the hook returns server-filtered results; keep the client-side `Select` filtering for city/specialty refinement OR pass them to the hook — choose hook-side filtering for `city`/`specialty` and keep client text filter off (server does `name`). Preserve the `staleTime` behavior. Do NOT change the `/booking` and `/clinic` deep-links.
- VALIDATE: `tsc`; manual `/doctors?search=cardio&city=Casablanca`.

### Task 8: i18n keys (en + fr + ar)
- ACTION: UPDATE `apps/web/src/locales/{en,fr,ar}/translation.json`.
- IMPLEMENT: add doctor-oriented hero keys, e.g. under `landing.search`: `doctorPlaceholder` ("Doctor, specialty, or clinic"), `searchDoctorsButton` ("Find a doctor"); under `landing.location`: `useExactLocation` ("Use my exact location"), `detecting` ("Detecting your location…"). Add typeahead group label `landing.search.specialtyGroup` ("Specialties"). Mirror existing key style; provide fr + ar translations (Arabic RTL strings).
- MIRROR: existing `landing.search`/`landing.location` blocks.
- GOTCHA: all three locale files must stay key-aligned (missing keys fall back to the key string). Don't remove the existing clinic keys (still used by "Browse all clinics").
- VALIDATE: `tsc`; app boots, no missing-key warnings.

### Task 9: Tests
- ACTION: UPDATE `ClinicService.test.ts`; CREATE `useDetectedLocation.test.ts`.
- IMPLEMENT:
  - Service: add `searchDoctors` to `mockRepository`; assert it delegates and returns the repo result; assert non-`DatabaseError` is coerced to `DatabaseError`.
  - `useDetectedLocation`: mock `fetch` → success sets city/`detected`; reject/timeout → `fallback` with `city: null`; `navigator.geolocation` deny → keeps prior. Use `@testing-library/react` `renderHook` + `vi.stubGlobal('fetch', …)`.
- MIRROR: `ClinicService.test.ts:16-74`.
- GOTCHA (lessons): `apps/web` has its own vitest runner — confirm `pnpm --filter web test` picks up new files (it does; `src/**/*.test.ts(x)` is in scope).
- VALIDATE: run the test commands below.

---

## Testing Strategy
| Unit | Input | Expected | Edge? |
|------|-------|----------|-------|
| `ClinicService.searchDoctors` delegates | params `{name:'a'}`, repo returns `[listing]` | returns `[listing]`, repo called with params | — |
| `ClinicService.searchDoctors` error coercion | repo throws `Error` | throws `DatabaseError` | error |
| `useDetectedLocation` success | `fetch` → `{city:'Rabat'}` | `city='Rabat'`, status `detected` | — |
| `useDetectedLocation` network fail | `fetch` rejects | `city=null`, status `fallback` | network fail |
| `useDetectedLocation` timeout/abort | `fetch` never resolves | aborts → `fallback`; no setState-after-unmount | concurrent/unmount |
| `useDetectedLocation` GPS deny | `getCurrentPosition` error cb | keeps prior city | permission denied |

Edge-case checklist: empty query (typeahead disabled <2 chars), zero results (dropdown shows nothing / `/doctors` empty state), invalid IP payload (`city` missing → fallback), user-typed location not overwritten by late IP, detected city with no matching clinic (`ilike` → empty → directory empty state, no crash).

## Validation Commands
- Type-check: `pnpm --filter web exec tsc -p tsconfig.app.json --noEmit` → expect 0 errors. *(Lesson: `vite build` strips types without checking — run tsc explicitly.)*
- Core type-check (touched types only): `pnpm --filter @queuemed/core exec tsc --noEmit` → 0 errors.
- Tests: `pnpm --filter web test -- --run src/services/clinic/ClinicService.test.ts src/hooks/useDetectedLocation.test.ts` → pass.
- Build: `pnpm --filter web build` → success.
- Browser (manual): `pnpm --filter web dev` → on `/`, location prefills to a city (or "Morocco"); typing "cardio" shows a dropdown; clicking a doctor → `/booking/:id?staffId=`; Search → `/doctors?search=cardio&city=…` pre-filtered.

## Acceptance Criteria
- [ ] Hero search NEVER routes to `/clinics`; submit → `/doctors?…`, item-select → `/booking/:clinicId?staffId=`.
- [ ] Location auto-detected client-side with 0 clicks; "Morocco" only on failure; GPS only on explicit click.
- [ ] Typeahead debounced, keep-previous (no flicker), disabled under 2 chars.
- [ ] `/doctors?search=&city=&specialty=` lands pre-filtered.
- [ ] `DoctorDirectory` no longer contains its own clinics→staff→profiles join (uses `useDoctorSearch`).
- [ ] One `isDoctorLikeRole` helper (no duplicate copies in web).
- [ ] All locale files key-aligned; tsc + targeted tests + build green.

## Completion Checklist
- [ ] Tasks 1–9 done & validated · [ ] no new `tsc` errors · [ ] tests pass · [ ] build ok · [ ] manual browser pass · [ ] PRD phases 1–5 marked complete.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `ipapi.co` rate-limit/slow/blocked | Med | Low | timeout+abort, fallback to "Morocco", non-blocking render; provider isolated in the hook |
| Privacy (visitor IP → 3rd party) | Med | Med | client-side only, called once on landing; documented; provider swappable |
| Detected city ≠ any clinic city (free text) | Med | Low | `ilike`-contains; empty → directory empty state, never blank/crash |
| Late IP result overwrites typed location | Low | Med | gate prefill on untouched field |
| `isDoctorLikeRole` drift | Low | Low | single shared helper (Task 1) |
| Unbounded staff scan as data grows | Low (now) | Med (later) | keep `MAX_STAFF_SCAN=200`; RPC is the documented future fix |

---
**Confidence: 8/10** for single-pass implementation. The contract/types/routes/RLS all pre-exist and patterns are pasted from real code; the only genuinely new surface is the typeahead dropdown interaction (keyboard nav + click-away) and the IP hook, both well-scoped with tests. Residual risk is UI polish iteration in the hero, not architecture.
