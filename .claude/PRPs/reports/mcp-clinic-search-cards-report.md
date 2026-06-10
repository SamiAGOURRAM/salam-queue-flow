# Implementation Report: clinic_search → Discovery Card Payload (Phase 2)

## Summary
`clinic_search` now emits the frozen `DiscoveryCards` payload (`kind: "clinic_cards"`)
alongside its existing `clinics` array — each card carrying a code-minted
`bookingHref`. The producer half of the card pipeline is done: the structured,
renderable, deep-linkable data now exists in the tool result. No transport/UI
change (that's Phase 4). Implemented backend-first (tool contract + pure mapping +
tests, no UI) with a type-design pass on the non-empty payload.

Implementation surfaced — and fixed — a **pre-existing latent module-resolution
bug** in `@queuemed/core` that made its entire type barrel invisible to NodeNext
consumers. Phase 2 is the first consumer to cross that boundary.

## Assessment vs Reality
| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small for the feature; +1 root-cause fix in core (mechanical) |
| Confidence | 9/10 | Held — the one unknown (core barrel resolution) was caught by the validate-after-every-change loop, not at runtime |
| Files changed | 2 | 5 source + dist rebuild (3 beyond plan — see Deviations) |

## Tasks Completed
| # | Task | Status | Notes |
|---|---|---|---|
| 1 | Add `@queuemed/core` import | ✅ | Dropped `NonEmptyArray` from import (deviation #1) |
| 2 | Pure `buildClinicCards` helper | ✅ | Control-flow non-emptiness, no cast (deviation #1) |
| 3 | Attach `cards?` to result | ✅ | Additive; `clinics`/`count`/`filters` untouched |
| 4 | Unit-test the mapping | ✅ | 6 tests, all green |
| — | Unblock core→NodeNext resolution | ✅ | Root-cause fix (deviation #2) |

## Validation Results
| Level | Status | Notes |
|---|---|---|
| Static (mcp-server typecheck) | ✅ Pass | `tsc --noEmit`, 0 errors |
| Static (core typecheck) | ✅ Pass | 0 errors after barrel fix |
| Unit tests | ✅ Pass | 6/6 (`search.test.ts`) via vitest 2.1.9 |
| Build (mcp-server) | ✅ Pass | clean — no test files leak into `dist` (deviation #3) |
| Build (core) | ✅ Pass | emitted `dist/index.d.ts` now `export * from './types/index.js'` |
| Other consumers | ✅ Safe | web imports nothing from core (Vite-aliased dep, bundler resolution); chat-api doesn't import core |

## Files Changed
| File | Action | Notes |
|---|---|---|
| `apps/mcp-server/src/tools/clinic/search.ts` | UPDATE | import + `ClinicRow` + `toClinicCard` + `buildClinicCards` + `cards` field |
| `apps/mcp-server/src/tools/clinic/search.test.ts` | CREATE | 6 unit tests for the pure mapping |
| `apps/mcp-server/tsconfig.json` | UPDATE | exclude `**/*.test.ts` from emit/typecheck (deviation #3) |
| `packages/core/src/index.ts` | UPDATE | directory barrels → `./x/index.js` (deviation #2) |
| `packages/core/src/types/index.ts` | UPDATE | `./cards` → `./cards.js` (deviation #2) |
| `packages/core/dist/**` | REBUILT | via `pnpm --filter @queuemed/core build` |

## Deviations from Plan (WHAT / WHY)
1. **Helper proves non-emptiness via control flow, not a cast.** Plan used
   `items as NonEmptyArray<ClinicCardItem>` guarded by a length check. Implemented
   `const [first, ...rest] = clinics.map(toClinicCard); if (!first) return undefined;
   return { kind, items: [first, ...rest] }` — the compiler infers
   `[ClinicCardItem, ...ClinicCardItem[]]` with **no assertion**. `NonEmptyArray`
   import became unused and was dropped. *Why:* a type assertion is a hole; control
   flow makes the illegal (empty) state unrepresentable at the return. (type-design check.)
2. **Fixed core's extensionless barrel re-exports** (`packages/core/src/index.ts`
   ×5 directory barrels; `packages/core/src/types/index.ts` `./cards`). NOT in the
   plan's Files to Change. *Why — root cause:* `@queuemed/core` compiles with
   `moduleResolution: "bundler"`, so its emitted `.d.ts` re-exports directories
   extensionlessly (`export * from './types'`). `@queuemed/mcp-server` consumes with
   `moduleResolution: "NodeNext"` **+ `skipLibCheck: true`**, which **cannot** resolve
   a bare directory specifier and **silently drops** the unresolved re-export (no
   error — the members simply vanish). The entire `./types` barrel (`Clinic`,
   `QueueEntry`, and the new cards) was invisible to mcp-server; it had only ever
   imported `createServiceContainer`/`ServiceContainer` from `./container` (a file,
   which resolves), so nobody had hit it. Appending `/index.js` makes the emitted
   `.d.ts` NodeNext- and Node-ESM-correct; bundler (core) and Vite (web) both accept
   the extension. Fixed all five directory barrels (not just `./types`) since they
   share the identical bug and Phase 3/5 would re-hit it.
3. **Excluded `**/*.test.ts` from mcp-server's tsconfig.** The build (`tsc`) was
   emitting `dist/tools/clinic/search.test.js` (test code shipped to prod). Mine is
   the first test under mcp-server `src`, so there was no convention. *Why:* mirrors
   the sibling `@queuemed/core` tsconfig (`exclude: [..., "**/*.test.ts"]`); vitest
   type-checks tests at run, so nothing is lost.
4. **`clinics as ClinicRow[]` in the executor.** The core clinic-service result is
   loosely typed; the original code already annotated the element shape inline at the
   `.map`. The cast matches that existing pattern and keeps `buildClinicCards`
   strictly typed.

## Issues Encountered & Resolutions
- **mcp-server typecheck: "no exported member" for cards.** Diagnosed via
  `tsc --traceResolution` (confirmed it resolved to the correct dist) + in-`src`
  probe files (confirmed the whole `./types` barrel was invisible, not just cards).
  Root cause = bundler-emitted extensionless re-exports consumed by NodeNext under
  `skipLibCheck`. Resolved by deviation #2.
- **Test files leaking into `dist`.** Resolved by deviation #3.

## Tests Written
| Test File | Tests | Coverage |
|---|---|---|
| `apps/mcp-server/src/tools/clinic/search.test.ts` | 6 | empty→undefined · full field mapping · code-gen bookingHref · special-char encoding · optional fields absent · multiple clinics with distinct hrefs |

## Lesson candidates (for /learn)
1. **Cross-package `.d.ts` resolution mismatch is silent under `skipLibCheck`.** A
   package built with `moduleResolution: bundler` emits extensionless directory
   re-exports; a `NodeNext` consumer with `skipLibCheck: true` drops them with **no
   error** — exports just "don't exist". When a monorepo type import inexplicably
   reports "no exported member" while resolution traces to the right file, suspect
   extensionless re-exports in the dependency's emitted `.d.ts`; fix by adding
   explicit `/index.js`/`.js` extensions at the source barrels.
2. **A TS package's `tsconfig` must exclude `**/*.test.ts` from its build**, or the
   first co-located test silently ships into `dist`. Check the sibling package's
   convention before adding the first test.

## Acceptance Criteria
- [x] `cards: { kind:"clinic_cards", items:[...] }` present when ≥1 clinic matches.
- [x] `cards` omitted/`undefined` when 0 clinics match (no empty card array).
- [x] Every `bookingHref` produced by `buildBookingHref` (branded) → `/booking/:clinicId`.
- [x] Existing `clinics`/`count`/`filters` unchanged (backward-compatible).
- [x] mcp-server typecheck 0, tests 6/6, build clean.

## Code Review (post-implementation: code-reviewer + type-design-analyzer + blast-radius trace)
3 parallel finder agents → 13 candidates → verified by reading code + `tsc`/`grep`.

**Fixed (1):**
- **`ClinicRow` duplicated the canonical `Clinic`; `as ClinicRow[]` cast was redundant & drift-hiding.** `searchClinics(): Promise<Clinic[]>`. Replaced the hand-written type with `type ClinicRow = Pick<Clinic, "id"|"name"|"specialty"|"city"|"address"|"phoneNumber">` (derived → renames in `Clinic` now break loudly; still a narrow input so tests needn't build a full `Clinic`) and removed the cast.

**Confirmed but deferred (documented, not fixed — out of Phase-2 scope):**
- **`getClinicService()` returns `any` → `clinics` is `any`.** `ClinicService` (and all of `ServiceContainer`'s service/port types) is silently dropped because core's nested barrels (`services/index.ts`, `ports/index.ts`, `repositories/index.ts`, `container.ts` imports) are STILL extensionless — the Phase-2 fix only carried the `./types` chain to its leaf. **Pre-existing** (the original code's explicit inline annotation was a workaround for this same `any`). A targeted patch is whack-a-mole (every leaf in core imports extensionlessly); the clean fix is global: switch core's tsconfig to `module/moduleResolution: NodeNext` (tsc then enforces extensions everywhere) — its own task. Mitigated locally with the `ClinicRow` annotation + an explanatory comment.
- **`node dist/index.js` (prod start) was already broken** on the extensionless `./container` re-export (`ERR_MODULE_NOT_FOUND`) before this change; not introduced here and not claimed fixed. Dev (tsx) and web (Vite→src) tolerate it. Same global fix resolves it.

**Refuted (not bugs):**
- "`create.ts` hybrid skips the slot guard" — `create.ts:281` intentionally treats `hybrid` like `fluid` (queue without a fixed time). Not a bug; also outside this change.
- "`clinics` map drops `email`/`createdAt`" — pre-existing intended projection, not introduced here.
- `count`/`clinics`/`cards` dual-source-of-truth, `undefined` no-results sentinel, unbranded `clinicId` input, test-brand-gap — accepted by design (all three counts derive from the same array today; branded entity IDs already deferred per `cards.ts:75`).

Re-validated after the fix: typecheck 0, tests 6/6, build clean (no dist leak).

## Next Steps
- [ ] `/code-review` (delegate to **code-reviewer** + **type-design-analyzer**) — focus on deviation #2 (core barrel change) blast radius.
- [ ] `/learn` to capture the two lessons above.
- [ ] Phase 3 (`doctor_search`) via `/plan` — will reuse `buildBookingHref({ clinicId, staffId })` for doctor cards.
- [ ] Follow-up (not blocking): the remaining nested barrels in core (`services/*`, `ports/*`, `repositories/*`) still emit extensionless re-exports — harmless until a NodeNext consumer imports from them; fix in the same style if/when that happens.
- [ ] Nothing committed — staged on `feat/showcase-ai-chatbot`.
