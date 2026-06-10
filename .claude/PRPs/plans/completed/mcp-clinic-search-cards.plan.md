# Plan: clinic_search → Discovery Card Payload (Phase 2)

## Summary
Extend the existing `clinic_search` MCP tool so that, in addition to its current
text/JSON `clinics` array, it emits the **frozen `DiscoveryCards` payload**
(`kind: "clinic_cards"`) built in Phase 1 — each item carrying a code-generated
`bookingHref`. This is the producer half of the card pipeline: it makes the
structured, renderable data exist. No transport or UI changes (those are Phase 4).

## User Story
As a **patient** searching for a clinic in the chat, when `clinic_search` runs,
the tool result now contains a typed, clickable-ready card payload (clinic name,
city, specialty, and a booking deep-link) — so a later phase can render it as a
tappable card instead of prose.

## Problem → Solution
- **Problem:** `clinic_search` returns only loose JSON (`clinics: [...]`), which
  the agent can only describe in text (`search.ts:99-115`). Nothing typed/linkable.
- **Solution:** map the service results into `ClinicCardItem[]` via
  `buildBookingHref`, attach as `cards?: DiscoveryCards` on the result. Additive
  and backward-compatible — the existing `clinics` array stays for the current
  text fallback until Phase 4 switches the transport.

## Metadata
- **Complexity:** Small (<100 LOC, 2–3 files)
- **Source:** `.claude/PRPs/prds/mcp-patient-discovery-cards.prd.md` — Phase 2 (depends: Phase 1 ✅)
- **Estimated files:** `clinic/search.ts` (UPDATE), `clinic/search.test.ts` (CREATE)

## Mandatory Reading
| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `packages/core/src/types/cards.ts` | 16–81 | The contract being produced: `DiscoveryCards`, `ClinicCardItem`, `NonEmptyArray`, `buildBookingHref`. `bookingHref` is **branded** — only `buildBookingHref` can mint it. |
| P0 | `apps/mcp-server/src/tools/clinic/search.ts` | 99–174 | The file to extend: result type + executor + the existing `clinics.map(...)`. |
| P1 | `apps/mcp-server/src/services/index.ts` | 86–88, 63–76 | `getClinicService()` returns an RLS-scoped service; do not change data access. |
| P1 | `packages/core/src/types/cards.test.ts` | 1–25 | Test style to mirror (vitest, branded-return coercion helper). |
| P2 | `apps/mcp-server/src/tools/index.ts` | 90–111, 160–180 | Executor wraps result as `JSON.stringify(result)` text content — so `cards` rides along automatically; no registry change needed. |

## Patterns to Mirror (real snippets)

