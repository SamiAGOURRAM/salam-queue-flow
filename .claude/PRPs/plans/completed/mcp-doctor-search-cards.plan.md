# Plan: doctor_search → Doctor Cards incl. Next Available Slot (Phase 3)

## Summary
Add a patient/public **`doctor_search`** MCP tool that returns the frozen
`DiscoveryCards` payload (`kind: "doctor_cards"`) — each card a real provider
(name, specialty, clinic, **next available slot**, code-minted `bookingHref`).
Built backend-first: a new `@queuemed/core` `searchDoctors` service method +
a `getNextAvailableSlot` booking method (both unit-tested) land first; the MCP
tool then composes them and maps to cards.

## User Story
As a **patient** in the chat asking "dermatologists in Casablanca", the agent calls
`doctor_search` and gets structured doctor cards — each showing the next available
slot and a deep link that preselects that doctor in the booking flow — so a later
phase can render them as one-tap cards.

## Problem → Solution
- **Problem:** there is no doctor-level discovery — `clinic_search` returns clinics,
  not individual providers with a next-available slot (PRD Evidence). No
  staff/doctor query exists in `@queuemed/core` (grep: none).
- **Solution:** mirror web's proven `DoctorDirectory` query (`DoctorDirectory.tsx:64-129`)
  server-side as a core `searchDoctors`, add a clinic-level forward-scanning
  `getNextAvailableSlot`, and a thin MCP tool that builds `DoctorCardItem[]` via
  `buildBookingHref({ clinicId, staffId })`.

## Metadata
- **Complexity:** Large (core: type + repo + service + booking method + 2 test files; mcp: tool + registry + test)
- **Source:** `.claude/PRPs/prds/mcp-patient-discovery-cards.prd.md` — Phase 3 (depends: Phase 1 ✅; **also depends on the NodeNext fix** so `getClinicService()`/`getBookingService()` are real types, not `any`)
- **Estimated files:** ~5 core + ~3 mcp-server

## DEPENDENCY GATE
Implement **`core-nodenext-resolution.plan.md` first.** Without it, `getClinicService()`
and `getBookingService()` are `any` in mcp-server, so the new tool's calls would be
unchecked and the card mapping would silently accept wrong shapes. Do not start
Phase 3 until that plan's acceptance (annotation removed, clinics infers `Clinic[]`) holds.

## Mandatory Reading
| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `apps/web/src/components/booking/DoctorDirectory.tsx` | 26-129 | The exact reference: `formatRole`, `isDoctorLikeRole`, the `clinic_staff`→`clinics`→`profiles` query, and the listing shape. MIRROR server-side. |
| P0 | `packages/core/src/types/cards.ts` | 38-50, 77-81 | `DoctorCardItem` fields + `buildBookingHref({clinicId, staffId})` (the doctor href uses staffId). |
| P0 | `packages/core/src/repositories/clinic/ClinicRepository.ts` | 19-83, 146-158 | Repo pattern: `this.db.getClient()`, `.from().select().ilike()`, `ClinicSearchParams`, `mapToX`. MIRROR for `searchDoctors`. |
| P0 | `packages/core/src/services/clinic/ClinicService.ts` | 47-66 | Service-method pattern (setContext/try/log/clearContext). MIRROR for `searchDoctors`. |
| P0 | `packages/core/src/services/booking/BookingService.ts` | 213-246 | `getAvailableSlotsForMode(clinicId, date, appointmentType?)` → `AvailableSlotsResponse {available, slots:BookingSlot[], mode}`. The primitive `getNextAvailableSlot` scans. |
| P1 | `apps/mcp-server/src/tools/clinic/search.ts` | full | The Phase-2 sibling tool: zod input, Tool def, result interface, pure `buildClinicCards`, executor. MIRROR structure for `buildDoctorCards`/`executeDoctorSearch`. |
| P1 | `apps/mcp-server/src/tools/index.ts` | 21-22, 59-111 | Where to register the tool (def array + executor map). |
| P1 | `packages/core/src/types/index.ts` | 13-25, 123-166 | Where to add `DoctorListing` + `DoctorSearchParams`; `Clinic`, `Staff`, `StaffRole` for reference. |
| P2 | `apps/mcp-server/src/tools/booking/getAvailability.ts` | 140-196 | How a tool composes clinicService + bookingService (date validation, NotFoundError). |

