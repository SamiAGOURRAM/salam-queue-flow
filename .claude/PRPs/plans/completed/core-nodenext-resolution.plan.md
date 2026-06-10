# Plan: Make @queuemed/core NodeNext-resolvable (infra fix)

## Summary
Switch `@queuemed/core` to emit `.d.ts`/`.js` with **explicit relative extensions**
so NodeNext consumers (`@queuemed/mcp-server`, future `chat-api`) can actually see
its exports, and so `node dist/index.js` stops throwing `ERR_MODULE_NOT_FOUND`.
Done by flipping core's tsconfig to `module/moduleResolution: NodeNext` (which makes
`tsc` **enforce** extensions) and adding `.js` to all ~72 relative specifiers. This
is the root-cause fix for the silent-export-drop discovered in Phase 2 — it removes
the `any` degradation of `ClinicService`/`ServiceContainer.*` in the consumer.

## User Story
As a developer importing from `@queuemed/core` into a NodeNext app, I get the real
exported types (not silently-dropped members typed `any`), and `tsc` stops me at
compile time if a relative import is missing its extension — so resolution bugs
can never again hide behind `skipLibCheck`.

## Problem → Solution
- **Problem:** core compiles with `moduleResolution: "bundler"` → emits extensionless
  re-exports (`export * from './types'`). NodeNext + `skipLibCheck:true` consumers
  **silently drop** anything behind a directory/extensionless re-export; values become
  `any`, and `node dist` fails at runtime on `./container`. (Phase-2 report, Code Review.)
- **Solution:** flip core to `NodeNext` so `tsc` requires extensions, add `.js`
  everywhere, rebuild. All consumers stay green (web aliases core→`src`; Vite/tsx
  resolve `.js`→`.ts`), and the consumer's `any` workaround can be removed (the
  acceptance proof).

## Metadata
- **Complexity:** Medium (1 config + ~20 files, but purely mechanical: add `.js`)
- **Source:** Phase-2 review follow-up (`reports/mcp-clinic-search-cards-report.md`)
- **Estimated files:** `packages/core/tsconfig.json` + ~20 `src/**/*.ts` + dist rebuild; then 1 cleanup in `apps/mcp-server/src/tools/clinic/search.ts`

## Mandatory Reading
| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `packages/core/tsconfig.json` | 4–5 | `module: ESNext`, `moduleResolution: bundler` — the two lines to flip. |
| P0 | `packages/core/src/index.ts` | 8–37 | Top barrel; already `.js` on 5 dir-barrels (Phase 2). `./container` (line 40–41) still extensionless. |
| P0 | `packages/core/src/container.ts` | 8–30 | 11 extensionless imports (ports + services + repositories) — the chain that types `ServiceContainer`. |
| P1 | `packages/core/src/{types,errors,ports,services,repositories}.ts` | all | Shim files that re-export `./X/index` extensionlessly; `BaseRepository` imports `'../../errors'` → resolves to `errors.ts`. Keep them; add `.js`. |
| P1 | `apps/web/vite.config.ts` | 16–23 | Web aliases `@queuemed/core` → `packages/core/src` (SOURCE) and pre-bundles it. Confirms `.js`-on-`.ts` source specifiers are Vite-safe. |
| P1 | `apps/mcp-server/src/tools/clinic/search.ts` | 200–210 | The `// NOTE: clinics is any` workaround to remove as the acceptance proof. |
| P2 | `packages/core/src/types/cards.test.ts` | 1–25 | Core vitest; must still pass (imports `./cards` — under NodeNext that becomes a leaf import, vitest/vite tolerant). |

## Patterns to Mirror (real snippets)

### TSCONFIG FLIP — SOURCE: packages/core/tsconfig.json:4-5
```jsonc
"module": "ESNext",
"moduleResolution": "bundler",
```
→ becomes:
```jsonc
"module": "NodeNext",
"moduleResolution": "NodeNext",
```
(Leave `target`, `outDir`, `isolatedModules`, `declaration`, `esModuleInterop` as-is — all already NodeNext-compatible.)