### IMPORT (core types into a tool) — SOURCE: apps/mcp-server/src/tools/clinic/search.ts:10-15
```ts
import { z } from "zod";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getClinicService } from "../../services/index.js";
import { logger } from "../../utils/logger.js";
```
→ Add: `import { buildBookingHref, type DiscoveryCards, type ClinicCardItem, type NonEmptyArray } from "@queuemed/core";`
(Top-level export verified: `core/src/types/index.ts:8` re-exports `./cards`, and `src/index.ts` re-exports `./types`. Phase 1 already rebuilt `dist`; this phase doesn't touch core.)

### RESULT MAPPING — SOURCE: apps/mcp-server/src/tools/clinic/search.ts:157-173
```ts
return {
  success: true,
  count: clinics.length,
  clinics: clinics.map((clinic: { id: string; name: string; specialty?: string; city?: string; address?: string; phoneNumber?: string }) => ({
    id: clinic.id,
    name: clinic.name,
    specialty: clinic.specialty,
    city: clinic.city,
    address: clinic.address,
    phoneNumber: clinic.phoneNumber,
  })),
  filters: { query: params.query, city: params.city, specialty: params.specialty },
};
```
Mirror this exact shape; add the `cards` field built from the same `clinics`.

### TEST STRUCTURE — SOURCE: packages/core/src/types/cards.test.ts:1-25
```ts
import { describe, it, expect } from "vitest";
describe("buildBookingHref", () => {
  it("builds a clinic-only link without a query string", () => {
    expect(href({ clinicId: "c1" })).toBe("/booking/c1");
  });
});
```
Mirror: vitest `describe/it/expect`, one assertion per behavior, test the **pure mapping** (no DB).

## Files to Change
| File | Action | Justification |
|---|---|---|
| `apps/mcp-server/src/tools/clinic/search.ts` | UPDATE | Add a pure `buildClinicCards()` helper + `cards?` field on the result + the import. |
| `apps/mcp-server/src/tools/clinic/search.test.ts` | CREATE | Unit-test the pure mapping: card fields, bookingHref, empty→undefined. |

## NOT Building
- **No chat/UI rendering** — cards are not displayed yet (Phase 4).
- **No transport change** — `chat-api` still streams text; `extractText()` still flattens. `cards` rides inside the JSON untouched.
- **No `doctor_search`** — that's Phase 3.
- **No removal of the `clinics` array** — kept for the current text fallback; removing it would break today's chat answers before Phase 4 lands.
- **No new auth/registry wiring** — `clinic_search` is already registered & public.
- **No `nextAvailableSlot` / availability calls** — clinic cards have no slot field; that's a doctor-card concern (Phase 3).
- **No branded `ClinicId`** — deferred (needs a Supabase-boundary mapping pass); `clinicId: string` for now, matching the Phase-1 contract.

## Step-by-Step Tasks

### Task 1: Add the import
- **ACTION:** UPDATE `apps/mcp-server/src/tools/clinic/search.ts` import block.
- **IMPLEMENT:** `import { buildBookingHref, type DiscoveryCards, type ClinicCardItem, type NonEmptyArray } from "@queuemed/core";`
- **MIRROR:** IMPORT pattern above.
- **GOTCHA:** `@queuemed/core` resolves to its built `dist`. If a type isn't found, run `pnpm --filter @queuemed/core build` (Phase 1 already did this; only needed if `dist` is stale).
- **VALIDATE:** `corepack pnpm --filter @queuemed/mcp-server typecheck` → 0 errors.

### Task 2: Add the pure `buildClinicCards` helper
- **ACTION:** UPDATE `search.ts` — add a module-level pure function above the executor.
- **IMPLEMENT:**
  ```ts
  type ClinicRow = { id: string; name: string; specialty?: string; city?: string; address?: string; phoneNumber?: string };

  function toClinicCard(clinic: ClinicRow): ClinicCardItem {
    return {
      clinicId: clinic.id,
      name: clinic.name,
      specialty: clinic.specialty,
      city: clinic.city,
      address: clinic.address,
      phoneNumber: clinic.phoneNumber,
      bookingHref: buildBookingHref({ clinicId: clinic.id }),
    };
  }

  /** Build the card payload; undefined when there are no results (NonEmptyArray contract). */
  export function buildClinicCards(clinics: ClinicRow[]): DiscoveryCards | undefined {
    if (clinics.length === 0) return undefined;
    const items = clinics.map(toClinicCard);
    // Safe: length checked above. NonEmptyArray cannot be inferred from Array.map.
    return { kind: "clinic_cards", items: items as unknown as NonEmptyArray<ClinicCardItem> };
  }
  ```
- **MIRROR:** RESULT MAPPING pattern (same field set, plus `bookingHref`).
- **GOTCHA:** `clinics.map()` yields `ClinicCardItem[]`, NOT `NonEmptyArray` — TS can't narrow it from a `.length` check on a separate variable, so the guarded `as` cast is required and correct. `bookingHref` for a **clinic** card passes only `{ clinicId }` (no `staffId` — that's a doctor concern).
- **VALIDATE:** typecheck → 0 errors.

