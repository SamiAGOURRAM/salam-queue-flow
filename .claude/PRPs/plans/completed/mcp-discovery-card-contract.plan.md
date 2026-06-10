# Plan: Discovery Card Contract (Phase 1)

## Summary
Define the shared, typed **card contract** in `@queuemed/core` — the payload that discovery tools return and the chat UI renders — plus a code-generated `buildBookingHref` helper. This is the frozen interface every later phase depends on (backend-first: contract before implementation). No tool logic, no UI, no transport changes in this phase.

## User Story
As the team, we want one source-of-truth type for doctor/clinic cards + their booking deep-link, so the MCP tools (Phase 2/3), the chat stream (Phase 4), and the web renderer (Phase 4) all agree and cannot drift.

## Problem → Solution
Today tool results are untyped and flattened to text (`apps/chat-api/src/mcp.ts:19-29`). → Introduce a typed `DiscoveryCards` payload in shared core so structured cards can flow end-to-end once the transport switches to the AI-SDK data stream.

## Metadata
- **Complexity**: Small (types + one pure helper + exports + tests; ~3-5 files, <120 LOC)
- **Source PRD**: `.claude/PRPs/prds/mcp-patient-discovery-cards.prd.md`
- **PRD Phase**: 1 — Card contract
- **Skills applied**: backend-first (contract-first), api-design (typed contract + stable shape), mcp-server-patterns (schema-first, data-not-UI from MCP)
- **Decisions carried in**: transport = AI-SDK data stream + `useChat`; contract home = `@queuemed/core` (web dep already present)

## Mandatory Reading
| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `apps/web/src/components/booking/BookingFlow.tsx` | 50-65 | The deep-link target: reads route `clinicId` + query `staffId`; defines `DoctorOption` fields the card mirrors |
| P0 | `apps/web/src/App.tsx` | 101,112 | Booking route is `booking/:clinicId` under PatientLayout → absolute `/booking/:clinicId` |
| P0 | `packages/core/package.json` | 9-18 | `.` export maps to `dist/index.js`/`.d.ts` — consumers import built types |
| P0 | `packages/core/src/index.ts` | all | Confirm it re-exports `./types` (add if missing) |
| P1 | `packages/core/src/types/index.ts` | all | Where to register the new `cards` module export |
| P1 | `apps/mcp-server/src/tools/clinic/search.ts` | 99-115 | Output-type naming/optionality pattern to mirror (`ClinicSearchResult`) |
| P2 | `apps/web/package.json` | 39 | Confirms `@queuemed/core` already a web dependency (`file:../../packages/core`) |

## Patterns to Mirror (real snippets)

### TYPE_SHAPE — tool result interface (optional fields, flat)
```ts
// SOURCE: apps/mcp-server/src/tools/clinic/search.ts:99-115
interface ClinicSearchResult {
  success: boolean;
  count: number;
  clinics: Array<{
    id: string; name: string; specialty?: string; city?: string;
    address?: string; phoneNumber?: string;
  }>;
  filters: { query?: string; city?: string; specialty?: string };
}
```

### DOCTOR_FIELDS — what a doctor entity exposes
```ts
// SOURCE: apps/web/src/components/booking/BookingFlow.tsx:50-57
interface DoctorOption {
  id: string; userId: string; fullName: string; role: string;
  specialization?: string;
  appointmentTypesOverride?: AppointmentTypeOption[];
}
```

### DEEPLINK — how booking consumes the link
```ts
// SOURCE: apps/web/src/components/booking/BookingFlow.tsx:60-65  (route: App.tsx:112 "booking/:clinicId")
const { clinicId } = useParams();
const [searchParams] = useSearchParams();
const preselectedStaffId = searchParams.get("staffId") || "";
// => deep link is  /booking/<clinicId>?staffId=<doctorId>
```

## Files to Change
| File | Action | Justification |
|---|---|---|
| `packages/core/src/types/cards.ts` | CREATE | The card contract types + `buildBookingHref` |
| `packages/core/src/types/index.ts` | UPDATE | `export * from "./cards.js"` |
| `packages/core/src/index.ts` | UPDATE | Ensure `export * from "./types/index.js"` (add only if missing) |
| `packages/core/src/types/cards.test.ts` | CREATE | Unit-test `buildBookingHref` (pure, deterministic) |

## NOT Building (this phase)
- No changes to `clinic_search` / no `doctor_search` tool (Phase 2/3).
- No chat-api streaming change, no `useChat`, no card React components (Phase 4).
- No "next available slot" fetching — the field is defined as optional now, populated later.
- No doctor-role enum change.

## Step-by-Step Tasks