### THE MECHANICAL EDIT — SOURCE: packages/core/src/container.ts:23
```ts
import { BookingService } from './services/booking/BookingService';
```
→ append `.js` to the relative specifier (NOT to bare/package specifiers like `@supabase/supabase-js`):
```ts
import { BookingService } from './services/booking/BookingService.js';
```
Rule: every specifier starting with `./` or `../` gets a `.js` suffix pointing at the file (a directory like `./types` becomes `./types/index.js`). `tsc` after the flip reports each violation with TS2835 ("Relative import paths need explicit file extensions … did you mean './x.js'?") — the error text *is* the fix.

### SHIM FILE — SOURCE: packages/core/src/errors.ts:4
```ts
export * from './errors/index';
```
→
```ts
export * from './errors/index.js';
```

## Files to Change
| File | Action | Justification |
|---|---|---|
| `packages/core/tsconfig.json` | UPDATE | Flip to NodeNext (the enforcement switch). |
| `packages/core/src/index.ts` | UPDATE | `.js` on `./container` re-exports (line 40–41); barrels already done. |
| `packages/core/src/container.ts` | UPDATE | `.js` on 11 relative imports. |
| `packages/core/src/{types,errors,ports,services,repositories}.ts` | UPDATE | `.js` on the shim re-export. |
| `packages/core/src/{ports,services,repositories,errors,types}/index.ts` | UPDATE | `.js` on nested re-exports (e.g. `./database` → `./database.js`, `./booking/BookingService` → `.js`). |
| `packages/core/src/services/**/.ts`, `repositories/**/.ts`, `ports/*.ts` | UPDATE | `.js` on every remaining relative import (`../../types`, `../base/BaseRepository`, `../../errors`, etc.). Driven by tsc errors. |
| `apps/mcp-server/src/tools/clinic/search.ts` | UPDATE | Remove the `// NOTE: clinics is any` workaround + the inline `ClinicRow` annotation once `clinics` infers `Clinic[]` (acceptance proof). |

## NOT Building
- **No logic changes** — extensions only; zero behavioral edits to any service/repo/type.
- **No consumer tsconfig changes** — mcp-server stays NodeNext; web stays Vite/bundler. (Only the core `search.ts` workaround is cleaned up, and only because the fix makes it unnecessary.)
- **No deletion of the shim files** (`types.ts` etc.) — `BaseRepository` imports `'../../errors'` which resolves to `errors.ts`; deleting would broaden scope. Just extension them.
- **No `package.json exports` subpath additions** — current `.` + `./services/*` map is sufficient.
- **No switch to `verbatimModuleSyntax`** — out of scope; isolatedModules already covers the emit constraints.

## Step-by-Step Tasks

### Task 1: Flip core tsconfig to NodeNext
- **ACTION:** UPDATE `packages/core/tsconfig.json` lines 4–5.
- **IMPLEMENT:** `module: "NodeNext"`, `moduleResolution: "NodeNext"`.
- **MIRROR:** TSCONFIG FLIP.
- **GOTCHA:** Do this FIRST — it turns every missing extension into a hard `tsc` error, which becomes your worklist for Tasks 2–3.
- **VALIDATE:** `corepack pnpm --filter @queuemed/core typecheck` → now lists TS2835 errors (expected, ~72).

### Task 2: Add `.js` to all relative specifiers (mechanical, tsc-driven)
- **ACTION:** UPDATE every `src/**/*.ts` (non-test) flagged by tsc.
- **IMPLEMENT:** for each TS2835/TS2307 error, append `.js` (directory → `/index.js`). Covers: `index.ts` (`./container`), `container.ts` (×11), the 5 shim files, the 5 `*/index.ts` nested barrels, and every `../../types` / `../base/BaseRepository` / `../../errors` / `../../ports/*` in services/repositories/ports.
- **MIRROR:** THE MECHANICAL EDIT + SHIM FILE.
- **GOTCHA:** Only relative (`./`,`../`) specifiers — never touch `@supabase/supabase-js`, `zod`, `@queuemed/*`. Type-only imports (`import type { X } from '../../types'`) also need the `.js`.
- **VALIDATE:** re-run typecheck after each batch; iterate to **0 errors**. (If a non-extension error appears — e.g. a CJS default-import interop issue — STOP and note it; `esModuleInterop` is already on so this is unlikely.)

### Task 3: Rebuild dist and confirm emitted extensions
- **ACTION:** rebuild.
- **IMPLEMENT:** `corepack pnpm --filter @queuemed/core build`.
- **VALIDATE:** `grep "from './" packages/core/dist/index.js packages/core/dist/container.js` → every relative specifier ends in `.js`. No bare `'./container'` / `'./types'` remain.