## Patterns to Mirror (real snippets)

### DOCTOR FILTER — SOURCE: apps/web/src/components/booking/DoctorDirectory.tsx:36-55
```ts
function isDoctorLikeRole(role: string, specialization: string | null): boolean {
  const normalized = role.toLowerCase();
  if (normalized.includes("doctor")) return true;
  if (specialization) return true;
  const clinicalRoles = new Set([
    "surgeon","dentist","radiologist","anesthesiologist","physiotherapist",
    "cardiologist","neurologist","pediatrician","orthopedist","dermatologist",
  ]);
  return clinicalRoles.has(normalized);
}
```
Port verbatim into core (it has no UI deps). Drives which `clinic_staff` rows become doctor cards.

### REPO QUERY — SOURCE: DoctorDirectory.tsx:71-101 (the 3-step join, run with `this.db.getClient()`)
```ts
// clinic_staff (active) → clinics (active, by id) → profiles (full_name by user_id)
.from("clinic_staff").select("id, clinic_id, user_id, role, specialization").eq("is_active", true)
.from("clinics").select("id, name, specialty, city, is_active").in("id", clinicIds).eq("is_active", true)
.from("profiles").select("id, full_name").in("id", userIds)
```
Mirror inside `ClinicRepository.searchDoctors`, applying `city`/`specialty`/`name` filters against the joined clinic + profile, then `isDoctorLikeRole`.

### REPO STYLE — SOURCE: packages/core/src/repositories/clinic/ClinicRepository.ts:49-83
```ts
async search(params: ClinicSearchParams): Promise<Clinic[]> {
  const client = this.db.getClient();
  let query = client.from('clinics').select('*');
  if (params.city) query = query.ilike('city', `%${params.city}%`);
  ...
  const { data, error } = await query;
  if (error) { this.logError('Failed to search clinics', new Error(error.message), params as Record<string, unknown>); throw new Error(error.message); }
  return (data || []).map(row => this.mapToClinic(row));
}
```

### SERVICE STYLE — SOURCE: packages/core/src/services/clinic/ClinicService.ts:47-66
```ts
async searchClinics(params: ClinicSearchParams): Promise<Clinic[]> {
  this.logger.setContext({ service: 'ClinicService', operation: 'searchClinics' });
  try {
    const clinics = await this.repository.search(params);
    this.logger.info('Clinics found', { count: clinics.length });
    return clinics;
  } catch (error) { this.logger.error('Failed to search clinics', error as Error); throw error; }
  finally { this.logger.clearContext(); }
}
```

### CARD MAPPING (pure) — SOURCE: apps/mcp-server/src/tools/clinic/search.ts (Phase 2 buildClinicCards)
```ts
export function buildClinicCards(clinics: ClinicRow[]): DiscoveryCards | undefined {
  const [first, ...rest] = clinics.map(toClinicCard);
  if (!first) return undefined;
  return { kind: "clinic_cards", items: [first, ...rest] };
}
```
Mirror as `buildDoctorCards` → `{ kind: "doctor_cards", items: NonEmptyArray<DoctorCardItem> }` (same control-flow non-empty proof, no cast).

## Files to Change
| File | Action | Justification |
|---|---|---|
| `packages/core/src/types/index.ts` | UPDATE | Add `DoctorListing` + `DoctorSearchParams`. |
| `packages/core/src/repositories/clinic/ClinicRepository.ts` | UPDATE | Add `searchDoctors(params): Promise<DoctorListing[]>` + `mapToDoctor`. |
| `packages/core/src/services/clinic/ClinicService.ts` | UPDATE | Add `searchDoctors(params)` wrapping the repo. |
| `packages/core/src/services/booking/BookingService.ts` | UPDATE | Add `getNextAvailableSlot(clinicId, fromDate, maxDays?): Promise<string \| null>` (forward scan over `getAvailableSlotsForMode`, capped). |
| `packages/core/src/services/clinic/ClinicService.searchDoctors.test.ts` (or `__tests__`) | CREATE | Unit-test mapping + `isDoctorLikeRole` filter with a mocked repo/db. |
| `packages/core/src/services/booking/getNextAvailableSlot.test.ts` | CREATE | Unit-test forward-scan: found day 0, found day N, none within cap, fluid vs slotted. |
| `apps/mcp-server/src/tools/doctor/search.ts` | CREATE | `doctorSearchTool` + `executeDoctorSearch` + pure `buildDoctorCards`. |
| `apps/mcp-server/src/tools/doctor/search.test.ts` | CREATE | Unit-test `buildDoctorCards` (mirror Phase-2 `search.test.ts`). |
| `apps/mcp-server/src/tools/index.ts` | UPDATE | Register tool def + executor (`doctor_search`). |