### Task 1: Create the card contract
- **ACTION**: Create `packages/core/src/types/cards.ts`.
- **IMPLEMENT**:
  ```ts
  export interface ClinicCardItem {
    clinicId: string;
    name: string;
    specialty?: string;
    city?: string;
    address?: string;
    phoneNumber?: string;
    bookingHref: string;
  }
  export interface DoctorCardItem {
    doctorId: string;        // the staff/provider id → passed as ?staffId
    fullName: string;
    specialization?: string;
    clinicId: string;
    clinicName: string;
    city?: string;
    nextAvailableSlot?: string; // ISO 8601; optional in v1
    bookingHref: string;
  }
  export type DiscoveryCards =
    | { kind: "doctor_cards"; items: DoctorCardItem[] }
    | { kind: "clinic_cards"; items: ClinicCardItem[] };

  export interface BookingHrefParams { clinicId: string; staffId?: string }

  /** Code-generated deep link into BookingFlow. NEVER let the model author this. */
  export function buildBookingHref({ clinicId, staffId }: BookingHrefParams): string {
    const base = `/booking/${encodeURIComponent(clinicId)}`;
    return staffId ? `${base}?staffId=${encodeURIComponent(staffId)}` : base;
  }
  ```
- **MIRROR**: TYPE_SHAPE (optional fields, flat arrays), DOCTOR_FIELDS, DEEPLINK.
- **IMPORTS**: none (pure TS).
- **GOTCHA**: `bookingHref` MUST be built by `buildBookingHref` in code (Phase 2/3), never returned by the model — prevents prompt-injected links (lethal-trifecta mitigation). Use `encodeURIComponent`.
- **VALIDATE**: `pnpm --filter @queuemed/core typecheck`.

### Task 2: Export from the package surface
- **ACTION**: Add `export * from "./cards.js";` to `packages/core/src/types/index.ts`. Open `packages/core/src/index.ts`; if it does not already re-export `./types`, add `export * from "./types/index.js";`.
- **MIRROR**: existing export style in `src/index.ts` (note `.js` extensions — `"type":"module"`, NodeNext).
- **GOTCHA**: ESM needs the `.js` extension on relative imports even from `.ts` sources. Don't drop it.
- **VALIDATE**: `pnpm --filter @queuemed/core build` then confirm `DiscoveryCards`/`buildBookingHref` appear in `packages/core/dist/index.d.ts`.

### Task 3: Unit-test the href builder
- **ACTION**: Create `packages/core/src/types/cards.test.ts`.
- **IMPLEMENT**: assert `buildBookingHref({clinicId:"c1"})==="/booking/c1"`; with `staffId:"s1"` ⇒ `"/booking/c1?staffId=s1"`; that a staffId needing encoding is percent-encoded; that a clinicId with a space/slash is encoded.
- **MIRROR**: the repo's existing vitest test style (the project uses `npx vitest`).
- **GOTCHA**: if `@queuemed/core` has no test runner wired, run the test from the workspace root vitest rather than adding a new runner to core.
- **VALIDATE**: `npx vitest run packages/core` (or root `npx vitest run`).

## Testing Strategy
| Test | Input | Expected | Edge? |
|---|---|---|---|
| href no staff | `{clinicId:"c1"}` | `/booking/c1` | base |
| href with staff | `{clinicId:"c1",staffId:"s1"}` | `/booking/c1?staffId=s1` | base |
| encoding | `{clinicId:"a b",staffId:"x/y"}` | `/booking/a%20b?staffId=x%2Fy` | special chars |
| type guard | `DiscoveryCards.kind` narrows item type | TS compiles only matching items | type-level |

Edge-case checklist: empty staffId (omit query) · special chars (encoded) · invalid type (compile error) · n/a concurrency/network (pure) · n/a permission (no I/O this phase).

## Validation Commands
- `pnpm --filter @queuemed/core typecheck` — EXPECT 0 errors
- `pnpm --filter @queuemed/core build` — EXPECT dist regenerated; new exports in `dist/index.d.ts`
- `npx vitest run packages/core` — EXPECT all pass
- `pnpm -r exec tsc --noEmit` — EXPECT 0 errors repo-wide (confirms mcp-server/chat-api/web still resolve core types)

## Acceptance Criteria
- [ ] `DiscoveryCards`, `DoctorCardItem`, `ClinicCardItem`, `BookingHrefParams`, `buildBookingHref` exported from `@queuemed/core`.
- [ ] `import { buildBookingHref } from "@queuemed/core"` resolves from mcp-server, chat-api, and web (type-only where applicable).
- [ ] href tests pass; encoding correct.
- [ ] Repo-wide typecheck green.

## Completion Checklist
- [ ] Follows core ESM `.js`-extension export convention
- [ ] No business logic / no I/O introduced
- [ ] `bookingHref` documented as code-only (never model-authored)
- [ ] No scope creep (no tools, no UI, no transport)

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| web type-only import needs core `dist` built | M | typecheck/build fails in web | Build core before web; use `import type` so the value is erased; document build order |
| `src/index.ts` doesn't re-export `./types` | M | new types not visible to consumers | Task 2 verifies and adds the re-export |
| core lacks a vitest setup | L | Task 3 can't run in-package | Run from workspace root vitest instead |
