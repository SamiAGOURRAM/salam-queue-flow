# Implementation Report: @queuemed/core NodeNext-resolvable (infra fix)

## Summary
Switched `@queuemed/core` to `module/moduleResolution: NodeNext` and added explicit
`.js` extensions to all relative import/re-export specifiers, so its emitted
`.d.ts`/`.js` are resolvable by NodeNext/Node-ESM consumers. This removes the
silent-export-drop discovered in Phase 2 (`ClinicService`/`ServiceContainer.*` were
`any` in mcp-server) and unbreaks `node dist/index.js` at runtime.

## Assessment vs Reality
| Metric | Predicted | Actual |
|---|---|---|
| Complexity | Medium (mechanical) | Medium — held |
| Confidence | 8/10 | Held; the −2 risk (a non-extension error) materialized as exactly ONE latent bug, caught by the typecheck loop as designed |
| Files | tsconfig + ~20 src + 1 consumer cleanup | tsconfig + ~20 core src + 2 mcp-server files |

## Validation Results
| Level | Status | Notes |
|---|---|---|
| core typecheck | ✅ 0 | after flip, 115 errors → 0 (72 TS2835 + cascading TS2339/TS7006 all cleared by the extension sweep) |
| core build | ✅ | dist emits `.js` on every relative specifier (verified) |
| core tests | ✅ 4/4 | cards.test.ts |
| mcp-server typecheck | ✅ 0 | **acceptance proof**: `search.ts` compiles with the `ClinicRow` annotation REMOVED → `getClinicService()` now typed `ClinicService`, `clinics` infers `Clinic[]` |
| mcp-server build | ✅ | clean, no test-file leak |
| mcp-server tests | ✅ 6/6 | |
| web build | ✅ | `vite build` 7.88s — confirms `.js`→`.ts` source-alias resolution is bundler-safe |
| node ESM runtime | ✅ | `node packages/core/dist/index.js` exits 0 (was `ERR_MODULE_NOT_FOUND` on `./container`) |

## Files Changed
| File | Action | Notes |
|---|---|---|
| `packages/core/tsconfig.json` | UPDATE | `module`+`moduleResolution` → `NodeNext` (the enforcement switch) |
| `packages/core/src/**/*.ts` (~20 files) | UPDATE | `.js` appended to every relative specifier (container, shims, nested barrels, all repos/services/ports) |
| `apps/mcp-server/src/tools/clinic/search.ts` | UPDATE | removed the `// clinics is any` workaround + inline `ClinicRow` annotation (acceptance proof) |
| `apps/mcp-server/src/tools/queue/getPosition.ts` | UPDATE | latent bug fix surfaced by the change (see Deviations) |
| `packages/core/dist/**` | REBUILT | (gitignored) |

## Deviations from Plan (WHAT / WHY)
1. **Mechanical sweep applied via a `perl -pe` one-liner**, not file-by-file. *Why:* 72 identical edits. **Caught a tooling hazard:** the one-liner mangled specifiers that ALREADY ended in `.js` (the Phase-2 barrels in `index.ts`/`types/index.ts` became `export * js;`). Recovered by `git checkout HEAD -- <those 2 files>` (restoring the committed-correct Phase-2 state) and re-applying only the two genuine edits (`./container` → `.js`; re-add the foreign WIP `hybrid` line). All other files were extensionless pre-sweep and got clean single appends. **Lesson candidate:** an "append `.js` to relative imports" sweep must skip specifiers already ending in `.js`/`.json`; verify by scanning for `export * js`/`.js.js` after running.
2. **Fixed a latent bug in `apps/mcp-server/src/tools/queue/getPosition.ts`** (NOT in the plan). *Why:* once core types were real (not `any`), `tsc` flagged `case "checked_in":` in a `switch (appointment.status: AppointmentStatus)` — `"checked_in"` is not a valid status (the enum has no such member; only a `checked_in_at` timestamp column exists). The real queued state is `'waiting'`, which the switch did **not** handle (waiting patients fell to `default`). Changed `case "checked_in"` → `case "waiting"` — fixes the type AND gives waiting patients the correct "#N in queue" message. This is the fix doing its job: surfacing a bug the `any` had hidden.

## Issues Encountered & Resolutions
- **115 errors after the flip**, of which ~43 were TS2339/TS7006 cascades (`Property 'db'/'logError'/'executeRpc' does not exist`, `implicitly any`) downstream of the unresolved `BaseRepository` import. Resolved automatically once the extension sweep made `BaseRepository` resolve — confirmed the plan's prediction that these were cascades, not interop problems.
- **perl sweep corruption** of pre-`.js` lines → recovered via git checkout (Deviation #1).
- **One genuine latent type bug** surfaced (Deviation #2).

## Lesson candidates (for /learn)
1. A bulk "append `.js` to relative imports" sweep (sed/perl) must guard against specifiers already ending in `.js`/`.json`, or it corrupts them (`export * from './x.js'` → `export * js;`). Always scan for `export * js` / `.js.js` after, or restore-and-reapply from a clean commit.
2. Flipping a package to NodeNext is also a latent-bug detector: members behind previously-dropped (`any`) types become real, so `tsc` surfaces real bugs (here a `switch` on a phantom status). Budget for fixing a few of these, not just adding extensions.

## Next Steps
- [ ] Phase 3 (`doctor_search`) — the DEPENDENCY GATE now holds (`getClinicService()`/`getBookingService()` are real types).
- [ ] Commit (separable infra commit) — staged on `feat/showcase-ai-chatbot`, not yet committed.