## NOT Building
- **No chat/UI rendering** — cards aren't displayed yet (Phase 4).
- **No transport change** — result rides as JSON like `clinic_search`.
- **No auth eval suite / cross-role tests** — that's Phase 5. Here: register `doctor_search` at the SAME public level as `clinic_search` so it's callable; the eval lands in Phase 5.
- **No new `StaffService`/container entry** — `searchDoctors` lives on the existing `ClinicService` (clinic-scoped discovery), avoiding container churn. (Documented decision; revisit if staff ops grow.)
- **No write operations / PHI** — read-only public fields (name, specialty, clinic, city, slot). No phone/email of providers.
- **No per-doctor availability** — availability is clinic+date level; next-slot is computed once per **unique clinic** and shared by that clinic's doctors (see GOTCHA).
- **No branded `ClinicId`/`StaffId`** — still `string` (deferred per `cards.ts:75`).

## Step-by-Step Tasks (backend-first: core contract → core impl+tests → tool)

### Task 1: Core types — `DoctorListing` + `DoctorSearchParams`
- **ACTION:** UPDATE `packages/core/src/types/index.ts`.
- **IMPLEMENT:**
  ```ts
  export interface DoctorListing {
    staffId: string;
    clinicId: string;
    fullName: string;
    role: string;
    specialization?: string;
    clinicName: string;
    clinicSpecialty?: string;
    city?: string;
  }
  export interface DoctorSearchParams { city?: string; specialty?: string; name?: string; limit?: number; }
  ```
- **MIRROR:** the web `DoctorListing` shape (DoctorDirectory.tsx:117-126).
- **GOTCHA:** NodeNext is now on (dep plan) — any new relative import here needs `.js`.
- **VALIDATE:** `corepack pnpm --filter @queuemed/core typecheck` → 0.

### Task 2: Repository — `ClinicRepository.searchDoctors`
- **ACTION:** UPDATE `ClinicRepository.ts`.
- **IMPLEMENT:** `async searchDoctors(params: DoctorSearchParams): Promise<DoctorListing[]>` using `this.db.getClient()`: (1) `clinic_staff` active rows; (2) `clinics` active by `clinic_id in (...)`, apply `ilike` `city`/`specialty`; (3) `profiles.full_name` by `user_id in (...)`, apply `name` filter against full_name; join in memory; `isDoctorLikeRole(role, specialization)` filter; `mapToDoctor`; respect `limit`.
- **MIRROR:** REPO QUERY + REPO STYLE + DOCTOR FILTER (port `isDoctorLikeRole` as a private/module fn).
- **IMPORTS:** `DoctorListing, DoctorSearchParams` from `'../../types/index.js'`.
- **GOTCHA:** filters that live on the *clinic* (`city`,`specialty`) must be applied after the clinic fetch; `name` matches the doctor's `full_name`. Error handling: mirror `this.logError(...); throw new Error(error.message)`.
- **VALIDATE:** core typecheck → 0.

### Task 3: Service — `ClinicService.searchDoctors`
- **ACTION:** UPDATE `ClinicService.ts`.
- **IMPLEMENT:** thin wrapper mirroring `searchClinics` (setContext `operation:'searchDoctors'`, try/log count/catch/finally).
- **MIRROR:** SERVICE STYLE.
- **VALIDATE:** core typecheck → 0.