### Task 3: Attach `cards` to the result
- **ACTION:** UPDATE the `ClinicSearchResult` interface (`search.ts:99-115`) and the executor `return` (`search.ts:157-173`).
- **IMPLEMENT:**
  - Interface: add `cards?: DiscoveryCards;`
  - Executor: compute `const cards = buildClinicCards(clinics as ClinicRow[]);` then add `cards` to the returned object (spread or conditional — omit the key when `undefined` is fine since it's optional).
- **MIRROR:** RESULT MAPPING.
- **GOTCHA:** Keep `clinics`, `count`, `filters` exactly as-is — additive only. Do not reorder/rename existing keys (the agent prompt + any consumer rely on them).
- **VALIDATE:** typecheck → 0 errors.

### Task 4: Unit-test the mapping
- **ACTION:** CREATE `apps/mcp-server/src/tools/clinic/search.test.ts`.
- **IMPLEMENT:** import `buildClinicCards` from `./search`; cover the cases in the Testing Strategy table. Coerce `bookingHref` to string for comparison (branded type), mirroring `cards.test.ts:5`.
- **MIRROR:** TEST STRUCTURE.
- **GOTCHA:** mcp-server's test script is `vitest run --passWithNoTests` (already present — no runner setup needed, unlike the Phase-1 core gap).
- **VALIDATE:** `corepack pnpm --filter @queuemed/mcp-server test` → all pass.

## Testing Strategy
| Input | Expected | Edge? |
|---|---|---|
| `[{id:"c1",name:"Casa Family Care",city:"Casablanca",specialty:"Dermatologie"}]` | `{kind:"clinic_cards", items:[{clinicId:"c1", name:"Casa Family Care", city:"Casablanca", specialty:"Dermatologie", bookingHref:"/booking/c1"}]}` | no |
| `[]` (no results) | `undefined` | ✅ empty |
| clinic with no optional fields `{id:"c2",name:"X"}` | item has `bookingHref:"/booking/c2"`, optional fields `undefined`, no crash | ✅ missing fields |
| `{id:"a b",name:"Y"}` | `bookingHref:"/booking/a%20b"` (encoded by `buildBookingHref`) | ✅ special chars |
| 2 clinics | `items.length === 2`, each with a distinct `bookingHref` | no |

Edge-case checklist: empty (→undefined) ✅ · missing optional fields ✅ · special chars in id ✅ · multiple results ✅ · invalid type (out of scope — Zod validates inputs upstream; mapping trusts the service shape).

## Validation Commands (this repo)
- Typecheck (consumer): `corepack pnpm --filter @queuemed/mcp-server typecheck` → 0 errors
- Unit tests: `corepack pnpm --filter @queuemed/mcp-server test` → pass
- Build: `corepack pnpm --filter @queuemed/mcp-server build` → success
- (No DB/browser step — pure mapping; no schema or runtime server change.)

## Acceptance Criteria
- [ ] `clinic_search` result includes `cards: { kind:"clinic_cards", items:[...] }` when ≥1 clinic matches.
- [ ] `cards` is omitted/`undefined` when 0 clinics match (no empty card array ever emitted).
- [ ] Every card's `bookingHref` is produced by `buildBookingHref` (branded) — `/booking/:clinicId`.
- [ ] Existing `clinics` / `count` / `filters` fields unchanged (backward-compatible).
- [ ] mcp-server typecheck 0, tests pass, build succeeds.

## Completion Checklist
- [ ] Tasks 1–4 done · [ ] typecheck 0 · [ ] tests green · [ ] build ok · [ ] report written · [ ] plan archived to `plans/completed/`.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `NonEmptyArray` cast hides a real empty array | L | M | Cast is guarded by an explicit `length === 0 → undefined` return immediately above it; unit-tested. |
| `@queuemed/core` `dist` stale → type not found | L | L | Phase 1 rebuilt it; plan includes the rebuild command in Task 1 GOTCHA. |
| Clinic-service result shape differs from `ClinicRow` | L | M | Mirrors the field set already mapped at `search.ts:160-167`; typecheck catches drift. |
| Adding `cards` bloats the text the agent reads pre-Phase-4 | L | L | Acceptable interim; Phase 4 stops flattening cards into prose. Noted, not blocking. |

## Confidence: 9/10
Single-pass-ready: additive change to one file + one test, frozen contract already exists and is verified to resolve, real patterns pasted, test runner already present. The only judgement call (additive `cards?` vs. replacing the result) is decided and justified in NOT Building.

> Next: `/implement .claude\PRPs\plans\mcp-clinic-search-cards.plan.md`
