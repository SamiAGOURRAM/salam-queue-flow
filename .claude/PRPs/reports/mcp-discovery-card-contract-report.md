# Implementation Report: Discovery Card Contract (Phase 1)

## Summary
Added the shared, typed **card contract** to `@queuemed/core`: `DoctorCardItem`, `ClinicCardItem`, the `DiscoveryCards` discriminated union, `BookingHrefParams`, and the code-only `buildBookingHref` helper. Contract only — no tool logic, UI, or transport changes. This is the frozen interface Phases 2–4 consume.

## Assessment vs Reality
| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small |
| Confidence | 9/10 | Held — only the (anticipated) test-runner gap surfaced |
| Files changed | 3–4 | 4 source + dist rebuild + lockfile |

## Tasks Completed
| # | Task | Status | Notes |
|---|---|---|---|
| 1 | Create card contract (`cards.ts`) | ✅ Complete | Types + `buildBookingHref` |
| 2 | Export from package surface | ✅ Complete | Deviated — see below |
| 3 | Unit-test the helper | ✅ Complete | Deviated — wired a test runner |

## Validation Results
| Level | Status | Notes |
|---|---|---|
| Static (typecheck) | ✅ Pass | `@queuemed/core` tsc --noEmit, 0 errors |
| Lint | N/A | core has no lint script |
| Unit tests | ✅ Pass | 4/4 (`cards.test.ts`) via vitest 2.1.9 |
| Build | ✅ Pass | exports present in `dist/types/cards.d.ts` + re-export chain |
| Integration | N/A | types-only, no runtime/server |
| Consumer resolution | ✅ Pass | `@queuemed/mcp-server` tsc --noEmit, 0 errors (proves core types still resolve) |

## Files Changed
| File | Action | Notes |
|---|---|---|
| `packages/core/src/types/cards.ts` | CREATED | the contract |
| `packages/core/src/types/index.ts` | UPDATED | `export * from './cards'` |
| `packages/core/src/types/cards.test.ts` | CREATED | 4 unit tests |
| `packages/core/package.json` | UPDATED | added `vitest` devDep + `test` script (deviation) |
| `packages/core/dist/**` | REBUILT | via `pnpm --filter @queuemed/core build` |
| `pnpm-lock.yaml` | UPDATED | vitest devDep |

## Deviations from Plan (WHAT / WHY)
1. **No `.js` extension on the re-export.** The plan's GOTCHA said ESM needs `.js`; the repo's `src/index.ts` uses extensionless relative imports (`export * from './types'`), so its tsconfig resolution doesn't require it. **Matched the repo convention** instead of the plan.
2. **`src/index.ts` change was a no-op.** It already re-exported `./types`, so Task 2's "add if missing" was unnecessary — verified, left as-is.
3. **Added a test runner to `@queuemed/core`** (`vitest` devDep + `test` script) — NOT in the plan's Files to Change. **Why:** the plan's mitigation ("run from workspace root vitest") was invalid — there is no root vitest, and `apps/web`'s vitest config is scoped to `apps/web/src`, so it cannot run a core test. Rather than leave a test that never executes (false comfort), the root-cause fix was to give core its own runner. Small, additive, and every later core test benefits.

## Issues Encountered
- Test could not run initially (no vitest in root or core; web's config excludes paths outside `apps/web/src`). Resolved by deviation #3.

## Tests Written
| Test File | Tests | Coverage |
|---|---|---|
| `packages/core/src/types/cards.test.ts` | 4 | `buildBookingHref`: base, with staffId, special-char encoding, empty staffId |

## Lesson candidate (for /learn)
`@queuemed/core` had no test runner and the root has no vitest; `apps/web`'s vitest config is scoped to `apps/web/src`. Before writing a unit test for a `packages/*` module, add `vitest` + a `test` script to that package — don't assume a shared runner exists.

## Post-review hardening (after code-reviewer + type-design-analyzer)
code-reviewer: APPROVE, 0 findings. type-design-analyzer flagged the security comment wasn't compiler-enforced. Applied three tightenings to the still-unconsumed frozen contract:
- `bookingHref` → branded `BookingHref` type, produced only by `buildBookingHref` (the "never model-authored" rule is now a compile error if violated).
- `DiscoveryCards.items` → `NonEmptyArray<T>` (zero-result is not a valid card payload).
- All contract fields `readonly`.
- Deferred: branded entity IDs (`ClinicId`/`StaffId`) → Phase 2 (needs Supabase boundary mapping).
Re-validated: core typecheck 0, build 0, tests 4/4, mcp-server consumer typecheck 0.

## Next Steps
- [ ] `/code-review` (delegate to code-reviewer + type-design-analyzer agents)
- [ ] `/learn` to capture the test-runner lesson
- [ ] Proceed to Phase 2 (`clinic_search` → card payload) via `/plan`