### Task 4: Booking — `getNextAvailableSlot` (clinic-level forward scan)
- **ACTION:** UPDATE `BookingService.ts`.
- **IMPLEMENT:**
  ```ts
  async getNextAvailableSlot(clinicId: string, fromDate: string, maxDays = 14): Promise<string | null> {
    for (let i = 0; i < maxDays; i++) {
      const date = addDays(fromDate, i);            // pure date math, no Date.now()
      const res = await this.getAvailableSlotsForMode(clinicId, date);
      const slot = res.slots?.find(s => s.available);
      if (slot) return `${date}T${slot.time}`;       // slotted/hybrid: concrete time
      if (res.available && (res.mode === 'fluid' || res.mode === null)) return date; // fluid: day-level
    }
    return null;
  }
  ```
- **MIRROR:** uses existing `getAvailableSlotsForMode` (BookingService.ts:213).
- **GOTCHA:** **cap `maxDays`** (default 14) — this is the N+1 mitigation; never unbounded. `fromDate` is passed in by the caller (the tool), not computed here, so the method stays pure/testable (no `Date.now()` in core). `addDays` is simple string date arithmetic (UTC) — add a tiny private helper; do NOT introduce a date lib.
- **VALIDATE:** core typecheck → 0.

### Task 5: Core unit tests
- **ACTION:** CREATE the two core test files.
- **IMPLEMENT:**
  - `searchDoctors`: mock the repo (or `IDatabaseClient.getClient()` chainable) → assert mapping fields + that non-doctor roles are filtered out + `limit` respected.
  - `getNextAvailableSlot`: stub `getAvailableSlotsForMode` to return: available slot on day 0 → returns `${from}T${time}`; available only on day 3 → returns that date's slot; never available within `maxDays` → `null`; fluid available → returns date-only.
- **MIRROR:** `packages/core/src/types/cards.test.ts` (vitest; core has its own runner).
- **GOTCHA:** core's tsconfig excludes `**/*.test.ts` (won't ship to dist). `Date.now()` is unavailable in some runners — tests pass explicit `fromDate` strings (the method already requires it).
- **VALIDATE:** `corepack pnpm --filter @queuemed/core test` → pass; `corepack pnpm --filter @queuemed/core build`.

### Task 6: MCP tool — `doctor_search`
- **ACTION:** CREATE `apps/mcp-server/src/tools/doctor/search.ts`.
- **IMPLEMENT:**
  - Zod input `{ query?, city?, specialty?, limit? }` + JSON-schema `inputSchema` (mirror `clinic/search.ts`).
  - `executeDoctorSearch(args, _ctx)`: validate → `getClinicService().searchDoctors({...})` → collect **unique** `clinicId`s → for each unique clinic, `getBookingService().getNextAvailableSlot(clinicId, today)` once (memoize in a `Map<clinicId,string|null>`; `today` = the tool computes the date string here, the one allowed boundary) → `buildDoctorCards(doctors, nextSlotByClinic)`.
  - Pure `buildDoctorCards(doctors, slotByClinic): DiscoveryCards | undefined` → `doctor_cards` with `bookingHref: buildBookingHref({ clinicId, staffId })`, `nextAvailableSlot: slotByClinic.get(clinicId) ?? undefined`. Same `[first,...rest]` non-empty proof as Phase 2.
  - Return `{ success, count, doctors, cards }` (additive, like Phase 2).
- **MIRROR:** `apps/mcp-server/src/tools/clinic/search.ts` end-to-end.
- **GOTCHA:** **dedupe next-slot calls per clinic** (10 doctors at 1 clinic = 1 availability scan, not 10) — this is the N+1 fix. Cap doctor results (`limit`, default 10) before scanning. `buildDoctorCards` stays pure (takes the precomputed slot map) so it's unit-testable without a DB.
- **VALIDATE:** `corepack pnpm --filter @queuemed/mcp-server typecheck` → 0.

### Task 7: Register the tool
- **ACTION:** UPDATE `apps/mcp-server/src/tools/index.ts`.
- **IMPLEMENT:** import `doctorSearchTool, executeDoctorSearch from "./doctor/search.js"`; add to `tools[]` (Clinic/discovery group, public) and `executors` map (`doctor_search: executeDoctorSearch`).
- **MIRROR:** clinic_search registration (index.ts:21, 61, 92).
- **GOTCHA:** ensure it's accessible at the public/anonymous level exactly like `clinic_search` (no `TOOL_PERMISSIONS` entry needed if clinic_search has none; match whatever clinic_search does). Full eval is Phase 5.
- **VALIDATE:** typecheck → 0.