### Task 4: Prove the consumer now sees real types (acceptance)
- **ACTION:** UPDATE `apps/mcp-server/src/tools/clinic/search.ts` — remove the `// NOTE: clinics is any …` comment and the `(clinic: ClinicRow)` annotation on the inline `.map` (line ~205), letting `clinic` infer.
- **IMPLEMENT:** `clinics.map((clinic) => ({ id: clinic.id, … }))` with no annotation.
- **GOTCHA:** This MUST now typecheck — if it does, `getClinicService()` is correctly typed `ClinicService` (returns `Clinic[]`), proving the fix end-to-end. If it still errors "implicitly any", a nested re-export was missed in Task 2.
- **VALIDATE:** `corepack pnpm --filter @queuemed/mcp-server typecheck` → 0 errors with the annotation removed.

### Task 5: Full consumer + runtime regression
- **ACTION:** validate every consumer and the runtime entry.
- **VALIDATE (all):**
  - core: `typecheck` 0, `test` pass, `build` ok.
  - mcp-server: `typecheck` 0, `test` 6/6, `build` clean.
  - web: `corepack pnpm --filter @queuemed/web build` → succeeds (proves Vite resolves `.js`→`.ts` from source alias).
  - runtime: `node -e "import('@queuemed/core').then(m=>console.log(Object.keys(m).length))"` from `packages/core` (or `node packages/core/dist/index.js`) → prints a number, **no `ERR_MODULE_NOT_FOUND`** (was broken before).

## Testing Strategy
No new unit tests — this is a resolution/emit change. The **regression surface IS the test**: existing core tests + mcp-server tests + web build + the node-import smoke. Edge checks:
| Check | Expect |
|---|---|
| core typecheck after flip | 0 errors (all extensions added) |
| mcp-server `clinics` annotation removed | infers `Clinic[]`, typechecks |
| web build | success (source alias, `.js`→`.ts`) |
| `node` import of core dist | no ERR_MODULE_NOT_FOUND |
| core vitest | still green (cards.test imports `./cards`) |

## Validation Commands (this repo)
- `corepack pnpm --filter @queuemed/core typecheck` → 0
- `corepack pnpm --filter @queuemed/core build` → ok; dist specifiers end in `.js`
- `corepack pnpm --filter @queuemed/core test` → pass
- `corepack pnpm --filter @queuemed/mcp-server typecheck` → 0 (annotation removed)
- `corepack pnpm --filter @queuemed/mcp-server test` → 6/6
- `corepack pnpm --filter @queuemed/web build` → success
- `node packages/core/dist/index.js` → no module-not-found

## Acceptance Criteria
- [ ] core `module/moduleResolution` = NodeNext; typecheck 0.
- [ ] dist emits explicit `.js` on all relative specifiers.
- [ ] mcp-server `search.ts` compiles with the `ClinicRow` annotation **removed** (clinics inferred `Clinic[]`).
- [ ] web build + core tests + mcp-server tests all green.
- [ ] `node` import of core dist no longer throws.

## Completion Checklist
- [ ] Tasks 1–5 · [ ] all validations green · [ ] report written · [ ] plan archived.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| NodeNext surfaces a non-extension error (CJS interop) | L | M | `esModuleInterop` already on; supabase/zod are ESM-OK. Task 2 says STOP + report if a non-extension error appears. |
| Missed a nested re-export → consumer still sees `any` | M | M | Task 4 is the detector: removing the `clinics` annotation fails to compile if anything was missed. |
| Web build breaks on `.js`-on-`.ts` source | L | H | Vite/esbuild explicitly support this; Task 5 builds web to confirm before declaring done. |
| Shim file `errors.ts` vs dir `errors/` ambiguity under NodeNext | L | M | File beats dir; `'../../errors'`→`errors.js` (the shim) which re-exports `./errors/index.js`. tsc confirms resolution. |

## Confidence: 8/10
Mechanical and tsc-enforced (the compiler hands you the exact worklist), with a built-in end-to-end detector (Task 4). The −2 is the small chance NodeNext surfaces a non-extension interop issue in a service file not yet read — caught immediately by the typecheck loop, not at runtime.

> Next: `/implement .claude\PRPs\plans\core-nodenext-resolution.plan.md` — then `/implement` the Phase 3 plan.