### Task 8: MCP tool unit test
- **ACTION:** CREATE `apps/mcp-server/src/tools/doctor/search.test.ts`.
- **IMPLEMENT:** test `buildDoctorCards`: empty→undefined; full mapping incl. `nextAvailableSlot` from the slot map and `undefined` when absent; `bookingHref` = `/booking/:clinicId?staffId=:staffId`; multiple doctors across clinics share one clinic's slot.
- **MIRROR:** `apps/mcp-server/src/tools/clinic/search.test.ts`.
- **VALIDATE:** `corepack pnpm --filter @queuemed/mcp-server test` → all pass.

## Testing Strategy
| Unit | Input | Expected | Edge? |
|---|---|---|---|
| `isDoctorLikeRole` | `("receptionist", null)` | `false` | ✅ excludes non-doctors |
| `isDoctorLikeRole` | `("nurse", "cardiology")` | `true` (has specialization) | ✅ |
| `searchDoctors` map | staff+clinic+profile rows | `DoctorListing` with clinicName/city joined | no |
| `getNextAvailableSlot` | slot avail day0 | `"<from>T<time>"` | no |
| `getNextAvailableSlot` | avail only day3 | day3 slot | ✅ forward scan |
| `getNextAvailableSlot` | none ≤ maxDays | `null` | ✅ cap |
| `getNextAvailableSlot` | fluid available | date-only string | ✅ mode branch |
| `buildDoctorCards` | `[]` | `undefined` | ✅ empty |
| `buildDoctorCards` | 2 docs same clinic + slot map | both share `nextAvailableSlot`, distinct `bookingHref?staffId=` | ✅ dedupe |
| `buildDoctorCards` | clinic absent from slot map | `nextAvailableSlot: undefined` | ✅ missing slot |

Edge checklist: empty results · doctor with no specialization · clinic inactive (excluded) · missing profile full_name (skip or fallback) · next-slot none within cap · permission (Phase 5).

## Validation Commands (this repo)
- core: `typecheck` 0 · `test` pass · `build` ok
- mcp-server: `typecheck` 0 · `test` pass · `build` clean (no dist test leak)
- (no browser/db migration — read-only over existing tables/RLS)

## Acceptance Criteria
- [ ] `doctor_search` returns `cards: { kind:"doctor_cards", items:[...] }` for ≥1 doctor; `undefined`/omitted for none.
- [ ] Each card: real provider, `bookingHref` = `/booking/:clinicId?staffId=:staffId` (branded, code-minted), `nextAvailableSlot` populated from a **per-clinic-deduped** capped scan.
- [ ] Only doctor-like providers from **active** staff at **active** clinics appear.
- [ ] `searchDoctors` + `getNextAvailableSlot` live in `@queuemed/core` with unit tests; tool is thin.
- [ ] Registered & callable at public level; core + mcp-server typecheck/test/build green.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| N+1 availability across doctors | M | M | Dedupe next-slot per **unique clinic** (Task 6) + cap `limit` + cap `maxDays` (Task 4). |
| Provider PHI/non-public fields leak | L | H | Explicit allowlist (name, specialty, clinic, city, slot); no phone/email; reads under caller RLS via the JWT-scoped container. |
| `getNextAvailableSlot` slow (14 sequential calls/clinic) | M | M | Default `maxDays=14`; acceptable for few unique clinics per search; can batch/cache later (PRD risk row). |
| `clinic_staff`→`profiles` RLS blocks public read | M | M | Same public-SELECT policies BookingFlow relies on (project lesson: needs RLS on BOTH clinic_staff and profiles) — verify with anon query before declaring done. |
| Doctor `bookingHref` staffId not honored by BookingFlow | L | M | Phase-1 contract + `App.tsx:112` route already reads `staffId` from query; Phase 4 E2E confirms. |

## Confidence: 8/10
Backend-first with a proven query to mirror (web DoctorDirectory), the Phase-2 tool as a structural template, and the contract already frozen. −2 for the next-slot scan (mode/date-math edge cases) and the RLS-on-clinic_staff/profiles dependency — both explicitly tested/verified in the tasks.

> Next: `/implement .claude\PRPs\plans\core-nodenext-resolution.plan.md` → then `/implement .claude\PRPs\plans\mcp-doctor-search-cards.plan.md`
