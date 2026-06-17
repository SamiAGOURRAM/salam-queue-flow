# Digital Medical Records Write-Side Plan

## Queue Flow Gap Closure Plan (2026-04-20)

### Phase A - Pause/Break Mode (Gap #2)
- [x] Add DB-backed queue break state and RPCs to start/end/read active break.
- [x] Add queue service/repository methods to manage break mode and optional schedule push-back.
- [x] Add queue UI controls to pause for 15 minutes, show countdown, and resume.
- [x] Block call-next / call-specific actions while break mode is active.

### Phase B - Urgent Walk-in Insertion (Gap #4)
- [x] Extend walk-in booking UI to request urgent insertion with target queue position.
- [x] Apply immediate post-book reorder override for urgent walk-ins.
- [x] Add focused test coverage for urgent insertion flow.

### Phase C - Doctor Prep + Manual Call Control (Gaps #5 and #6)
- [x] Add next-3 prep panel with upcoming patient context in live queue view.
- [x] Add call-specific patient action (out-of-order call) with scope and status guards.
- [x] Reuse resource assignment workflow for specific calls.
- [x] Add/extend tests for queue service and hook action propagation.

### Phase D - Early-Bird Promotion Confirmation (Gap #7)
- [x] Require explicit confirmation before early-bird gap promotion.
- [x] Preserve automatic waitlist fallback when no early-bird candidate is selected.
- [x] Add gap manager tests validating confirmation behavior.

### Phase E - Validation and Review
- [x] Run targeted queue unit/integration tests.
- [x] Run web build/type validation.
- [x] Append review notes and verification evidence.

### Review (Queue Flow Gap Closure)
- Summary:
- Added queue break mode end-to-end: new `queue_breaks` table + start/end/get RPCs, repository/service support, and live queue UI controls with countdown and resume.
- Added urgent walk-in insertion override in booking dialog with explicit position input and post-book reorder call.
- Added doctor prep panel (`next 3`) and out-of-order `Call Now` actions in both slotted and ordinal queue views, including resource assignment compatibility.
- Added explicit early-bird confirmation prompt in gap manager to prevent silent queue reshuffles.
- Validation:
- Applied migration locally: `20260412000000_add_queue_break_mode.sql` (and recorded version in `supabase_migrations.schema_migrations`).
- Queue tests: `pnpm --filter @queuemed/web exec vitest run src/services/queue/QueueService.test.ts src/services/queue/GapManagerService.test.ts src/hooks/useQueueService.integration.test.tsx src/components/clinic/BookAppointmentDialog.test.tsx src/pages/clinic/ClinicQueue.test.tsx` (53 passed).
- Build: `pnpm --filter @queuemed/web build` (passed).

## Audit
- [x] Validate plan assumptions against current codebase and identify discrepancies.

## Phase 1 - Infrastructure
- [x] Add react-to-print dependency.
- [x] Extend medical record models with write-side interfaces.
- [x] Implement write repository for appointment notes, diagnoses, prescriptions, lab results, and print metadata.
- [x] Implement write service facade and export from medical-records index.
- [x] Implement consultation hook for load/save orchestration.
- [x] Add medication autocomplete utility (localStorage-backed).
- [x] Add Moroccan lab panels constants utility.

## Phase 2 - Notes + Diagnoses UI
- [x] Create consultation panel tab container.
- [x] Create notes tab with per-section save.
- [x] Create diagnoses tab with per-section save.
- [x] Integrate consultation toggle/panel into queue manager.

## Phase 3 - Ordonnance + Print
- [x] Create ordonnance print layout component.
- [x] Create ordonnance tab with repeater, save, and print support.
- [x] Wire unprinted ordonnance reminder into queue manager.

## Phase 4 - Lab Results + i18n + Verification
- [x] Create lab results tab with Moroccan autocomplete.
- [x] Add consultation i18n keys in en/fr/ar locales.
- [x] Run typecheck/build and browser E2E tests.
- [x] Add implementation review notes.

## Review
- Audit alignment:
- Claude's plan matched schema expectations for appointments.reason_for_visit/notes and medical_record_diagnoses/prescriptions/lab_results write targets.
- Existing codebase already had doctor request/history i18n wiring, so only consultation-specific keys were added instead of reworking full doctor i18n.
- Queue context already uses appointments.patient_id (patients table ID), so write context can safely reuse currentPatient.patientId without auth->patient remapping.
- Claude's no-delete constraint was preserved: UI remove actions affect in-memory rows only; repository/service only insert/update.
- Verification:
- Typecheck: pnpm -C apps/web exec tsc --noEmit
- Build: pnpm -C apps/web build
- Browser E2E regression: pnpm -C apps/web test:e2e (2 passed)
- Follow-up completion (request 1 + 2):
- Added consultation browser E2E harness/spec to cover notes save, ordonnance save, print trigger, and stale revision conflict handling.
- Added optimistic concurrency checks using appointment revision tokens across notes/diagnoses/prescriptions/lab saves.
- Stabilized pending-print callback behavior to prevent repeated false resets during normal re-renders.
- Follow-up verification:
- Browser E2E (new): pnpm -C apps/web test:e2e -- e2e/consultation-write-flow.spec.ts (1 passed)
- Audit remediation (consultation write feature):
- Replaced hardcoded print labels with consultation i18n keys and localized document title generation.
- Replaced hardcoded route/frequency/interpretation suggestions with locale-driven option arrays (en/fr/ar).
- Reworked per-item loop persistence to section-level batch upserts (diagnoses, prescriptions, lab results) to avoid partial saves when one row fails.
- Added medication history retention window (180 days) in localStorage-backed autocomplete entries.
- Audit remediation verification:
- Browser E2E: pnpm -C apps/web test:e2e -- e2e/consultation-write-flow.spec.ts (1 passed)
- Nice-to-fix completion (remaining):
- Replaced consultation validation/conflict text coupling with standardized consultation error codes and localized UI mapping (en/fr/ar).
- Expanded Moroccan lab panel dataset from seed set to broader common panels and increased suggestion windows.

## Rich Medical Report Editor Plan

### Phase 1 - Schema and Dependencies
- [x] Add migration for templates, procedure reports, report images, RLS policies, and storage bucket policies.
- [x] Seed baseline system templates for report, consultation note, and prescription combo use cases.
- [x] Install rich editor/document dependencies (Tiptap ecosystem, mammoth, image compression, docx).

### Phase 2 - Services and Data Layer
- [x] Extend medical record models with template/report/image contracts.
- [x] Implement template repository/service search/create/usage and variable interpolation helpers.
- [x] Implement procedure report repository/service and image upload metadata flow.
- [x] Add report/template hooks for editor integration.

### Phase 3 - UI Integration
- [x] Build reusable medical editor with toolbar, slash-template insertion, template search, save-template dialog, image upload, and DOCX import.
- [x] Replace consultation notes textarea with rich editor integration while preserving existing save semantics.
- [x] Add procedure report consultation tab with draft/finalize lifecycle.
- [x] Add ordonnance prescription preset insertion dialog and template usage tracking.

### Phase 4 - i18n and Verification
- [x] Add new consultation/report/preset i18n keys in en/fr/ar.
- [x] Update consultation E2E flow for rich editor interactions.
- [x] Resolve runtime React hook conflict for tiptap by deduping React in Vite config.
- [x] Validate with typecheck, build, and E2E suite.

## Review (Rich Medical Report Editor)
- Architecture alignment:
- Added migration-scoped tables (`medical_templates`, `medical_procedure_reports`, `medical_report_images`) with clinic-staff RLS and patient visibility guardrails.
- Preserved existing consultation write architecture (repository/service/hook/UI) and integrated new editor/report capabilities without regressing existing section save flows.
- Known scope tradeoff:
- Rich notes editor currently persists plain text into existing appointment notes field to remain compatible with existing read paths.
- Verification:
- Typecheck: `pnpm -C apps/web exec tsc --noEmit`
- Build: `pnpm -C apps/web build`
- Consultation E2E: `pnpm -C apps/web test:e2e -- e2e/consultation-write-flow.spec.ts` (1 passed)
- Sharing E2E regressions: `pnpm -C apps/web test:e2e -- e2e/medical-sharing-mock.spec.ts e2e/patient-medical-sharing-inapp.spec.ts` (2 passed)

## Rich Editor Polish Follow-up

### Phase 5 - Localization and Report E2E Coverage
- [x] Localize remaining hardcoded rich-editor labels/dialog strings (toolbar, slash menu, template dialogs, combo dialog).
- [x] Localize rich-editor toast/error fallbacks and procedure report fallback messages.
- [x] Add deterministic report/template mocks to consultation E2E harness.
- [x] Add dedicated consultation report E2E scenario (template insert, image upload, draft save, finalize).
- [x] Run verification commands for typecheck, build, and consultation E2E coverage.

## Review (Rich Editor Polish Follow-up)
- Summary:
- Replaced remaining hardcoded editor/report user-facing strings with consultation i18n keys in `en`, `fr`, and `ar` locale bundles.
- Added hidden editor file-input test IDs and extended the consultation E2E harness with in-memory template/report service mocks for deterministic report-flow tests.
- Added new browser test `e2e/consultation-report-flow.spec.ts` covering report-tab workflow end to end.
- Verification:
- Typecheck: `pnpm -C apps/web exec tsc --noEmit`
- Build: `pnpm -C apps/web build`
- Consultation E2E: `pnpm -C apps/web test:e2e -- e2e/consultation-write-flow.spec.ts e2e/consultation-report-flow.spec.ts` (2 passed)

## Optional Follow-up Completion

### Phase 6 - DOCX Success Path and Arabic Copy Polish
- [x] Add stable DOCX-import success-path coverage in consultation report E2E using an in-memory valid `.docx` fixture.
- [x] Refine Arabic consultation/editor/report wording for newly added keys (remove mixed FR/EN labels and improve consistency).
- [x] Re-run targeted verification after updates.

## Review (Optional Follow-up Completion)
- Summary:
- Extended `consultation-report-flow` with a deterministic DOCX import check by generating a valid buffer through the `docx` package, then asserting imported content appears in the report editor.
- Polished Arabic values under `medicalSharing.doctor.consultation` for tabs, actions, ordonnance/lab options, report/editor copy, and toast messages.
- Verification:
- Typecheck: `pnpm -C apps/web exec tsc --noEmit`
- Consultation E2E: `pnpm -C apps/web test:e2e -- e2e/consultation-report-flow.spec.ts` (1 passed)

## Rich Editor Audit Hardening

### Phase 7 - Type Safety and Consistency Fixes
- [x] Replace `RichContent = unknown` with typed Tiptap JSON content model for report/editor paths.
- [x] Remove unsafe `as never` image command cast and introduce typed image attributes.
- [x] Replace native HTML select in template scope dialog with design-system select.
- [x] Remove hardcoded date locale and derive template date locale from active i18n language.
- [x] Refactor template specialty filtering to avoid fragile inline SQL OR interpolation.
- [x] Remove unnecessary singleton service memoization in `useTemplates`.
- [x] Add debounced editor update support and enable it for procedure report editing.
- [x] Add explicit warning log when signed URL creation fails in report image repository.
- [x] Run verification (typecheck + targeted E2E).

## Review (Rich Editor Audit Hardening)
- Summary:
- Strengthened editor/report type safety by switching rich-content models from `unknown` to JSONContent-backed types, plus typed prescription combo content.
- Removed unsafe image-command casting in the editor and replaced it with typed image node attributes; added editor schema support for persisted `storagePath` via `data-storage-path`.
- Aligned template scope control with design system by replacing native `<select>` with shadcn Select.
- Made template variable date generation locale-aware by passing active i18n language into context construction.
- Replaced fragile specialty OR string interpolation in template search with explicit specialty + generic query branches and deterministic deduping.
- Removed unnecessary singleton memoization in `useTemplates` and added warning logs for signed URL failures.
- Added configurable `onChange` debouncing in the shared medical editor and enabled it for procedure report content updates.
- Verification:
- Typecheck: `pnpm -C apps/web exec tsc --noEmit`
- Consultation E2E: `pnpm -C apps/web test:e2e -- e2e/consultation-write-flow.spec.ts e2e/consultation-report-flow.spec.ts` (2 passed)

## Medical Sharing Runtime Validation

### Phase 8 - DB Migration and Runtime Proof
- [x] Apply migration dependency chain in local Supabase runtime (`20260407000007` then `20260407000008`).
- [x] Fix migration compatibility issue in `20260407000007` full-text index expression for PG17 immutability constraints.
- [x] Execute DB-backed medical sharing verification suite against local runtime.
- [x] Record applied migration versions in `supabase_migrations.schema_migrations` for local consistency.

## Review (Medical Sharing Runtime Validation)
- Summary:
- Applied runtime schema updates required for scope-aware grant requests and shared procedure-report/image visibility checks.
- Patched `20260407000007_rich_medical_report_editor.sql` search index expression to avoid stable-function usage (`array_to_string`) in a GIN index expression and switched to immutable `tsvector` composition.
- Successfully applied `20260407000008_extend_medical_sharing_scope_and_reports.sql` after dependency migration was in place.
- Verification:
- DB-backed suite: `Get-Content -Raw supabase/snippets/verify_medical_sharing_comprehensive.sql | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (all checks passed; transaction rolled back)
- Migration bookkeeping: inserted versions `20260407000007` and `20260407000008` into `supabase_migrations.schema_migrations`

## Medical Sharing Hardening Follow-up

### Phase 9 - Scope/UI/Policy Coverage and Observability
- [x] Add deterministic E2E assertions for explicit scope selection propagation in medical sharing flow.
- [x] Add procedure-report image fixture/assertions in sharing harness/spec.
- [x] Extend SQL comprehensive verification with scope fallback/full-history regression checks.
- [x] Extend SQL comprehensive verification with patient image metadata/storage policy coverage checks.
- [x] Add lightweight observability logs for request scope resolution and unsigned shared image counts.
- [x] Re-run validation (typecheck + targeted E2E + DB comprehensive suite).

## Review (Medical Sharing Hardening Follow-up)
- Summary:
- Added scope radio test IDs and updated medical-sharing E2E to assert full-history selection is passed through request flow.
- Extended medical-sharing harness with requested-scope telemetry and a visible procedure-report image fixture; E2E now verifies report image rendering.
- Added DB regression test block for `request_medical_record_access` scope normalization (`NULL` scope defaults to `specific_appointments`, explicit `full_history` remains `full_history`) and patient image access-policy visibility checks across `medical_report_images` and `storage.objects`.
- Added observability logs in sharing repository for resolved request scope and signed-URL coverage (total vs unsigned image counts).
- Verification:
- Typecheck: `pnpm -C apps/web exec tsc -p tsconfig.json --noEmit` (`TSC_OK`)
- Sharing E2E: `pnpm -C apps/web test:e2e -- e2e/medical-sharing-mock.spec.ts e2e/patient-medical-sharing-inapp.spec.ts` (2 passed)
- DB suite: `Get-Content -Raw supabase/snippets/verify_medical_sharing_comprehensive.sql | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (all checks passed; transaction rolled back)

## Standalone Template Management UX/UI

### Phase 10 - Independent Doctor Template Workspace
- [x] Expose template update/delete operations in template service and hooks.
- [x] Build standalone clinic templates page with list/search/filter, detail view, create modal, inline edit flow, and delete confirmation.
- [x] Support all template types in one workspace (consultation notes, procedure reports, prescription presets, report sections).
- [x] Add dedicated clinic route and sidebar navigation entry for templates, independent of appointment screens.
- [x] Add editor toolbar toggles for hiding nested template actions in management contexts.
- [x] Run compile verification.

## Review (Standalone Template Management UX/UI)
- Summary:
- Added full template lifecycle support through `TemplateService` and `useTemplates` so UI can create, view, edit, and delete templates from one workflow.
- Implemented a new standalone doctor-facing page (`/clinic/templates`) with a two-pane UX: searchable/filterable template list and rich detail/editor panel.
- Integrated content-aware editing: rich text editing for note/report templates and structured medication-row editing for prescription presets.
- Added route and sidebar access in clinic shell so template management is no longer tied to appointment consultation tabs.
- Made `MedicalEditor`/`EditorToolbar` configurable to hide nested template dialogs when embedded in dedicated template-management contexts.
- Verification:
- Typecheck: `pnpm -C apps/web exec tsc -p tsconfig.json --noEmit` (`TSC_OK`)

## Standalone Template Hardening Follow-up

### Phase 11 - Templates E2E + Locale Parity
- [x] Build deterministic templates E2E harness route with in-memory template service monkey-patching.
- [x] Add focused Playwright coverage for templates filtering, create, edit, and delete flow.
- [x] Localize standalone templates workspace copy in `en`, `fr`, and `ar` bundles.
- [x] Add stable test IDs and E2E override props for robust harness-driven assertions.
- [x] Re-run verification (typecheck + focused templates E2E).

## Review (Standalone Template Hardening Follow-up)
- Summary:
- Added `TemplatesE2EHarness` and `/e2e/templates` route to run template management flows against a deterministic in-memory service layer, independent of backend state.
- Added browser test `e2e/templates-workspace.spec.ts` that validates scope filtering, search behavior, template creation, inline editing, and soft-delete visibility.
- Migrated the standalone templates workspace UI copy to i18n keys and added corresponding translations in `en`, `fr`, and `ar` locale files.
- Verification:
- Typecheck: `pnpm -C apps/web exec tsc -p tsconfig.json --noEmit` (`TSC_OK`)
- Templates E2E: `pnpm -C apps/web test:e2e -- e2e/templates-workspace.spec.ts` (1 passed)

## Reliability + Localization Quality Pass

### Phase 12 - Regression Proof and Arabic Copy Polish
- [x] Re-run complete Playwright browser suite after templates hardening.
- [x] Re-run web TypeScript compile verification after locale adjustments.
- [x] Polish Arabic templates workspace wording for clarity and consistency.

## Review (Reliability + Localization Quality Pass)
- Summary:
- Re-ran the full browser E2E suite to validate that templates harness updates did not mask regressions in other flows.
- Re-verified TypeScript compilation after locale updates.
- Refined Arabic templates workspace copy (`updated`/`deleted` toast phrasing and dialog wording) to be more natural and consistent.
- Verification:
- Typecheck: `pnpm -C apps/web exec tsc -p tsconfig.json --noEmit` (`TSC_OK`)
- Full E2E suite: `pnpm -C apps/web test:e2e` (5 passed)

## Real Backend Templates Smoke Lane

### Phase 13 - Non-mocked Backend Verification
- [x] Add a backend-connected templates integration test covering create, search, update, usage tracking, soft delete, and scope fallback behavior.
- [x] Add a local smoke runner script with pre/post cleanup for deterministic reruns.
- [x] Add a package script for one-command smoke execution.
- [x] Fix seed data to match current schema constraints (`clinics.queue_mode` valid values).
- [x] Re-run smoke lane and compile checks after fixes.

## Review (Real Backend Templates Smoke Lane)
- Summary:
- Added a real-backend integration smoke test for templates flow in `apps/web/src/integration/templates-flow.integration.test.ts`.
- Added deterministic local runner and SQL cleanup orchestration in `apps/web/scripts/run-templates-flow-smoke.mjs`.

## Public UI Audit Remediation

### Phase 14 - Localization + Stale State Fixes
- [x] Localize remaining hardcoded public-page strings in Welcome, Landing, ClinicDirectory, ClinicDetailView, and PublicQueueStatus.
- [x] Make PublicQueueStatus date/time formatting locale-aware based on active i18n language.
- [x] Replace dead/no-op landing interactions (`#` links, inert CTAs) with valid navigation/actions.
- [x] Replace static public metrics placeholders with backend-driven values where available.
- [x] Run verification (web typecheck + build) and capture review notes.

## Review (Public UI Audit Remediation)
- Summary:
- Localized remaining hardcoded public strings in `Welcome`, `PremiumLanding`, `ClinicDirectory`, `ClinicDetailView`, and `PublicQueueStatus`.
- Added full `publicQueueStatus` translation namespace and wired locale-aware date/time formatting for queue status rendering.
- Replaced dead/no-op landing interactions by wiring location-focus action, learn-more navigation, and valid footer destinations.
- Replaced stale landing and welcome placeholder metrics with backend-driven clinic/rating aggregates.
- Added missing EN/FR translation coverage for new clinic labels, day names, spotlight copy, and welcome-page content blocks.
- Verification:
- Typecheck: `pnpm -C apps/web exec tsc --noEmit` (`TSC_OK`)
- Build: `pnpm -C apps/web build` (passed)

## Queue Audit Follow-up (Points #8 #9 #10)

### Phase F - Explicit Hybrid Mode (Point #8)
- [x] Add explicit `hybrid` queue mode in shared queue contracts and strategy factory.
- [x] Implement hybrid scheduling/ordering semantics for mixed slotted + overflow patients.
- [x] Add forward Supabase migration to re-enable `hybrid` mode in constraints and effective-mode RPCs.
- [x] Update booking RPC validation logic to support hybrid slot-optional booking safely.

### Phase G - Doctor Override Validation (Point #9)
- [x] Confirm existing doctor mode override behavior against current code and DB functions.
- [x] Close any compatibility gaps so doctor overrides accept `hybrid` mode too.

### Phase H - Mode Preview/Simulator (Point #10)
- [x] Add a deterministic queue mode preview simulator service (dry-run only).
- [x] Integrate simulator into clinic queue settings UI for same-day impact preview.
- [x] Add targeted tests for simulator ordering deltas and safety.

### Phase I - Verification and Review
- [x] Run focused unit tests for strategy/booking/settings updates.
- [x] Run web typecheck/build validation.
- [x] Append review notes with evidence and known tradeoffs.

## Review (Queue Audit Follow-up #8 #9 #10)
- Summary:
- Added explicit hybrid-mode support across queue strategy, booking flow, clinic settings, shared core contracts, MCP tool contracts, and Supabase queue-mode functions.
- Added doctor-override compatibility for hybrid queue mode in app-layer parsing/validation and DB-side effective-mode logic.
- Added deterministic queue mode transition simulator (`QueueModePreviewService`) and integrated same-day preview UI in clinic settings.
- Verification:
- Focused tests: `pnpm --filter @queuemed/web exec vitest run src/services/queue/strategies/QueueStrategy.test.ts src/services/queue/QueueModePreviewService.test.ts src/components/clinic/BookAppointmentDialog.test.tsx src/components/booking/BookingFlow.test.tsx src/pages/clinic/ClinicSettings.test.tsx` (5 files, 22 tests passed)
- Web strict typecheck: `pnpm --filter @queuemed/web exec tsc --noEmit -p tsconfig.app.json` (passed)
- Core strict typecheck: `pnpm --filter @queuemed/core exec tsc --noEmit` (passed)
- MCP strict typecheck: `pnpm --filter @queuemed/mcp-server exec tsc --noEmit` (passed)
- Web build: `pnpm --filter @queuemed/web build` (passed)
- Local DB migration apply: `Get-Content -Raw supabase/migrations/20260412000001_add_explicit_hybrid_mode_support.sql | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (applied)
- Local migration registration: `docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260412000001') ON CONFLICT (version) DO NOTHING;"` (inserted)
- Known tradeoffs:
- Fixed an accidental non-code header in `apps/web/src/integrations/supabase/types.ts` (Docker pull logs prepended to generated types) before final typecheck.
- Added `test:smoke:templates-local` script in `apps/web/package.json`.
- First smoke run exposed a schema mismatch in seeded clinic data (`queue_mode='hybrid'` violated `clinics_queue_mode_check`); updated seed to `queue_mode='fluid'`.
- Verification:
- Smoke lane: `pnpm -C apps/web test:smoke:templates-local` (1 passed)
- Typecheck: `pnpm -C apps/web exec tsc -p tsconfig.json --noEmit` (`TSC_OK`)

## Queue Notifications Foundation

### Phase 14 - Event-Driven Routing + Channel Activation
- [x] Add a queue notification decision engine to map queue domain events into notification intents.
- [x] Add channel routing service to resolve patient contact channel/language from profile and walk-in fallback paths.
- [x] Replace queue handler TODO stubs with real notification dispatch for queue events (added/called/absent/position/status).
- [x] Add notification template resolver with clinic/system template lookup and language fallback.
- [x] Activate WhatsApp provider path in notification service and preserve template/provider metadata updates.
- [x] Add missing `send-sms` and `send-whatsapp` Supabase edge functions.
- [x] Run web build verification after integration.

## Review (Queue Notifications Foundation)
- Summary:
- Added `NotificationDecisionEngine` to centralize notification trigger rules for queue domain events.
- Added `ChannelRouter` and `WhatsAppChannel`, then wired queue event handlers to route and send notifications based on live patient contact preferences.
- Replaced placeholder queue event handler blocks with production dispatch flow and added support for position/status events.
- Added `NotificationTemplateService` and integrated it into `NotificationService` for clinic/system template fallback and language-aware rendering.
- Implemented `supabase/functions/send-sms` and `supabase/functions/send-whatsapp` for Twilio-backed outbound delivery.
- Verification:
- Build: `pnpm -C apps/web build` (passed)

## Queue Grace Expiry Automation

### Phase 15 - Auto No-Show Detector + Gap Reflow
- [x] Add queue repository helpers for grace-expiry lookup and absent auto-cancel resolution.
- [x] Add queue service auto no-show transition for grace-expired absent appointments.
- [x] Add no-show detector service with timer + periodic sweep for clinic dashboard context.
- [x] Wire detector lifecycle into enhanced queue manager initialization.
- [x] Add unit coverage for queue service auto no-show transition.
- [x] Run queue test and build verification.

## Review (Queue Grace Expiry Automation)
- Summary:
- Added `getPendingGraceExpiries` and `markAbsentPatientAutoCancelled` in `QueueRepository` to support deterministic grace expiration processing.
- Added `autoMarkNoShow` in `QueueService` to safely transition eligible absent appointments to `NO_SHOW` and emit status change events.
- Added `NoShowDetectorService` to schedule per-appointment grace timers, run periodic expiry sweeps, and trigger gap handling after auto no-show transitions.
- Scoped detector initialization to `EnhancedQueueManager` so automation runs in clinic queue context and cleans up on unmount.
- Added `QueueService` tests for success and idempotent skip paths of auto no-show transitions.
- Verification:
- Queue tests: `pnpm --filter web exec vitest run src/services/queue/QueueService.test.ts` (27 passed)
- Build: `pnpm --filter web build` (passed)

## Queue Gap Fill Completion

### Phase 16 - Detector Test Coverage + Waitlist Promotion Internals
- [x] Add focused `NoShowDetectorService` tests for timer scheduling, timer cancellation by return/status events, and periodic grace-expiry sweep handling.
- [x] Add waitlist repository lookup helper for direct promotion (`getWaitlistEntryById`).
- [x] Replace `WaitlistService.promoteToAppointment` placeholder with full implementation (validate entry, create appointment, update waitlist status).
- [x] Add focused `WaitlistService` unit tests for success path and validation/business-rule failures.
- [x] Re-run queue test suite segments and production build verification.

## Review (Queue Gap Fill Completion)
- Summary:
- Added dedicated `NoShowDetectorService` unit coverage validating grace timer behavior and periodic expiry processing in isolation.
- Implemented `WaitlistRepository.getWaitlistEntryById` and normalized legacy `booked` status mapping to `promoted` for compatibility.
- Implemented real waitlist promotion flow in `WaitlistService`: fetch and validate waitlist entry, normalize timing, create appointment through `QueueService`, and mark waitlist status as `promoted`.
- Added `WaitlistService` tests for successful promotion plus `not found`, missing patient, and invalid-status guardrails.
- Verification:
- Detector + waitlist tests: `pnpm --filter @queuemed/web test -- src/services/queue/NoShowDetectorService.test.ts src/services/queue/WaitlistService.test.ts` (8 passed)
- Queue regression tests: `pnpm --filter @queuemed/web test -- src/services/queue/QueueService.test.ts` (27 passed)
- Build: `pnpm --filter @queuemed/web build` (passed)

## Queue Gap Fill Follow-up

### Phase 17 - End-to-End Flow Test + Promotion Metadata Flags
- [x] Add an integration-style queue test that exercises no-show detection through gap manager waitlist promotion in one scenario.
- [x] Extend queue DTO/update plumbing so `isGapFiller` and `promotedFromWaitlist` metadata are persisted.
- [x] Ensure waitlist promotion sets explicit appointment metadata flags during appointment creation.
- [x] Re-run targeted queue tests, queue regression tests, and web build verification.

## Review (Queue Gap Fill Follow-up)
- Summary:
- Added `NoShowGapFlow.test.ts` to validate the no-show -> gap detection -> waitlist promotion chain in a single service-level flow.
- Extended queue DTOs and repository update mapping so `priorityScore`, `isGapFiller`, and `promotedFromWaitlist` persist correctly when updating entries.
- Updated `createQueueEntryViaRpc` to apply non-RPC queue metadata flags immediately after creation via repository update.
- Updated `WaitlistService.promoteToAppointment` to set `isGapFiller: true` and `promotedFromWaitlist: true` on created appointments.
- Verification:
- Targeted flow + waitlist + detector tests: `pnpm --filter @queuemed/web test -- src/services/queue/WaitlistService.test.ts src/services/queue/NoShowGapFlow.test.ts src/services/queue/NoShowDetectorService.test.ts` (9 passed)
- Queue regression tests: `pnpm --filter @queuemed/web test -- src/services/queue/QueueService.test.ts` (27 passed)
- Build: `pnpm --filter @queuemed/web build` (passed)

## Queue Audit Remediation

### Phase 18 - Critical + High Priority Queue Fixes
- [x] Persist grace period deadline in absent patient records so no-show detector polling can detect expiries.
- [x] Preserve exact absent/grace notification types in DB contract (migration + type mapping).
- [x] Add per-notification isolation in queue event handler loop so one failed send does not block others.
- [x] Replace late-arrival strategy placeholders with concrete slotted/fluid reinsertion decisions.
- [x] Add focused tests for queue strategy late-arrival behavior and notification loop failure isolation.
- [x] Re-run targeted queue suites and web build verification.

## Review (Queue Audit Remediation)
- Summary:
- Updated `QueueService.markPatientAbsent` + `QueueRepository.createAbsentPatient` to persist `grace_period_ends_at` using the same computed deadline emitted in event payloads.
- Added migration `20260407000009_add_absence_notification_enum_values.sql` to extend `public.notification_type` with `patient_absent` and `grace_period_ending`.
- Updated Supabase-generated enum typing and removed lossy fallback mapping in `NotificationService.toDbNotificationType`.
- Hardened `QueueEventHandlers` notification loop with per-instruction try/catch to prevent cascade failures.
- Implemented concrete late-arrival actions in `SlottedQueueStrategy` and `FluidQueueStrategy`, and removed unsafe waitlist cast.
- Added new tests:
- `QueueStrategy.test.ts` for late-arrival action decisions.
- `QueueEventHandlers.test.ts` for send-loop fault isolation.
- Strengthened `QueueService.test.ts` assertions for `checkedInAt` update payload and absent-record grace deadline propagation.
- Verification:
- Targeted tests: `pnpm --filter @queuemed/web test -- src/services/queue/QueueService.test.ts src/services/queue/strategies/QueueStrategy.test.ts src/services/queue/handlers/QueueEventHandlers.test.ts src/services/queue/NoShowDetectorService.test.ts src/services/queue/NoShowGapFlow.test.ts` (37 passed)
- Build: `pnpm --filter @queuemed/web build` (passed)

## Queue Audit Remediation Follow-up

### Phase 19 - Concurrency + Throughput Hardening
- [x] Prevent waitlist double-promotion by atomically claiming promotion before appointment creation.
- [x] Add waitlist promotion conflict-path unit coverage for concurrent claim failure.
- [x] Replace sequential queue notification sends with parallel, isolated delivery via `Promise.allSettled`.
- [x] Replace fragile gap fill time extraction (`toISOString().substring`) with explicit HH:mm formatter.
- [x] Make absent auto-cancel update race-aware (detect and log no-op on concurrent resolution).
- [x] Add focused GapManager tests for early-bird scheduling update and waitlist fallback promotion.
- [x] Re-run expanded queue test batch and build verification.

## Review (Queue Audit Remediation Follow-up)
- Summary:
- Added `WaitlistRepository.claimForPromotion` and updated `WaitlistService.promoteToAppointment` to claim promotion before creating an appointment, preventing duplicate creation under concurrent triggers.
- Added rollback-on-create-failure path in `WaitlistService` to revert claimed waitlist status to prior state when appointment creation fails.
- Updated queue event handlers to execute notification instructions concurrently with `Promise.allSettled`, while keeping per-instruction error logging and isolation.
- Updated `GapManagerService` to format scheduled time with an explicit HH:mm helper instead of timezone-fragile ISO substring extraction.
- Updated `QueueRepository.markAbsentPatientAutoCancelled` to return whether an active absent record was actually updated and to log concurrent/no-op resolution outcomes.
- Added/updated tests:
- `WaitlistService.test.ts` includes concurrent-claim conflict coverage.
- `GapManagerService.test.ts` validates early-bird update payload (including HH:mm formatting) and waitlist fallback promotion.
- Verification:
- Expanded targeted tests: `pnpm --filter @queuemed/web test -- src/services/queue/WaitlistService.test.ts src/services/queue/handlers/QueueEventHandlers.test.ts src/services/queue/strategies/QueueStrategy.test.ts src/services/queue/GapManagerService.test.ts src/services/queue/QueueService.test.ts src/services/queue/NoShowDetectorService.test.ts src/services/queue/NoShowGapFlow.test.ts` (44 passed)
- Build: `pnpm --filter @queuemed/web build` (passed)

## Queue Events and Proactive Alerts

### Phase 20 - Missing Event Types + Turn-Approaching Flow
- [x] Add missing queue event types from plan (`TURN_APPROACHING`, `SLOT_FREED`, `GRACE_PERIOD_EXPIRED`, `WAITLIST_OFFER_*`).
- [x] Add queue event model/contracts for new event categories and a factory for `TURN_APPROACHING` emission.
- [x] Wire queue handlers to publish `TURN_APPROACHING` when a patient crosses from position >2 to <=2.
- [x] Subscribe handlers for `TURN_APPROACHING` and route notification delivery through existing notification pipeline.
- [x] Update notification decision logic to emit `ALMOST_YOUR_TURN` from `TURN_APPROACHING` and prevent duplicate near-front alerts from raw position changes.
- [x] Add focused notification decision + queue handler tests for proactive event behavior.
- [x] Re-run targeted queue/notification tests and build verification.

## Review (Queue Events and Proactive Alerts)
- Summary:
- Extended `QueueEventType` with planned missing event names and added strongly typed event contracts for proactive/gap/waitlist offer events.
- Added `QueueEventFactory.createTurnApproachingEvent` for standardized event emission.
- Updated `QueueEventHandlers` to publish `TURN_APPROACHING` on threshold crossing and to handle the new event type with existing notification dispatch.
- Updated `NotificationDecisionEngine` to treat `TURN_APPROACHING` as the source of `ALMOST_YOUR_TURN` notifications and suppress duplicate near-front alerts from `QUEUE_POSITION_CHANGED`.
- Added tests:
- `NotificationDecisionEngine.test.ts` validates position-update vs turn-approaching instruction rules.
- `QueueEventHandlers.test.ts` validates threshold crossing emits `TURN_APPROACHING` and keeps loop resilience behavior.
- Verification:
- Targeted tests: `pnpm --filter @queuemed/web test -- src/services/notification/NotificationDecisionEngine.test.ts src/services/queue/handlers/QueueEventHandlers.test.ts src/services/queue/QueueService.test.ts src/services/queue/NoShowDetectorService.test.ts src/services/queue/NoShowGapFlow.test.ts` (37 passed)
- Build: `pnpm --filter @queuemed/web build` (passed)

## Notification Reliability Hardening

### Phase 21 - Retry Logic + Rate Limiting
- [x] Implement retry/backoff handling for SMS and WhatsApp delivery using existing `notifications.retry_count` / `max_retries` fields.
- [x] Persist retry progression and final failure status on each attempt path.
- [x] Add in-process channel rate limiting guard to throttle rapid SMS/WhatsApp bursts.
- [x] Add focused `NotificationService` tests for retry success, retry exhaustion failure, and rate-limit behavior.
- [x] Re-run targeted notification + queue handler tests, queue regression, and build verification.

## Review (Notification Reliability Hardening)
- Summary:
- Refactored `NotificationService` SMS/WhatsApp paths to use shared delivery workflow with retries and backoff.
- Added persisted retry state transitions (`pending` with incremented `retry_count`) and final `failed` status when max retries are exhausted.
- Added `enforceRateLimit` for SMS/WhatsApp with recipient + channel window throttling to reduce burst pressure on providers.
- Added `NotificationService.test.ts` covering transient retry success, retry exhaustion failure, and rapid-send rate limiting behavior.
- Verification:
- Targeted tests: `pnpm --filter @queuemed/web test -- src/services/notification/NotificationService.test.ts src/services/notification/NotificationDecisionEngine.test.ts src/services/queue/handlers/QueueEventHandlers.test.ts` (8 passed)
- Queue regression tests: `pnpm --filter @queuemed/web test -- src/services/queue/QueueService.test.ts src/services/queue/NoShowDetectorService.test.ts src/services/queue/NoShowGapFlow.test.ts` (32 passed)
- Build: `pnpm --filter @queuemed/web build` (passed)

## Public Queue Status Access

### Phase 22 - Tokenized Public Queue Status Page
- [x] Add DB migration for `appointments.queue_status_token`, unique index, token-generation RPC, and public queue-status RPC.
- [x] Extend Supabase TS types with `queue_status_token` field and new RPC signatures.
- [x] Add queue repository/service methods to generate tokens and resolve public queue status by token.
- [x] Add public route `/queue-status/:token` and dedicated public status page with polling refresh.
- [x] Add patient dashboard action for active appointments to generate and copy public queue status links.
- [x] Run targeted queue service tests and production build verification.

## Review (Public Queue Status Access)
- Summary:
- Added DB support for public queue sharing via `appointments.queue_status_token`, with authenticated token generation RPC (`generate_queue_status_token`) and anonymous-safe queue-status lookup RPC (`get_public_queue_status`).
- Extended frontend data layer (`QueueRepository`, `QueueService`, Supabase TS contracts) with token generation and token-based queue-status retrieval methods.
- Added public route `/queue-status/:token` and new `PublicQueueStatus` page with polling refresh and status/time/date display.
- Added a patient dashboard action for active appointments to generate and copy queue-status links.
- Verification:
- Targeted tests: `pnpm --filter @queuemed/web test -- src/services/queue/QueueService.test.ts` (31 passed)
- Build: `pnpm --filter @queuemed/web build` (passed)

## Queue Grace Countdown UX Follow-up

### Phase 23 - Local Migration Smoke + No-Show Countdown Hooks
- [x] Apply migration `20260407000010_add_public_queue_status_tokens.sql` to local Supabase runtime and record migration version.
- [x] Run a rollback-safe DB smoke scenario that validates owner-only token generation plus anon public status lookup.
- [x] Add `useGracePeriodTimer` hook for reusable grace countdown timing/urgency state.
- [x] Add `useNoShowDetection` hook to derive per-appointment grace countdown state for absent patients.
- [x] Wire absent-tab grace countdown badges into `EnhancedQueueManager` and include expiring/expired summary hints.
- [x] Add focused hook utility tests and re-run web build verification.

## Review (Queue Grace Countdown UX Follow-up)
- Summary:
- Applied local migration `20260407000010` directly to the Supabase Postgres container and inserted the version into `supabase_migrations.schema_migrations`.
- Verified the public token flow with a transaction-scoped smoke fixture: unauthorized generation blocked, owner generation succeeded, anon token lookup returned matching appointment payload, and all fixture data rolled back.
- Added `useGracePeriodTimer` for interval-driven countdown snapshots (`normal`/`expiring`/`expired`) plus shared formatting helpers.
- Added `useNoShowDetection` to compute grace deadlines from `markedAbsentAt + gracePeriodMinutes` and expose per-appointment countdown lookups.
- Updated absent patient cards in `EnhancedQueueManager` to show live grace badges and added absent-tab summary text for expiring/expired counts.
- Verification:
- Hook tests: `pnpm --filter @queuemed/web test -- src/hooks/useGracePeriodTimer.test.ts` (6 passed)
- Build: `pnpm --filter @queuemed/web build` (passed)

## Final Audit Gap Closure

### Phase 24 - Manual Move + Multi-View Grace + Email/Push Delivery
- [x] Implement `ManualOverridesService.manualMove` with direct queue-position move and mode-aware fallback rebalancing when trigger recalculation overrides the direct move.
- [x] Add grace countdown badge support to `SlottedQueueView` and `OrdinalQueueList`, and wire countdown maps from `EnhancedQueueManager` into both queue renderers.
- [x] Replace `NotificationService` email/push placeholder paths with delivery-through-edge-function flows using shared retry/error persistence.
- [x] Add Supabase edge functions `send-email` (Resend API bridge) and `send-push` (Expo push bridge), and wire OTP email delivery path in `deliver-record-access-otp`.
- [x] Add/extend targeted tests for manual move and notification channels, then run focused tests and web production build.

## Review (Final Audit Gap Closure)
- Summary:
- `ManualOverridesService.manualMove` now performs deterministic direct position updates and falls back to queue-mode-specific rebalancing (priority score for fluid, scheduled-time interpolation for slotted) when direct writes are overridden.
- Queue UI now accepts no-show countdown maps in both schedule renderers; slotted timeline and ordinal queue rows can surface grace-expiring/expired badges instead of only the absent tab.
- Notification delivery now uses real send attempts for email and push via edge functions (`send-email`, `send-push`) with persisted retry counters and terminal `failed` states like SMS/WhatsApp.
- Medical-record OTP delivery now uses the same `send-email` function when delivery channel is email.
- Added `ManualOverridesService.test.ts` and expanded `NotificationService.test.ts` coverage for email/push success paths.
- Verification:
- Targeted tests: `pnpm --filter web test -- src/services/queue/ManualOverridesService.test.ts src/services/notification/NotificationService.test.ts src/hooks/useGracePeriodTimer.test.ts` (13 passed)
- Build: `pnpm --filter web build` (passed)

## Medication Catalog Persistence

### Phase 25 - DB-Backed Ordonnance Medication Suggestions
- [x] Add write-repository medication catalog read method sourced from saved clinic prescriptions.
- [x] Expose medication catalog read API through medical write service.
- [x] Add `useMedicationCatalog` hook for loading and refreshing DB-backed medication suggestions.
- [x] Merge catalog suggestions into ordonnance medication datalist alongside local history/current-row values.
- [x] Refresh catalog suggestions after ordonnance save so newly saved meds are immediately reusable.
- [x] Re-run typecheck and focused ordonnance E2E verification.

## Review (Medication Catalog Persistence)
- Summary:
- Implemented a medication "database" behavior using persisted prescriptions as the canonical source, scoped by clinic.
- Ordonnance now loads distinct medication names from backend storage and merges them with local history so users can pick previously-used meds directly.
- Saving ordonnance already persists medications; after save, the new list is refreshed so recently-added meds appear immediately.
- Verification:
- Typecheck: `pnpm -C apps/web exec tsc --noEmit`
- E2E (consultation ordonnance flow): `pnpm -C apps/web test:e2e -- e2e/consultation-write-flow.spec.ts` (1 passed)

## Dedicated Medication Management Workspace

### Phase 26 - Catalog Table, APIs, and Clinic Workspace UI
- [x] Add migration for dedicated `medical_medication_catalog` with RLS, indexes, update trigger, and prescription backfill.
- [x] Extend medical-record models and Supabase-generated DB types for medication catalog entities.
- [x] Add repository methods for catalog search, usage upsert, and entry updates (canonical name, aliases, active flag).
- [x] Expose catalog search/update APIs through write service and auto-sync catalog usage after ordonnance save.
- [x] Add clinic medication management page (`/clinic/medications`) with search, alias editing, activate/deactivate actions, and per-row save.
- [x] Add route + sidebar navigation entry for medication management workspace.
- [x] Add i18n keys in `en`, `fr`, and `ar` for the new navigation and medication workspace copy.
- [x] Re-run validation (typecheck + focused consultation E2E).

## Review (Dedicated Medication Management Workspace)
- Summary:
- Added a dedicated catalog-backed medication management flow so clinics can curate canonical medication names, maintain aliases, and deactivate duplicate/outdated entries.
- Introduced a new doctor-facing clinic page for catalog operations and connected it to service-layer APIs with optimistic row updates and toast feedback.
- Kept ordonnance write path backward-safe by making catalog usage syncing non-blocking (prescription save still succeeds if catalog sync fails).
- Verification:
- Typecheck: `pnpm -C apps/web exec tsc --noEmit`
- E2E regression: `pnpm -C apps/web test:e2e -- e2e/consultation-write-flow.spec.ts` (1 passed)

## Medication Catalog Follow-up Validation

### Phase 27 - Local Migration Apply + Focused E2E Coverage
- [x] Apply migration `20260408000000_add_medication_catalog.sql` to local Supabase runtime.
- [x] Register migration version `20260408000000` in local `supabase_migrations.schema_migrations`.
- [x] Add deterministic medications E2E harness route (`/e2e/medications`) with in-memory catalog service overrides.
- [x] Add focused Playwright coverage for medication catalog search, alias update, and activate/deactivate toggles.
- [x] Re-run validation (typecheck + focused medications E2E).

## Review (Medication Catalog Follow-up Validation)
- Summary:
- Applied and verified the medication catalog migration locally, including bookkeeping in `supabase_migrations.schema_migrations`.
- Added `MedicationCatalogE2EHarness` and route wiring in `App.tsx` to test clinic medication workspace behavior without backend state dependency.
- Added browser test `e2e/medication-catalog-workspace.spec.ts` covering search/filter behavior, alias edits, and active-state toggles.
- Verification:
- Migration apply: `Get-Content -Raw supabase/migrations/20260408000000_add_medication_catalog.sql | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (applied)
- Typecheck: `pnpm -C apps/web exec tsc --noEmit`
- Medications E2E: `pnpm -C apps/web test:e2e -- e2e/medication-catalog-workspace.spec.ts` (1 passed)

## Queue Scope Architecture and Role Semantics

### Phase 28 - Design-First Multi-Queue Scoping
- [x] Audit current queue access paths (`ClinicQueue`, `EnhancedQueueManager`, queue service/repository) and document active scope behavior.
- [x] Audit schema and RPC constraints (`clinic_staff`, `clinic_resources`, schedule/resource RPCs, auth helper functions) to identify extension points.
- [x] Finalize product semantics for `My Queue` by role (clinic owner, doctor, receptionist/custom staff).
- [x] Finalize minimal scope model for partial receptionist responsibility (full clinic vs restricted) with doctor/resource focus and department-compatible path.
- [x] Define backend enforcement plan (scope resolution helper + schedule/call-next filtering) with clear fallback rules.
- [x] Define UI/UX plan for queue scope selector and assignment management in team settings.
- [x] Define phased implementation and validation plan (unit + component + E2E + migration smoke).

## Review (Queue Scope Architecture and Role Semantics)
- Summary:
- Defined provider-centric scope semantics where doctor assignment is the canonical queue axis and rooms/departments are operational overlays.
- Clarified `My Queue` behavior by role: doctor = own provider queue; restricted receptionist = assigned provider set; owner = clinic-wide by default with optional personal provider queue only when owner has a valid clinical staff profile.
- Designed minimal schema extension path for receptionist partial responsibility (full-clinic vs restricted mode + assigned doctors/resources) with optional department grouping in a later phase.
- Defined backend enforcement expectations: scope resolution must be server-side and used by both schedule reads and call-next/resource assignment writes.
- Defined phased rollout with validation lanes (unit/component/E2E + local migration smoke) before broad rollout.

## Queue Scope Implementation and Runtime Validation

### Phase 29 - Assignment-Aware Queue Scope Rollout
- [x] Add migration `20260409000000_add_staff_queue_assignments_and_scope_rpcs.sql` for `staff_queue_assignments`, scope helpers, and scope-aware schedule/action RPC enforcement.
- [x] Extend Supabase generated types for `staff_queue_assignments` and new queue scope RPC signatures.
- [x] Add staff repository/service APIs for resolving queue scope and replacing/listing queue assignments.
- [x] Add `useQueueScope` hook and wire resolved scope + allowed provider IDs into clinic queue flows.
- [x] Remove owner fallback-to-first-staff behavior in personal queue mode.
- [x] Propagate provider-scope filtering to queue schedule/action paths and booking doctor selection.
- [x] Add Team Management queue access configuration UI and save path for non-provider staff.
- [x] Update targeted tests for clinic queue scope behavior and queue/staff service contract changes.
- [x] Apply migration locally and register migration version in `supabase_migrations.schema_migrations`.
- [x] Run broader verification (full web tests + typecheck + production build).

## Review (Queue Scope Implementation and Runtime Validation)
- Summary:
- Implemented assignment-aware queue scope across DB, service layer, hooks, and clinic UI so provider/restricted users are constrained to allowed provider queues while clinic owners keep clinic-wide capability.
- Added `staff_queue_assignments` persistence and queue scope resolution RPCs; queue schedule and action paths now use server-side scope enforcement.
- Updated clinic queue behavior to remove owner fallback-to-first-staff and to propagate provider restrictions into queue operations and booking dialogs.
- Added Team Management controls for queue access assignment to configure provider subsets for non-provider staff.
- Verification:
- Migration apply: `Get-Content -Raw supabase/migrations/20260409000000_add_staff_queue_assignments_and_scope_rpcs.sql | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (applied)
- Migration registration: `docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260409000000') ON CONFLICT (version) DO NOTHING;"` (inserted)
- Full web tests: `pnpm --filter @queuemed/web test` (21 files, 130 tests passed)
- Typecheck: `pnpm --filter @queuemed/web exec tsc --noEmit` (passed)
- Build: `pnpm --filter @queuemed/web build` (passed)

## Queue Scope Continuation

### Phase 30 - Queue Scope Follow-up (6/6)
- [x] Run runtime smoke checks for restricted receptionist, provider-personal scope, and owner clinic-wide/personal toggle path; add reusable SQL verification snippet.
- [x] Add focused unit tests for `useQueueScope` output normalization across owner/provider/restricted roles.
- [x] Add component test coverage for Team Management queue assignment editing and persistence.
- [x] Add integration test coverage for `allowedStaffIds` propagation through clinic queue actions.
- [x] Add a rollback-safe migration smoke script for `staff_queue_assignments` constraints and RPC guards.
- [x] Re-run expanded validation matrix (targeted queue scope tests + full web test + build) and document results.

## Review (Queue Scope Continuation)
- Summary:
- Removed owner queue fallback auto-bootstrap behavior and enabled clinic-wide queue loading without a requester staff profile by allowing clinic-context schedule resolution.
- Preserved staff-specific restrictions by requiring `staffId` in personal scope while adding explicit clinic-wide guards for missing context.
- Added focused queue-scope coverage:
- `apps/web/src/hooks/useQueueScope.test.tsx` (owner/provider/restricted normalization and no-staff fallback defaults)
- `apps/web/src/pages/clinic/TeamManagement.test.tsx` (queue assignment editor save/persistence flow)
- `apps/web/src/hooks/useQueueService.integration.test.tsx` (`allowedStaffIds` propagation across queue actions + clinicId fallback schedule load)
- Added rollback-safe guard script: `supabase/snippets/verify_staff_queue_assignments_guards.sql` (table constraint checks, assignment authorization, restricted scope RPC guards).
- Verification:
- Targeted queue scope tests: `pnpm --filter @queuemed/web test -- src/hooks/useQueueScope.test.tsx src/hooks/useQueueService.integration.test.tsx src/pages/clinic/TeamManagement.test.tsx src/pages/clinic/ClinicQueue.test.tsx` (4 files, 10 tests passed)
- New SQL guard smoke: `Get-Content -Raw supabase/snippets/verify_staff_queue_assignments_guards.sql | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (PASS Scenario A/B/C/D, rollback)
- Existing queue scope smoke: `Get-Content -Raw supabase/snippets/verify_queue_scope_smoke.sql | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (PASS Scenario A/B/C, rollback)
- Full web tests: `pnpm --filter @queuemed/web test` (24 files, 136 tests passed)
- Typecheck: `pnpm --filter @queuemed/web exec tsc --noEmit` (passed)
- Build: `pnpm --filter @queuemed/web build` (passed)

## Queue Assignment Auth Hardening

### Phase 31 - Owner-Only Assignment Mutation Guardrails
- [x] Validate reported authorization gaps for queue assignment mutation paths (`replace_staff_queue_assignments` and `staff_queue_assignments` RLS).
- [x] Harden assignment mutation auth in the base migration to require `super_admin` or `clinic_owner` explicitly.
- [x] Add defense-in-depth trigger guard rejecting provider principals as assignment targets (`staff_id`).
- [x] Add forward migration `20260409000001_harden_staff_queue_assignments_auth.sql` for already-applied environments.
- [x] Extend assignment guard smoke script with owner-only assertions (RPC + direct table write denial for receptionist/outsider).
- [x] Apply forward migration locally, register migration version, and rerun queue scope/assignment smoke checks.

## Review (Queue Assignment Auth Hardening)
- Summary:
- Confirmed the audit findings were valid: `_user_can_manage_clinic(...)` includes `staff`, which was over-broad for assignment administration in both RPC and RLS mutation paths.
- Tightened `replace_staff_queue_assignments` and `staff_queue_assignments` mutation authorization to owner/admin only (`super_admin`, `clinic_owner`) while preserving read behavior.
- Added trigger-level guard in `_validate_staff_queue_assignment` so provider principals cannot be configured with provider subsets even if higher-layer checks regress.
- Added forward migration `supabase/migrations/20260409000001_harden_staff_queue_assignments_auth.sql` so existing environments receive the hardening without replaying historical migrations.
- Updated `supabase/snippets/verify_staff_queue_assignments_guards.sql` to include receptionist and outsider mutation denial checks under authenticated role context.
- Verification:
- Migration apply: `Get-Content -Raw supabase/migrations/20260409000001_harden_staff_queue_assignments_auth.sql | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (applied)
- Migration registration: `docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260409000001') ON CONFLICT (version) DO NOTHING;"` (inserted)
- Assignment guard smoke: `Get-Content -Raw supabase/snippets/verify_staff_queue_assignments_guards.sql | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (PASS Scenario A/B/C/D, rollback)
- Queue scope smoke: `Get-Content -Raw supabase/snippets/verify_queue_scope_smoke.sql | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (PASS Scenario A/B/C, rollback)

## Clinic Team Profile Visibility

### Phase 32 - Same-Clinic Profile Read Policy
- [x] Add forward migration `20260409000002_allow_clinic_staff_profile_visibility.sql` to allow same-clinic teammate profile reads in `public.profiles`.
- [x] Stabilize policy evaluation for PG17 with inline EXISTS predicates via `20260409000003_stabilize_profiles_team_visibility_policy.sql`.
- [x] Apply both migrations locally and register versions in `supabase_migrations.schema_migrations`.
- [x] Run rollback-safe authenticated RLS smoke validation for doctor teammate visibility and outsider denial.

## Review (Clinic Team Profile Visibility)
- Summary:
- Added a dedicated `public.profiles` SELECT policy so clinic team members can read teammate profiles required by Team Management.
- Initial helper-function predicate variant caused local PG17 instability under authenticated policy evaluation; replaced with inline role/staff EXISTS logic in a stabilization migration.
- Resulting behavior matches desired UX: same-clinic doctor can read teammate profile, outsider cannot read unrelated clinic profiles.
- Verification:
- Migration apply: `Get-Content -Raw supabase/migrations/20260409000002_allow_clinic_staff_profile_visibility.sql | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (applied)
- Migration apply: `Get-Content -Raw supabase/migrations/20260409000003_stabilize_profiles_team_visibility_policy.sql | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (applied)
- Migration registration:
- `docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260409000002') ON CONFLICT (version) DO NOTHING;"` (inserted)
- `docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260409000003') ON CONFLICT (version) DO NOTHING;"` (inserted)
- RLS smoke:
- rollback-safe SQL fixture proving `doctor_can_see_teammate = 1` and `outsider_can_see_teammate = 0` under `SET LOCAL ROLE authenticated` + JWT claim context.

## Clinic Calendar Scope-Race Fix

### Phase 33 - Calendar Scope Resolution Guarding
- [x] Reproduce and analyze persistent calendar failure for owner/doctor-role contexts after initial scope-aware patch.
- [x] Identify race where calendar fetch can execute before `useQueueScope` resolves staff scope, triggering unauthorized clinic-wide RPC for non-owner provider users.
- [x] Patch `ClinicCalendar` to wait for staff scope readiness before fetching appointments.
- [x] Add safe fallback to personal queue scope when queue-scope resolution fails for non-owner staff users.
- [x] Re-run typecheck and targeted queue-scope regression tests.

## Review (Clinic Calendar Scope-Race Fix)
- Summary:
- Root cause was not queue-scope enforcement itself, but a timing race: appointment fetch could run during the transition from unresolved default scope (`clinic-wide`) to resolved provider/restricted scope.
- Updated `ClinicCalendar` to gate fetches until requester staff scope is resolved for non-owner users.
- Added non-owner fallback behavior: when scope resolution errors, calendar forces personal-scope schedule fetch (`useClinicWide=false`, `allowedStaffIds=[staffId]`) to avoid unauthorized clinic-wide calls.
- Verification:
- Typecheck: `pnpm --filter @queuemed/web exec tsc --noEmit` (passed)
- Targeted queue scope regression: `pnpm --filter @queuemed/web exec vitest run src/hooks/useQueueScope.test.tsx src/hooks/useQueueService.integration.test.tsx src/pages/clinic/ClinicQueue.test.tsx` (3 files, 9 tests passed)

## Owner Role Semantics Follow-up

### Phase 34 - Owner-First Team Role Presentation
- [x] Validate owner-vs-doctor role semantics in Team Management table rendering.
- [x] Update row rendering so clinic owner is explicitly presented as owner-first while preserving editable clinical role.
- [x] Update queue access presentation so owner row shows clinic-wide owner access, not provider-only scope wording.
- [x] Prevent owner row removal action from appearing in Team Management.
- [x] Add focused unit test coverage for owner-first rendering when owner clinical role is doctor.
- [x] Re-run Team Management tests and web typecheck.

## Review (Owner Role Semantics Follow-up)
- Summary:
- Team Management now separates owner identity from clinical role in the UI.
- Owner row explicitly shows `Clinic Owner`; when owner has clinical `doctor` role, it is shown as a clinical-role dimension rather than replacing owner identity.
- Queue access column now displays `Clinic-wide access (Owner)` for owner rows, matching effective privileges.
- Owner remove action is hidden to avoid accidental owner-row removal from team actions.
- Verification:
- TeamManagement tests: `pnpm --filter @queuemed/web exec vitest run src/pages/clinic/TeamManagement.test.tsx` (2 passed)
- Typecheck: `pnpm --filter @queuemed/web exec tsc --noEmit` (passed)

## Doctor-Override Settings Model

### Phase 35 - Clinic Defaults + Doctor Overrides Rollout
- [x] Add forward DB migration for doctor-level override fields on `clinic_staff` (`appointment_types_override`, `daily_queue_modes_override`) and helper queue-mode function with clinic fallback.
- [x] Update booking RPC behavior to resolve queue mode per doctor (override first, clinic default fallback) for slot lookup and appointment creation.
- [x] Update staff service/repository contracts to expose and persist doctor overrides without breaking existing working-hours behavior.
- [x] Implement doctor-overrides management UI in clinic settings (owner/admin editable, view-only for non-managers): availability, appointment types, optional queue mode override.
- [x] Update booking UIs to resolve appointment types from selected doctor override first, then clinic defaults.
- [x] Re-run targeted tests + web typecheck and document review/verification.

## Review (Doctor-Override Settings Model)
- Summary:
- Added migration `supabase/migrations/20260410000000_doctor_settings_overrides.sql` to introduce `clinic_staff.appointment_types_override` and `clinic_staff.daily_queue_modes_override`, plus doctor-aware queue-mode resolver functions.
- Updated booking and queue SQL function behavior to resolve effective queue mode by doctor first, then clinic defaults (`get_effective_queue_mode_for_staff`), including mode propagation in `get_available_slots_for_mode` payloads.
- Extended staff repository/service contracts so doctor overrides are mapped, validated, and persisted through the same service boundaries used elsewhere.
- Added a dedicated doctor-overrides tab in clinic settings and sidebar settings navigation, with owner/admin edit support for: availability override, appointment-type override, and optional day-level queue-mode override.
- Updated booking UIs (`BookAppointmentDialog` and public `BookingFlow`) to resolve appointment types from selected doctor overrides first, then clinic defaults.
- Verification:
- Typecheck: `pnpm --filter @queuemed/web exec tsc --noEmit` (passed)
- Focused tests: `pnpm --filter @queuemed/web exec vitest run src/components/clinic/BookAppointmentDialog.test.tsx src/components/booking/BookingFlow.test.tsx src/pages/clinic/ClinicSettings.test.tsx src/services/staff/StaffService.test.ts` (4 files, 25 tests passed)
- Note: attempted `src/integration/booking-flow.integration.test.ts`, but this workspace Vitest include/exclude currently excludes `src/integration/**`, so that lane is not runnable through standard Vitest command.

## Doctor-Override Runtime Verification

### Phase 36 - Migration Apply + DB Smoke Proof
- [x] Apply migration `20260410000000_doctor_settings_overrides.sql` to local Supabase runtime.
- [x] Register migration version `20260410000000` in `supabase_migrations.schema_migrations`.
- [x] Run rollback-safe DB smoke checks for doctor queue-mode override precedence and clinic fallback behavior.
- [x] Re-run targeted typecheck/tests if needed after runtime verification and document outcomes.

## Review (Doctor-Override Runtime Verification)
- Summary:
- Applied migration `supabase/migrations/20260410000000_doctor_settings_overrides.sql` to local Supabase Postgres and registered version `20260410000000`.
- Added rollback-safe verification script `supabase/snippets/verify_doctor_overrides_runtime_smoke.sql` to prove runtime behavior for:
- override precedence (`clinic_staff.daily_queue_modes_override` beats clinic default),
- clinic fallback when override is null,
- mode propagation in `get_available_slots_for_mode` and `get_daily_schedule_for_staff`.
- While re-running strict typecheck, uncovered and fixed JSON cast issues in `apps/web/src/services/staff/StaffService.ts` by replacing unsafe casts with explicit JSON conversion helpers for appointment-type and queue-mode overrides.
- Verification:
- Migration apply: `Get-Content -Raw supabase/migrations/20260410000000_doctor_settings_overrides.sql | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (applied)
- Migration registration: `docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260410000000') ON CONFLICT (version) DO NOTHING;"` (inserted)
- Runtime smoke: `Get-Content -Raw supabase/snippets/verify_doctor_overrides_runtime_smoke.sql | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (PASS notice, rollback)
- Strict typecheck: `pnpm --filter @queuemed/web exec tsc --noEmit -p tsconfig.app.json` (passed)

## Local Rollout Readiness (No Cloud)

### Phase 37 - Local Verification and Go/No-Go
- [x] Confirm deployment topology is local-only (Docker Supabase containers, no cloud staging target).
- [x] Verify migration `20260410000000` registration in local `supabase_migrations.schema_migrations`.
- [x] Execute `verify_doctor_overrides_runtime_smoke.sql` against local Docker Supabase with non-destructive transaction semantics.
- [x] Produce a concise local go/no-go checklist tailored to doctor-override rollout.

## Review (Local Rollout Readiness)
- Summary:
- Confirmed runtime topology is local-only for now; cloud staging verification is not applicable in this environment.
- Re-verified migration presence and reran doctor-override runtime smoke against the local Docker Supabase stack.
- Verification:
- Local migration check: `docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260410000000';"` (1 row)
- Local runtime smoke: `Get-Content -Raw supabase/snippets/verify_doctor_overrides_runtime_smoke.sql | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (PASS notice, rollback)
- Local Go/No-Go checklist:
- Preflight: ensure local backup/snapshot exists and migration file checksum matches repo.
- Apply state: confirm version `20260410000000` is present in migration registry.
- Behavior: require PASS from `verify_doctor_overrides_runtime_smoke.sql`.
- App contract: strict typecheck (`tsconfig.app`) and focused booking/settings tests remain green.
- Runtime UX: verify doctor override tab can set/clear queue mode override and booking/schedule mode reflects override then fallback.
- Rollback trigger: any precedence mismatch or payload mode mismatch -> revert migration in local branch and disable override writes until fixed.

## Doctor Override UX + Localization Polish

### Phase 38 - Name-First Doctors and Plain-Language Copy
- [x] Resolve doctor selector labels from profile names (no raw ID labels in UI fallback path).
- [x] Replace technical doctor-override copy with plain-language wording.
- [x] Add doctor-override i18n keys for EN/FR/AR locale bundles.
- [x] Run focused verification (clinic settings tests + strict app typecheck) and document outcomes.

## Review (Doctor Override UX + Localization Polish)
- Summary:
- Updated doctor selector rendering in `ClinicSettings` to resolve and display doctor names from `profiles.full_name` (via `clinic_staff.user_id`) instead of showing truncated staff IDs.
- Added non-ID fallback labels for providers without profile names (`Doctor - {{specialty}}` then numbered fallback), keeping the UI human-readable.
- Replaced technical doctor-override wording with plain-language copy across the doctor settings tab: overview/helper text, toggle section labels/descriptions, loading/empty states, and save button text.
- Added full doctor-settings i18n key coverage in EN/FR/AR locale bundles and aligned clinic settings tab label copy (`Doctor Settings` / localized equivalents).
- Verification:
- Focused page test: `pnpm --filter @queuemed/web exec vitest run src/pages/clinic/ClinicSettings.test.tsx` (1 file, 4 tests passed)
- Strict app typecheck: `pnpm --filter @queuemed/web exec tsc --noEmit -p tsconfig.app.json` (`TSC_OK`)

## Queue Access Wording + Owner Override Consistency

### Phase 39 - Plain Language Queue Access and Owner Exclusion
- [x] Replace technical queue-access labels in Team Management with plain-language phrasing.
- [x] Confirm and document per-doctor queue semantics in UI wording.
- [x] Exclude clinic owner profile from doctor-overrides selection list.
- [x] Run focused verification (TeamManagement tests + strict app typecheck) and document outcomes.

## Review (Queue Access Wording + Owner Override Consistency)
- Summary:
- Replaced technical queue-access wording in Team Management with plain language to clarify intent:
- `Own provider queue` -> `Only their own queue`
- `All provider queues` -> `All doctor queues`
- `Configure Queue Scope` -> `Set Queue Access`
- `Save queue scope` -> `Save queue access`
- Updated supporting queue-assignment helper text and button labels to use doctor-centric, non-jargon phrasing.
- Confirmed and reflected per-doctor queue semantics in UI copy: provider-role staff are shown as managing only their own queue, while owner remains clinic-wide.
- Updated doctor-overrides provider loading in `ClinicSettings` to exclude the clinic owner (`clinic.owner_id`) from the overrides selector, preventing the owner-self inconsistent state.
- Verification:
- Focused tests: `pnpm --filter @queuemed/web exec vitest run src/pages/clinic/TeamManagement.test.tsx src/pages/clinic/ClinicSettings.test.tsx` (2 files, 6 tests passed)
- Strict app typecheck: `pnpm --filter @queuemed/web exec tsc --noEmit -p tsconfig.app.json` (`TSC_OK`)

## Live Queue Multi-Doctor View Clarity

### Phase 40 - General/My/Doctor Queue Detail Views
- [x] Add owner queue-view model in Clinic Queue with explicit support for general view, my queue, and specific doctor queue detail selection.
- [x] Load active doctor list with profile name labels and expose doctor queue options in both selector and quick doctor rows.
- [x] Wire selected queue view to queue manager and booking dialog using `useClinicWide` + `allowedStaffIds` so detail actions target the intended queue.
- [x] Add focused Clinic Queue unit coverage for doctor-row selection behavior and run targeted verification.

## Review (Live Queue Multi-Doctor View Clarity)
- Summary:
- Updated `ClinicQueue` to support three practical queue views for owner workflows: general clinic view, my queue detail, and per-doctor queue detail.
- Added doctor queue options sourced from active clinic doctors, with display names resolved from profile full names and readable doctor fallbacks when names are unavailable.
- Added doctor quick-row actions under the queue-view control so each doctor has a direct entry point into detailed queue management.
- Connected selected view to queue data/action scope by passing effective `useClinicWide` and `allowedStaffIds` into `EnhancedQueueManager` and `BookAppointmentDialog`.
- Added locale keys in EN/FR/AR for doctor queue labels and adjusted scope wording to clearer general-view language.
- Verification:
- Focused queue tests: `pnpm --filter @queuemed/web exec vitest run src/pages/clinic/ClinicQueue.test.tsx` (1 file, 4 tests passed)
- Clinic page regression set: `pnpm --filter @queuemed/web exec vitest run src/pages/clinic/TeamManagement.test.tsx src/pages/clinic/ClinicSettings.test.tsx src/pages/clinic/ClinicQueue.test.tsx` (3 files, 10 tests passed)
- Strict app typecheck: `pnpm --filter @queuemed/web exec tsc --noEmit -p tsconfig.app.json` (`TSC_OK`)

## Live Queue Owner Switch Stability

### Phase 41 - Deterministic Owner Queue View Switching
- [x] Audit owner queue-view switching flow to identify loading deadlock root cause instead of patching symptoms.
- [x] Refactor `ClinicQueue` owner-view state so queue view selection does not synchronize into `useQueueScope` selection state.
- [x] Memoize effective queue filter derivation (`useClinicWide` + `allowedStaffIds`) to provide stable prop identity for queue data hooks.
- [x] Remove duplicate owner-as-doctor option from doctor queue list when `My Queue` is already available.
- [x] Re-run focused queue regression tests and strict TypeScript compile check.

## Review (Live Queue Owner Switch Stability)
- Summary:
- Root cause was identity churn on derived `allowedStaffIds` arrays for owner `my queue` / doctor-detail views, which retriggered queue refresh effects continuously and left non-general views in a perpetual loading state.
- Updated `ClinicQueue` to compute selected doctor staff ID, effective clinic-wide mode, and effective allowed staff IDs via `useMemo`, so unchanged view selections keep stable references.
- Removed owner-view synchronization into `useQueueScope` local selection state to avoid dual-state drift between page-level queue-view UI and scope hook internals.
- Filtered doctor quick-list options to exclude the current owner staff profile when `My Queue` is present, removing duplicate semantics for the same queue.
- Verification:
- Focused queue tests: `pnpm --filter web test -- ClinicQueue.test.tsx` (1 file, 5 tests passed)
- Strict compile check (web): `pnpm --filter web exec tsc --noEmit` (passed)

## Doctor Queue Click-State Clarity

### Phase 42 - Deterministic Doctor Card Selection Feedback
- [x] Reproduce and analyze doctor quick-card click flow where selected state appeared stuck at French label "Affichage en cours".
- [x] Ensure owner queue-view switches remount queue manager deterministically so doctor/general transitions always trigger a fresh schedule load path.
- [x] Add doctor quick-card toggle behavior so clicking the active doctor card returns to general clinic queue.
- [x] Update selected-state locale copy to explicit active-state wording in EN/FR/AR.
- [x] Add regression test coverage for active-doctor-card toggle-to-general behavior.
- [x] Re-run focused queue test lane and strict web compile check.

## Review (Doctor Queue Click-State Clarity)
- Summary:
- Updated `ClinicQueue` queue-view change handling so clicking an already-selected doctor quick card returns to clinic general view, reducing "stuck" perception and giving a one-click escape path.
- Changed `EnhancedQueueManager` keying to include current queue view selection, forcing deterministic remount/fetch when switching between clinic/my/doctor views.
- Reworded selected doctor queue label from loading-like phrasing to active-state phrasing across locale bundles:
- EN: `Queue active`
- FR: `File active`
- AR: `الصف النشط`
- Added focused regression coverage in `ClinicQueue.test.tsx` to verify selected doctor quick-card toggles back to general queue scope.
- Verification:
- Focused queue tests: `pnpm --filter web test -- ClinicQueue` (1 file, 6 tests passed)
- Strict compile check (web): `pnpm --filter web exec tsc --noEmit` (passed)

## Doctor Override Permission Gate Fix

### Phase 43 - Owner-Granted Doctor Overrides Editable by Doctor
- [x] Reproduce doctor-side bug where clinic settings showed global view-only banner despite owner-granted doctor override permissions.
- [x] Refactor `ClinicSettings` read-only gating to be tab-specific so doctor-overrides editability is evaluated independently from full clinic settings management.
- [x] Restrict non-manager doctor-overrides scope to the current doctor profile only while keeping owner/admin full provider selection.
- [x] Keep override toggles owner/admin-controlled while allowing doctor-side save of owner-enabled override values.
- [x] Add focused regression test proving doctor can save own overrides without `manage_clinic_settings`.
- [x] Re-run focused `ClinicSettings` tests and strict web typecheck.

## Review (Doctor Override Permission Gate Fix)
- Summary:
- Updated `ClinicSettings` so "view-only" state is computed per tab; non-manager doctors are no longer blocked on the `doctor-overrides` tab when editing their own profile overrides.
- Limited non-manager provider scope to self in doctor-overrides data loading, preventing edits to other doctors while still allowing owner/admin full access.
- Preserved owner control over enable/disable toggles for override sections by keeping those switches editable only with full settings management.
- Added regression coverage in `ClinicSettings.test.tsx` for doctor-side save path without `manage_clinic_settings`.
- Verification:
- Focused settings tests: `pnpm --filter web test -- ClinicSettings.test.tsx` (1 file, 5 tests passed)
- Strict compile check (web): `pnpm --filter web exec tsc --noEmit` (`TSC_OK`)

## Doctor Override Editability Hardening

### Phase 44 - Custom Provider Roles + RLS-Safe Save Path
- [x] Diagnose residual non-editable doctor-overrides flow after tab-level permission gating fix.
- [x] Refactor provider detection in `ClinicSettings` to honor custom role definitions with `baseRole = doctor` (not only literal `doctor` role keys).
- [x] Add dedicated `staffService.updateDoctorOverrides` + repository RPC path to avoid owner-only `clinic_staff` direct update policy blocking doctor self-saves.
- [x] Add Supabase migration introducing `update_staff_doctor_overrides` SECURITY DEFINER RPC with strict owner/self-provider authorization.
- [x] Extend focused `ClinicSettings` tests for RPC save path and custom doctor-role key editability.
- [x] Re-run focused settings tests and strict web typecheck.

## Review (Doctor Override Editability Hardening)
- Summary:
- Root cause of "still not editable" after UI gating fix was twofold: (1) provider detection still required role strings containing `doctor`, and (2) save path still used direct `clinic_staff` updates that are owner-only under current RLS policies.
- Updated `ClinicSettings` provider filtering to use role definitions (`normalizeRoleKey` + `baseRole === doctor`) so custom doctor roles (for example `medecin`) are recognized as providers.
- Routed doctor override persistence through a new dedicated service/repository RPC call (`update_staff_doctor_overrides`) instead of direct table update.
- Added migration `20260410000001_update_staff_doctor_overrides_rpc.sql` with SECURITY DEFINER function that only allows clinic owners or self-provider users to mutate override columns.
- Added/updated focused unit coverage proving doctor-side save path uses RPC and custom doctor-base-role profiles remain editable.
- Verification:
- Focused settings tests: `pnpm --filter web exec vitest run src/pages/clinic/ClinicSettings.test.tsx` (1 file, 6 tests passed)
- Strict compile check (web): `pnpm --filter web exec tsc --noEmit` (`TSC_OK`)

## Doctor Overrides Local Deployment + Runtime Retest

### Phase 45 - Apply Pending Migration and Prove Doctor Self-Edit Runtime
- [x] Detect local Supabase runtime container and confirm migration `20260410000001` pending in `supabase_migrations.schema_migrations`.
- [x] Apply `20260410000001_update_staff_doctor_overrides_rpc.sql` directly to local DB via dockerized `psql`.
- [x] Insert migration version marker into `supabase_migrations.schema_migrations` after manual apply.
- [x] Re-run existing doctor-overrides runtime smoke (`verify_doctor_overrides_runtime_smoke.sql`).
- [x] Add and run dedicated doctor-authenticated RPC self-edit smoke using custom provider role key (`medecin`).

## Review (Doctor Overrides Local Deployment + Runtime Retest)
- Summary:
- Local Supabase DB already had `20260410000000` applied but not `20260410000001`; migration was successfully applied and recorded.
- Confirmed function deployment: `public.update_staff_doctor_overrides` exists and is executable for `authenticated` role.
- Existing runtime smoke passed for override precedence + fallback behavior.
- Added `supabase/snippets/verify_doctor_overrides_rpc_self_edit_smoke.sql` and validated doctor self-edit via RPC under authenticated JWT context with custom provider role mapping.
- Verification:
- Migration history check: `select version from supabase_migrations.schema_migrations where version in ('20260410000000','20260410000001');`
- Runtime smoke: `Get-Content -Raw supabase/snippets/verify_doctor_overrides_runtime_smoke.sql | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (PASS notice)
- Doctor self-edit smoke: `Get-Content -Raw supabase/snippets/verify_doctor_overrides_rpc_self_edit_smoke.sql | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (PASS notice)

## QA Doctor UI Editability Stabilization

### Phase 46 - Robust Own-Provider Gating for Doctor Overrides
- [x] Diagnose residual QA doctor UI lock after DB migration and RPC self-edit smoke passed.
- [x] Harden `ClinicSettings` doctor-overrides editability gate to allow any selected provider row owned by the logged-in doctor (not only first matching row).
- [x] Add non-manager self-provider fallback fetch path (`getStaffByClinicAndUser`) when provider list filtering returns empty.
- [x] Enforce non-manager selected provider ID to the logged-in doctor profile (or scoped staff fallback) during provider refresh.
- [x] Add focused regression test for multi-row same-user provider selection ensuring save remains enabled and targets selected row.
- [x] Validate QA clinic doctor DB access state confirms owner-enabled override columns are present.

## Review (QA Doctor UI Editability Stabilization)
- Summary:
- Fixed a latent UI gating bug where doctor editability depended on the first own provider row; selecting another own row could incorrectly flip back to read-only.
- Updated doctor-overrides permission logic to authorize editing for any selected provider row that belongs to the authenticated doctor.
- Added fallback data-loading path for non-manager doctors so self-provider context is recovered even when list filtering returns empty.
- Confirmed QA clinic doctor (`9d0be2bf-d841-44ee-b926-379d1572220f`) has owner-enabled override columns (`working_hours`, `appointment_types_override`, `daily_queue_modes_override`) in DB.
- Verification:
- Focused settings tests: `pnpm --filter web exec vitest run src/pages/clinic/ClinicSettings.test.tsx` (1 file, 7 tests passed)
- Strict compile check (web): `pnpm --filter web exec tsc --noEmit` (`TSC_OK`)
- QA DB access check: direct SQL against `clinic_staff` for QA clinic confirmed all override columns enabled for doctor staff row.

## Doctor Overrides Visual Affordance Polish

### Phase 47 - Highlight Editable Override Sections with Green Accent
- [x] Improve doctor-overrides visual affordance so editable sections stand out clearly from disabled/neutral sections.
- [x] Add success-green border + subtle tint on override cards only when section is currently editable.
- [x] Add compact `Editable` badge on each active editable override section.
- [x] Re-run focused ClinicSettings tests and strict web compile check.

## Review (Doctor Overrides Visual Affordance Polish)
- Summary:
- Updated doctor-overrides cards in `ClinicSettings` so enabled editable sections are visually emphasized with success-green border/tint.
- Added lightweight `Editable` pill badge at section header level for quick scanning.
- The UI now naturally shows "two green boxes" when exactly two override sections are enabled/editable for the selected doctor.
- Verification:
- Focused settings tests: `pnpm --filter web exec vitest run src/pages/clinic/ClinicSettings.test.tsx` (1 file, 7 tests passed)
- Strict compile check (web): `pnpm --filter web exec tsc --noEmit` (`TSC_OK`)

## Live Queue Missing Appointment Fix

### Phase 48 - Slotted View Date Handling and Timezone-Safe Windows
- [x] Reproduce and triage mismatch where live queue summary showed waiting count while slotted list rendered "No appointments scheduled".
- [x] Confirm DB state for QA clinic: scheduled appointment exists for today with valid `scheduled_time` and queue position.
- [x] Remove local "today" re-filtering in `SlottedQueueView`; trust backend day-scoped schedule payload.
- [x] Replace ISO-string date reconstruction with timezone-safe local date+time composition for slot windows.
- [x] Add focused regression test proving slotted entries render without local-today re-filter.
- [x] Run focused queue tests and strict web typecheck.

## Review (Live Queue Missing Appointment Fix)
- Summary:
- Root cause was frontend-only: `SlottedQueueView` was re-filtering already day-scoped schedule data against local `today`, then rebuilding slot dates via `toISOString`, which can shift day boundaries and hide valid appointments.
- Updated slot window construction to set hours directly on the appointment date object, avoiding ISO-based date drift.
- Removed redundant local-date filtering so schedule entries returned by queue RPC are always rendered in slotted mode.
- Added regression coverage in `SlottedQueueView.test.tsx` to lock behavior.
- Verification:
- Focused queue tests: `pnpm --filter web exec vitest run src/components/clinic/SlottedQueueView.test.tsx src/pages/clinic/ClinicQueue.test.tsx` (2 files, 7 tests passed)
- Strict compile check (web): `pnpm --filter web exec tsc --noEmit` (`TSC_OK`)

## Doctor Reporting + Revenue + Referral Plan (Gaps #11 #12 #13 #14 #15 #16)

### Phase 49A - Re-baseline and Scope Lock
- [x] Re-baseline current state for gaps #11-#16 (what is already shipped vs partially shipped vs missing).
- [x] Freeze product definitions and acceptance criteria for each gap:
- [x] #11 Doctor activity report: owner-facing per-doctor daily/weekly metrics.
- [x] #12 Clinic KPI dashboard: operational + business KPIs in one route.
- [x] #13 End-of-day summary: persisted closure artifact (not only transient toast/dialog).
- [x] #14 Historical trends: queue/wait-time charts backed by collected snapshots.
- [x] #15 Billing/revenue tracking: appointment amount + payment lifecycle foundation.
- [x] #16 Referral tracking: capture and report doctor-to-doctor referral flow.
- [ ] Confirm non-goals for this wave (full invoicing engine, insurance adjudication, accounting exports).

### Phase 49B - Gap #11 Doctor Activity Report Completion
- [x] Validate and harden DB RPC contract (`get_doctor_activity_report`) for custom doctor roles and permission checks.
- [x] Integrate/report card in owner workflow with date-range selector and no-data/permission states.
- [x] Add doctor-level metrics: completed, in-progress, cancelled, no-show, average duration, total patients.
- [x] Add targeted tests for RPC result mapping, permission denial, and UI rendering states.

### Phase 49C - Gap #12 Clinic KPI Dashboard Upgrade
- [x] Define KPI set for owners: queue throughput, average wait, completion rate, no-show rate, active doctors, utilization.
- [x] Extend/introduce analytics service for KPI aggregation (single payload for dashboard rendering).
- [x] Upgrade dashboard UI from landing-style cards to metrics view with trend context and time filters.
- [x] Add route-level permission gating (`view_analytics`) and explicit empty/error states.
- [x] Add focused tests for KPI transforms and dashboard component rendering.

### Phase 49D - Gap #13 End-of-Day Summary Artifact
- [x] Add persistent end-of-day summary storage (table or materialized event record) linked to clinic, date, and staff.
- [x] Extend end-day flow to write summary artifact during closure transaction.
- [x] Add owner/staff read UI for historical day closures (summary list + detail drill-down).
- [x] Add rollback-safe SQL smoke for closure write + idempotency/duplicate-date handling.

### Phase 49E - Gap #14 Historical Trend Consumption
- [x] Wire dashboard trend charts to existing historical sources (`queue_snapshots`, wait-time snapshots/features) with bounded query windows.
- [x] Add chart series for at least: avg wait, completed volume, no-show trend.
- [x] Add filter presets (7d / 30d / 90d) and localizable tooltips/labels.
- [x] Add tests for trend aggregation and missing-data fallback.

### Phase 49F - Gap #15 Billing/Revenue Foundation
- [x] Add schema fields for appointment billing baseline (e.g., `billing_amount`, `currency`, `payment_status`, `paid_at`, `payment_method`).
- [x] Add migration-safe backfill/default strategy for existing appointments.
- [x] Extend booking/queue completion flows to set and update payment state.
- [x] Add owner KPI rollups for revenue and collection rate (day/week/month).
- [x] Add permission gate for billing visibility/actions (`view_billing` / `manage_billing` or agreed equivalent).
- [x] Add focused tests + local migration smoke for payment lifecycle transitions.

### Phase 49G - Gap #16 Referral Tracking Model
- [x] Add referral domain model (source doctor, target doctor/specialty, reason, status, linked appointment/patient).
- [x] Add DB schema + RLS policy + service/repository methods for referral create/update/list.
- [x] Add doctor UI entry point to create referral from consultation/queue context.
- [x] Add owner analytics slice for referral volume and conversion outcomes.
- [x] Add tests for authorization and state transitions.

### Phase 49H - Permissions, Security, and Verification
- [x] Enforce analytics/billing/referral permissions server-side (RPC + RLS), not UI-only.
- [x] Add SQL verification snippets for analytics and billing permission boundaries.
- [x] Run validation matrix:
- [x] targeted unit/component tests for dashboard/reporting/billing/referrals,
- [x] strict app typecheck,
- [x] production build,
- [x] local migration apply/register + rollback-safe DB smoke scripts.
- [x] Append implementation review with evidence and deferred items.

## Review (Gap #12/#14 Analytics Route Backbone)
- Summary:
- Added dedicated owner/staff analytics route and page at `/clinic/analytics` with explicit `view_analytics` permission gating.
- Implemented KPI cards and trend charts using real data from appointments + queue snapshots for 7d/30d/90d ranges.
- Added analytics entry in clinic sidebar and dashboard quick actions for discoverability.
- Verification:
- Strict typecheck (web): `pnpm --filter web exec tsc --noEmit`
- Production build (web): `pnpm --filter web build`
- Full web tests: `pnpm --filter web test` (26 files, 160 tests passed)

## Review (Gap #13 Day Closure Artifact)
- Summary:
- Added migration `20260412000002_add_day_closure_reports.sql` introducing persisted day-closure reports, RLS read policy, and supporting RPCs for preview, close-day persistence, and history retrieval.
- Updated end-day closure flow to upsert a single report per clinic/staff/date and return report metadata in closure response.
- Enhanced `EndDayConfirmationDialog` with a historical closure list and per-report detail drill-down (counts + reason/notes), accessible directly in the existing end-day UX.
- Added rollback-safe smoke script `verify_day_closure_reports_smoke.sql` validating closure write, duplicate-date idempotency, and owner/provider history reads.
- Verification:
- Migration apply: `Get-Content -Raw "supabase/migrations/20260412000002_add_day_closure_reports.sql" | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (passed)
- DB smoke: `Get-Content -Raw "supabase/snippets/verify_day_closure_reports_smoke.sql" | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (passed, rollback)
- Strict typecheck (web): `pnpm --filter web exec tsc --noEmit` (passed)
- Targeted UI test: `pnpm --filter web test -- src/pages/clinic/ClinicQueue.test.tsx` (7 passed)
- Production build (web): `pnpm --filter web build` (passed)

## Review (Gap #15 Billing and Revenue Foundation)
- Summary:
- Added migration `20260412000003_add_appointment_billing_foundation.sql` with appointment billing fields, payment status enum, defaults/backfill helpers, and permission-aware billing RPCs.
- Added trigger-based booking defaults so new appointments inherit billing amount from clinic appointment-type prices and start as `unpaid` by default.
- Added payment lifecycle RPC `update_appointment_payment_status` and revenue KPI RPC `get_clinic_revenue_kpis` with server-side permission enforcement (`manage_billing` / `view_billing`).
- Extended queue domain/repository/service models with billing fields and payment update support, including zero-amount completion auto-settlement to `paid`.
- Upgraded analytics page to show owner billing rollups (day/week/month billed, collected, collection rate) when `view_billing` is allowed.
- Added rollback-safe smoke script `verify_billing_payment_lifecycle_smoke.sql` validating defaults, permission checks, payment updates, and KPI payloads.
- Verification:
- Migration apply: `Get-Content -Raw "supabase/migrations/20260412000003_add_appointment_billing_foundation.sql" | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (passed)
- DB smoke: `Get-Content -Raw "supabase/snippets/verify_billing_payment_lifecycle_smoke.sql" | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (passed, rollback)
- Regenerated Supabase types (local): `npx supabase gen types --local --lang typescript --schema public | Set-Content -Encoding utf8NoBOM "apps/web/src/integrations/supabase/types.ts"`
- Strict typecheck (web): `pnpm --filter web exec tsc --noEmit` (passed)
- Focused tests: `pnpm --filter web test -- src/services/queue/QueueService.test.ts src/pages/clinic/ClinicQueue.test.tsx` (45 passed)
- Production build (web): `pnpm --filter web build` (passed)

## Role Enforcement + Audit Hardening (Gaps #17 #18 #20 #21 Partial)

### Phase 49I - Server-Side Permission and Role Governance Hardening
- [x] Replace remaining broad `_user_can_manage_clinic` checks in queue-scope and medical-sharing RPCs with granular permission checks (`view_queue`, `manage_queue`, `manage_appointments`, `manage_team`, `manage_medical_records`).
- [x] Tighten `staff_queue_assignments` select policy to use explicit `manage_team` permission.
- [x] Add role-change audit triggers for `clinic_staff` and `user_roles`, writing immutable events into `audit_logs`.
- [x] Add `clinic_staff` -> `user_roles` sync trigger and unique role index to reduce role-source drift.
- [x] Add rollback-safe SQL smoke script validating permission denial paths, role audit writes, and role-sync cleanup behavior.
- [x] Apply and register migration `20260412000004_harden_role_enforcement_and_audit.sql`, then rerun focused app verification.

## Review (Role Enforcement + Audit Hardening)
- Summary:
- Added migration `20260412000004_harden_role_enforcement_and_audit.sql` to harden remaining queue/medical authorization paths away from broad clinic-manage checks.
- Updated queue scope/resource and medical-sharing functions so access decisions require explicit granular permissions, closing key server-side enforcement gaps.
- Added role-governance controls: dedup + unique index for `(user_id, clinic_id, role)`, `clinic_staff` to `user_roles` sync trigger, and role-change audit triggers for both `clinic_staff` and `user_roles`.
- Added owner/role-manager audit visibility policy (`manage_roles`) for clinic-scoped audit records.
- Added Team Management UI section showing recent role/staff change audit events for role managers.
- Added rollback-safe smoke script `verify_role_enforcement_and_audit_smoke.sql` covering denial/success paths and sync/audit assertions.
- Verification:
- Migration apply: `Get-Content -Raw "supabase/migrations/20260412000004_harden_role_enforcement_and_audit.sql" | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (applied)
- Migration registration: `docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260412000004') ON CONFLICT (version) DO NOTHING;"` (inserted)
- DB smoke: `Get-Content -Raw "supabase/snippets/verify_role_enforcement_and_audit_smoke.sql" | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (PASS notice, rollback)
- Strict typecheck (web): `pnpm --filter web exec tsc --noEmit` (passed)
- Focused Team Management test: `pnpm --filter web test -- src/pages/clinic/TeamManagement.test.tsx` (2 passed)
- Production build (web): `pnpm --filter web build` (passed)

## Super Admin Console + Analytics/Billing Guardrails (Follow-up)

### Phase 49J - Execute All Suggested Follow-ups
- [x] Add dedicated super-admin route and guard in frontend (`/super-admin`) with role-management controls.
- [x] Add secure DB RPCs for super-admin listing/search/grant/revoke actions and log role-change events.
- [x] Route super-admin users to the super-admin console after login.
- [x] Enrich Team Management role-audit feed with actor/target profile names and emails (fallback to IDs).
- [x] Add explicit analytics/billing permission-boundary smoke verification script.
- [x] Enforce `view_analytics` server-side in `get_clinic_realtime_metrics` to align with route-level permission model.
- [x] Apply/register migration and rerun validation (smoke + typecheck + focused tests + build).

## Review (Super Admin Console + Analytics/Billing Guardrails)
- Summary:
- Added migration `20260412000005_add_super_admin_console_and_analytics_guardrails.sql` with super-admin management RPCs (`list_super_admin_users`, `search_super_admin_candidates`, `grant_super_admin_role`, `revoke_super_admin_role`) and helper assertions.
- Added a dedicated super-admin UI route and guard: `/super-admin`, including user search plus grant/revoke controls.
- Updated login post-auth routing so users with `super_admin` role land directly on the new console.
- Upgraded Team Management role-audit panel to resolve actor/target names from `profiles` before falling back to user IDs.
- Added and ran `verify_analytics_billing_permission_boundaries_smoke.sql` to prove server-side denial/allow behavior for analytics and billing RPCs.
- Hardened `get_clinic_realtime_metrics` with server-side `view_analytics` permission enforcement.
- Verification:
- Migration apply: `Get-Content -Raw "supabase/migrations/20260412000005_add_super_admin_console_and_analytics_guardrails.sql" | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (applied)
- Migration registration: `docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260412000005') ON CONFLICT (version) DO NOTHING;"` (inserted)
- Analytics/billing smoke: `Get-Content -Raw "supabase/snippets/verify_analytics_billing_permission_boundaries_smoke.sql" | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (PASS notice, rollback)
- Super-admin RPC smoke: `Get-Content -Raw "supabase/snippets/verify_super_admin_console_smoke.sql" | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (PASS notice, rollback)
- Regenerated Supabase types (local): `npx supabase gen types --local --lang typescript --schema public | Set-Content -Encoding utf8NoBOM "apps/web/src/integrations/supabase/types.ts"`
- Strict typecheck (web): `pnpm --filter web exec tsc --noEmit` (passed)
- Focused Team Management test: `pnpm --filter web test -- src/pages/clinic/TeamManagement.test.tsx` (2 passed)
- Production build (web): `pnpm --filter web build` (passed)

## Patient Medical Passport Foundation (Section 5 #23/#25/#26)

### Phase 50A - Core Longitudinal Medical History Layer
- [x] Add migration `20260412000006_add_patient_medical_passport_core.sql` for patient problem list + current medications tables, indexes, backfill, RLS, and passport RPC.
- [x] Extend medical-record TypeScript models for passport payload, patient problem entries, and current medication entries.
- [x] Implement `PatientMedicalPassportService` for passport read plus create/resolve/stop operations.
- [x] Replace standalone consultation allergy header with unified `MedicalPassportHeader` (allergies + active problems + current medications).
- [x] Add rollback-safe SQL smoke script `verify_patient_medical_passport_core_smoke.sql` with authenticated-role RLS checks.
- [x] Apply/register migration, regenerate Supabase types, and re-run strict app verification.

## Review (Patient Medical Passport Foundation)
- Summary:
- Added migration `20260412000006_add_patient_medical_passport_core.sql` introducing:
- `patient_problem_list` + `patient_current_medications` tables with active-state lifecycle columns.
- `patient_medical_entry_source` enum and uniqueness/index constraints for active longitudinal entries.
- Backfill seed from latest diagnoses/prescriptions.
- Helper access predicates (`_is_patient_owner`, `_clinic_user_can_access_patient_medical_passport`) and RLS policies for patient-owner + clinic permission paths.
- Consolidated RPC `get_patient_medical_passport` returning allergies, active problems, current medications, and counts.
- Added web service `PatientMedicalPassportService` and wired it into medical-record exports.
- Added `MedicalPassportHeader` in consultation flow so clinicians see and manage active problems/current meds in the same header area as allergy safety context.
- Added runtime smoke script `verify_patient_medical_passport_core_smoke.sql` validating:
- restricted-role read denial,
- viewer read allow + write denial,
- doctor write/resolve/stop lifecycle,
- patient-owner own-record access and non-owned record denial.
- Verification:
- Migration apply: `Get-Content -Raw "supabase/migrations/20260412000006_add_patient_medical_passport_core.sql" | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (applied)
- Migration registration: `docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "insert into supabase_migrations.schema_migrations(version) select '20260412000006' where not exists (select 1 from supabase_migrations.schema_migrations where version = '20260412000006');"` (inserted)
- DB smoke: `Get-Content -Raw "supabase/snippets/verify_patient_medical_passport_core_smoke.sql" | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (PASS notices, rollback)
- Regenerated Supabase types (local): `pnpm -C apps/web exec supabase gen types typescript --local --schema public | Set-Content -Encoding UTF8 "apps/web/src/integrations/supabase/types.ts"`
- Strict typecheck (web): `pnpm -C apps/web exec tsc --noEmit` (passed)
- Production build (web): `pnpm -C apps/web build` (passed)

## Patient Intake Onboarding and Profile Expansion (Section 5 #27)

### Phase 50B - Patient-Provided Medical Intake UX
- [x] Add patient-facing medical passport section for active conditions and current medications using existing passport service operations.
- [x] Upgrade patient onboarding flow from static welcome to a two-step flow with optional medical intake.
- [x] Reuse structured allergy capture in onboarding so new patients can provide safety-critical data during first-run.
- [x] Add the same patient medical passport management section in patient profile for ongoing edits after onboarding.
- [x] Run strict compile verification for the onboarding/profile medical intake updates.

## Review (Gap #11 Doctor Activity Report - Phase 49B Complete)
- Summary:
  - DoctorActivityCard was already integrated; all 8 tests were failing due to an unstable `t` function reference in the `react-i18next` mock (inline arrow function) causing an infinite `useEffect` re-render loop.
  - Fixed by hoisting `t` to a module-level `const stableT = vi.fn(...)` so the effect fires exactly once on mount.
  - All 8 tests now pass. Gap #11 is complete.

## Review (Gap #12/#14 Analytics Service Extraction + Dashboard Upgrade)
- Summary:
  - Extracted inline KPI aggregation logic from `ClinicAnalytics.tsx` into a new `AnalyticsService` at `apps/web/src/services/analytics/AnalyticsService.ts`:
    - Typed interfaces: `AnalyticsSummary`, `DailyMetrics`, `RevenueKpis`, `KPIDashboardPayload`, `RangeKey`.
    - Pure helpers: `computeSummary`, `normalizeDailyMetrics`, `getRangeBounds`, `getDateSequence`, `roundToOneDecimal`, `formatCurrency`.
    - `getKPIDashboard(clinicId, range, locale, canViewBilling)` — fetches from 4+ Supabase sources in parallel via `Promise.all` and aggregates.
  - Refactored `ClinicAnalytics.tsx` to use `getKPIDashboard`, removing ~60 lines of inline data-loading/aggregation code.
  - Upgraded `ClinicDashboard.tsx` with an analytics KPI row (total appointments, completion rate, no-show rate, active staff) backed by the same service, gated behind `view_analytics`.
  - Added index file `apps/web/src/services/analytics/index.ts`.
  - Added `AnalyticsService.test.ts` with 23 unit tests covering:
    - `roundToOneDecimal` (positive, negative, zero, edge cases)
    - `toLocalDateString` (date formatting)
    - `formatCurrency` (USD, EUR, fallback on bad currency)
    - `getRangeBounds` (7d/30d/90d inclusive range calculations)
    - `getDateSequence` (count, structure, locale-aware labels)
    - `normalizeDailyMetrics` (avgWait computation, zero samples, rounding)
    - `computeSummary` (totals, rates, durations, empty array, zero totals safety)
- Verification:
  - Unit tests: `npx vitest run src/services/analytics/AnalyticsService.test.ts` (23/23 passed)
  - TypeScript strict check: `npx tsc --noEmit` (passed)
  - Production build: `npx vite build` (passed)
  - Existing DoctorActivityCard tests: (8/8 passed)

## Review (Demo Booking — Missing Doctors and Appointment Types)
- Summary:
  - Root cause: After seed, patients in Rabat Heart Center (c202) and Marrakech Kids Clinic (c203) saw "No active doctors are available" and "Appointment types not configured" because:
    1. `seed-local-clinics.mjs` only created bare clinic rows — no `appointment_types` in `settings`, no `clinic_staff` rows, and no `clinic_staff.user_id` auth users.
    2. RLS on `clinic_staff` blocked patient SELECT (existing policies checked `auth.uid()` or team role — patients have `patient` role).
    3. RLS on `profiles` blocked patient SELECT for staff profile names.
  - Production fixes (migrations applied and registered):
    - `20260603000003_open_clinic_staff_public_read.sql` — added `anyone_can_view_active_clinic_staff` SELECT policy on `clinic_staff` (mirrors `clinics`' "Anyone can view active clinics" pattern).
    - `20260603000004_open_doctor_profiles_for_patient_booking.sql` — added `anyone_can_view_active_staff_profiles` SELECT policy on `profiles` so booking flow can resolve doctor names.
  - Seed fix (`apps/web/scripts/seed-local-clinics.mjs` updated):
    - Added `appointment_types` arrays (3 types each with name, label, price, duration) to all clinics.
    - Added auth user INSERT for 4 new staff members (Rabat doctor/receptionist, Marrakech doctor/receptionist) with fixed UUIDs.
    - Added `profiles` INSERT for the 4 staff members with real names and phone numbers.
    - Added 6 `clinic_staff` rows (doctor + receptionist per clinic, including Casa) with valid `user_id` references.
    - Casa Family Care doctor uses owner auth user ID; Rabat/Marrakech staff use their dedicated auth user IDs.
  - Verified complete booking data per clinic (doctors with profile names, receptionists, appointment types all visible).
- Verification:
  - TypeScript strict check: `pnpm --filter web exec tsc --noEmit` (passed)
  - BookingFlow tests: `npx vitest run src/components/booking/BookingFlow.test.tsx` (2/2 passed)
  - Analytics tests: 23/23 passed
  - DoctorActivityCard tests: 8/8 passed
  - Production build: `pnpm --filter web build` (passed)
  - Seed re-run: `node apps/web/scripts/seed-local-clinics.mjs` (succeeded)
  - DB verification: all 3 clinics have active doctors, receptionists, and appointment_types populated

## Review (Patient Intake Onboarding and Profile Expansion)
- Summary:
- Added `PatientMedicalPassportSection` component so patients can add/resolve active conditions and add/stop current medications with `source = patient` and owner-scoped access.
- Updated `PatientOnboarding` to a two-step flow: welcome -> optional medical intake, including both allergies and structured passport entries before dashboard navigation.
- Extended `PatientProfile` with the same passport section so intake remains editable outside onboarding.
- This closes the core UX gap for #27 (patient-provided intake form) while leveraging the already shipped #24/#25/#26 schema/service foundation.
- Verification:
- Strict typecheck (web): `pnpm -C apps/web exec tsc --noEmit` (passed)
- Production build (web): `pnpm -C apps/web build` (passed)

## Review (Gap #16 Referral Tracking)
- Summary:
- Added migration `20260603000007_add_referral_tracking.sql` introducing `referral_status` enum, `patient_referrals` table (patient, clinic, source staff, target doctor/specialty, target clinic, reason, notes, status, linked appointment), indexes, RLS policies, 4 RPCs (`create_patient_referral`, `respond_to_referral`, `cancel_referral`, `get_patient_referrals`), and `_default_clinic_role_permissions` entries for `view_referrals`/`manage_referrals`.
- Applied migration locally and registered version `20260603000007` in `supabase_migrations.schema_migrations`.
- Added `ReferralModels.ts` with domain types, enums, labels, and `ReferralAnalytics` analytics interface.
- Added `ReferralRepository.ts` wrapping all 4 RPCs via Supabase client.
- Added `ReferralService.ts` with `createReferral`, `getReferrals`, `respondToReferral`, `cancelReferral` methods and `computeAnalytics` pure function.
- Added `useReferrals.ts` hook with load/create/respond/cancel + state management.
- Added `CreateReferralDialog.tsx` form dialog with validation for required fields.
- Added `ReferralTab.tsx` consultation tab with referral list, status badges, accept/decline/cancel actions.
- Wired referral tab as 6th consultation tab in `ConsultationPanel.tsx` via `sourceStaffId` prop.
- Passed `staffId` as `sourceStaffId` from `EnhancedQueueManager.tsx`.
- Added `getReferralAnalytics` to `AnalyticsService.ts` and exported from `AnalyticsService/index.ts`.
- Added referral i18n keys in EN/FR/AR locale bundles (`referral` namespace with form, status, action, empty state, and count keys).
- Added `ReferralService.test.ts` with 4 unit tests for `computeAnalytics` (empty, status counts, conversion rate, zero rate edge case).
- Added rollback-safe SQL smoke script `verify_referral_tracking_smoke.sql` covering 6 scenarios:
  1. `create_patient_referral` returns valid UUID.
  2. `get_patient_referrals` returns referral with correct source name and pending status.
  3. `respond_to_referral` transitions status to `accepted` and persists response notes.
  4. `cancel_referral` transitions status to `cancelled`.
  5. Authentication: patient user denied referral creation.
  6. `patient_referrals` table and `referral_status` enum exist.
- Verification:
- Migration apply: `Get-Content -Raw "supabase/migrations/20260603000007_add_referral_tracking.sql" | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (applied, idempotent)
- Migration registration: previously registered
- DB smoke: `Get-Content -Raw "supabase/snippets/verify_referral_tracking_smoke.sql" | docker exec -i supabase_db_salam-queue-flow psql -v ON_ERROR_STOP=1 -U postgres -d postgres` (6 PASS notices, rollback)
- Unit tests: `pnpm --filter web exec vitest run --reporter verbose src/services/referrals/ReferralService.test.ts` (4/4 passed)
- Strict typecheck (web): `npx tsc --noEmit` (passed)
- Production build (web): `npx vite build` (passed)

## AI Chatbot Agent Hardening — Phase B (Typed streaming transport)

Context: Re-tested committed Phase A chat after Groq quota reset (2026-06-17). Found the chat-api
container was running STALE 18h-old streaming code (Windows/Docker watcher never reloaded after the
source was reverted to the res.json envelope). Restarted container → committed Phase A verified working
(ok / no_results / booking-guidance all correct, typed doctor_cards w/ code-minted bookingHref).

Decision (user): drop the Mock path from the UI under `useChat`. chat-api keeps its server-side no-key
mock responder so "runs with no key" is preserved. AI SDK v5.0.194 signatures verified against installed
source (toUIMessageStreamResponse, createUIMessageStream, pipeUIMessageStreamToResponse for Express,
UIMessageStreamWriter.write/merge, UIMessage<METADATA,DATA_PARTS,TOOLS>).

### Backend (chat-api) — self-verifiable via curl  ✅ DONE
- [x] Shared `QueueMedUIMessage = UIMessage<never, { cards: unknown; outcome: ToolOutcomeKind }>`
      (chat-api stays decoupled from core; web validates against DiscoveryCards).
- [x] agent.ts: `createUIMessageStream({ execute, onError, onFinish })` +
      `pipeUIMessageStreamToResponse({ response: res, stream })`. execute: `streamText(...)`,
      `writer.merge(result.toUIMessageStream())`, `await result.finishReason`, then
      `writer.write({type:'data-cards'|'data-outcome'})` from the mcp session accumulators.
- [x] No-key mock path emits a single text part via the same stream (writeText helper).
- [x] mcp.ts unchanged: parseCards capture + outcome classification stay internal; cards reach the
      client as a typed data part now, not via the JSON envelope.
- [x] Curl-verified: 45 text-delta frames before finish; `data-cards` (full doctor card + bookingHref)
      + `data-outcome:"ok"`. chat-api tests 25/25; tsc clean.
- [~] DROPPED silent Groq retry on this path (incompatible with live streaming — can't un-send a partial
      stream); transient error degrades to a friendly message via stream `onError`.

### Frontend (web) — IMPLEMENTED; needs user browser test
- [x] Added `@ai-sdk/react@2.0.206` + `ai@5.0.204` to apps/web; installed into the container volume via
      `docker compose exec web pnpm install --no-frozen-lockfile` (no full reseed — node_modules are
      named volumes, source bind-mounted).
- [x] New `useQueueMedChat` hook: `useChat` over `DefaultChatTransport`, async JWT via
      `prepareSendMessagesRequest` (flattens UI history → `{role,content}`), + `readMessage` helper.
- [x] MorphChat.tsx + ChatWindow.tsx use the hook; render text parts + `data-cards` → DiscoveryCardsView.
- [x] Deleted dead ApiChatService/MockChatService/createChatService; trimmed ChatService barrel.
- [x] web tsc clean; Vite re-optimized @ai-sdk/react + ai; app serves 200; hook transforms cleanly.
- [x] Masked raw provider errors at the `toUIMessageStream({ onError })` boundary (browser was seeing the
      raw Groq 400 JSON — the createUIMessageStream onError does NOT see merged-stream errors).
- [x] Client auto-retry (`regenerate` once per turn) for the transient tool-call glitch, restoring Phase A
      resilience under streaming; gated to RETRYABLE_ERROR only (capacity/rate-limit is NOT retried).
- [x] Distinct friendly messages: transient → "try again"; rate-limit/quota → "at capacity, try again in a
      few minutes" (`friendlyError()` classifier). Verified both via curl.
- [ ] **USER:** browser-test once Groq daily quota resets — BLOCKED 2026-06-17: Groq free-tier TPD limit
      (100k tokens/day) exhausted again mid-test; every turn masks to the capacity message. Code verified
      working via curl BEFORE exhaustion (45 text-deltas + doctor card + data-outcome:ok). Resets ~daily.
      Re-test: "find a doctor in Casablanca" (cards + streaming), a no-results query, authed + anon.

### NOT building in Phase B
- No new MCP tools / business logic. No HITL gate (that's Phase C). No persistence/sessions.
- No rate limiting. No auth/RBAC changes. Card components unchanged — only their data source swaps.

### Patterns to mirror
- AI SDK v5 tool wrapper already in mcp.ts (tool()/jsonSchema). Outcome contract in outcomes.ts (unchanged).
- DiscoveryCards typed contract from @queuemed/core. Card render already in MessageBubble.

## Mock LLM for offline / zero-token development (2026-06-17)

Reason: Groq free-tier TPD (100k/day) exhausted repeatedly during browser testing, blocking Phase C dev.
Solution: a deterministic fake model that drives the REAL pipeline (MCP tools, auth, streaming, data parts,
and the upcoming HITL gate) — only the LLM's token output is faked. Zero provider tokens.

- [x] `apps/chat-api/src/mockModel.ts`: plain `LanguageModelV2` object (NOT `ai/test`'s MockLanguageModelV2 —
      that pulls `msw` in at runtime → ERR_MODULE_NOT_FOUND). Uses `simulateReadableStream` from core `ai`.
      Rule-based `decide()`: doctor/clinic intent → real `doctor_search`/`clinic_search` tool call; post-tool
      step → text summary honoring the real outcome (found / no-results / forbidden); else guidance/fallback.
- [x] `llm.ts`: `case "mock"` → `{ model: createMockModel(), label: "mock:rule-based" }`. Toggle via
      `LLM_PROVIDER=mock` (added `@ai-sdk/provider` devDep for the V2 types).
- [x] Activated: `.env` LLM_PROVIDER=mock; `.env.example` documents the option. Recreate chat-api to apply
      env: `docker compose up -d --no-deps --force-recreate chat-api`.
- [x] E2E curl verified: "find a doctor in Casablanca" → real MCP doctor_search → real card (Dr. Benjelloun
      + code-minted bookingHref) + data-outcome:ok + streamed text. Clinic + booking + fallback paths OK.
- [x] `mockModel.test.ts` (5 tests) locks routing. chat-api 30/30 tests + tsc clean.
- Switch back to the real LLM anytime: set `LLM_PROVIDER=groq` in `.env` and recreate chat-api.

### Phase B + mock — current state
Phase B (typed streaming transport) is code-complete and now fully browser-testable with ZERO tokens via the
mock. Ready to start Phase C (HITL booking-confirmation gate) — booking_create/booking_cancel as
client-approved tool calls. The mock can emit a booking tool call to exercise the HITL round-trip offline.

## AI Chatbot Agent Hardening — Phase C (HITL mutation gate) — 2026-06-17

booking_create / booking_cancel are now client-approved tool calls: surfaced to the UI without
auto-execution, run by the server ONLY after an explicit Confirm. Structural guarantee, not a prompt.

### Contract change
- Client now sends FULL UIMessages (not flattened {role,content}) so tool calls + approval results reach
  the server. chat-api uses `convertToModelMessages`. index.ts validates `{ role, parts[] }`.

### Backend
- [x] mcp.ts: `HITL_TOOLS = {booking_create, booking_cancel}` registered WITHOUT `execute` (so a call
      surfaces for confirmation); shared `runTool`; `session.executeTool(name,args)` for post-approval run.
- [x] hitl.ts: `processApprovedBookings(messages, session)` — executes only `{approved:true}` gated calls,
      rewrites the part output to the real result; declined → "not performed"; idempotent. Handles static
      (`tool-<name>`) + `dynamic-tool` wire shapes.
- [x] agent.ts: runs processApprovedBookings BEFORE generating, then convertToModelMessages → stream.
- [x] mockModel.ts: emits a real `booking_create` call on booking intent when the tool is available (authed).
- [x] hitl.test.ts (6) + mockModel booking tests (2). chat-api 38/38 + tsc clean.

### Frontend
- [x] useQueueMedChat: send UIMessages; `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls`
      (auto-resubmit after confirm); typed QueueMedTools so `addToolResult` is type-safe; `readMessage` now
      also extracts `bookingCalls`.
- [x] BookingConfirmCard.tsx: Confirm / Keep-it buttons → addToolResult({approved}); shows resolved state.
- [x] MorphChat + ChatWindow render booking calls via the confirm card. web tsc clean; app serves 200.

### Verified end-to-end (mock + real JWT, demo.patient@queuemed.test)
- [x] GATE: authed "book an appointment" → `tool-input-available` for booking_create, NO execution
      (no tool-output, no MCP booking log). ✅ no mutation without confirm.
- [x] APPROVAL: resend with output:{approved:true} → `[chat-api] HITL: executed 1 approved mutation(s)`
      → MCP runs booking_create. ✅ executes only after approval.
- [ ] **USER:** browser-test (signed in): "book an appointment" → confirm card → Confirm → booking runs;
      Keep-it → not performed. Discovery (cards) + no-results still work.

### Known separate issue (NOT Phase C / not the gate)
- The seed booking via MCP fails at `BookingService.bookAppointmentForMode`:
  `DatabaseError: Failed to check appointment availability` (any date). Pre-existing booking-service/RPC
  issue on the MCP path — affects real chat bookings too, independent of the HITL gate. Worth a separate look.

## BookingService availability error — root-cause fix (2026-06-17)

Symptom: chat booking failed at `BookingService.bookAppointmentForMode` →
`DatabaseError: Failed to check appointment availability` ("Could not find the function
public.check_appointment_availability(p_appointment_date, p_clinic_id, p_scheduled_time) in the schema cache").

Root cause (contract drift): migration `20260403000000_doctor_first_booking_path` made the booking RPCs
doctor-first (require `p_staff_id`). The CORE booking path (used by MCP/chat) was never updated — a stale
duplicate of the WEB booking path (which WAS updated and passes staffId). Core `createAppointmentForMode`
passed `p_staff_id: null`; `checkAvailability` called a dead 3-arg signature.

Fix (backend-first, mirror the working web copy):
- [x] core `BookingRequest`: add required `staffId`.
- [x] core `BookingRepository`: `checkAvailability` + `checkAvailabilityForMode` + `createAppointmentForMode`
      + `createAppointment` now pass `p_staff_id`.
- [x] core `BookingService.bookAppointment(ForMode)`: pass `request.staffId`.
- [x] MCP `booking_create` tool: `staffId` now a required input (doctor-first; from doctor_search).
- [x] mock: emits booking_create with the seed doctor's staffId.

Verified: chat approval → MCP "Appointment created successfully", outcome `ok`, DB row has the right staff_id
(then cleaned up). Tests: core 14, mcp-server 146, chat-api 38, web booking 6, web tsc — all green.

Follow-up debt (not fixed): booking logic is DUPLICATED (core vs web). True SSOT = collapse to one impl.

## Booking SSOT consolidation + simplify (2026-06-17)

Goal: one booking implementation. Booking logic was DUPLICATED — web `apps/web/src/services/booking/*`
(used by the UI) and core `packages/core/src/...booking/*` (used by chat/MCP) drifted independently.

Approach (chosen with user): thin facade (lowest risk on the un-browser-testable booking UI).
- [x] Core is the SSOT: `createServiceContainer({ supabaseClient })` already existed (designed for web + MCP).
- [x] Core parity: core service `getAvailableSlotsForMode` now takes `staffId` (repo already did).
- [x] Web `BookingService.ts` → ~30-line facade delegating to core (wired to the web supabase client);
      web public API + `./types` + all consumers unchanged. Only nominal `QueueMode` enum/union gap →
      cast at the facade boundary (runtime values identical).
- [x] Deleted web `BookingRepository.ts` (−308 lines) and the web BookingService body (−~440 lines).
- [x] Simplify: removed the now-dead non-mode booking path (core service `bookAppointment` +
      `getAvailableSlots`; core repo `createAppointment` + `getAvailableSlots`; facade `bookAppointment` +
      `getAvailableSlots`) — verified zero callers/tests.

Verified: tsc green (core, mcp-server, chat-api, web); tests core 14 / mcp 146 / chat-api 38 / web booking 6;
chat booking e2e books successfully (real JWT); app serves 200. Net ~ −600 lines, single booking source.

- [ ] **USER:** browser-test the WEB booking flow (BookingFlow / BookAppointmentDialog) once — the facade is
      tsc+test-verified but the live UI booking is the one path I can't exercise myself.

---

## Dead event-bus publish removal + BaseService DRY (2026-06-17)

### Changes
**Spec 1 — Removed dead event-bus publish calls:**
- `BookingService`: Removed `BookingCreatedEvent` + `BookingFailedEvent` interfaces, `publishBookingCreated()` + `publishBookingFailed()` private methods, and all 3 call sites in `bookAppointmentForMode`. `IEventBus` import and constructor param kept for future wiring.
- `QueueService`: Removed `PatientCheckedInEvent` + `PatientCalledEvent` interfaces, inline `eventBus.publish()` blocks in `checkInPatient` and `callNextPatient`. `IEventBus` import and constructor param kept.
- `DomainEvent` removed from imports (was only used by the deleted event interfaces).

**Spec 2 — DRY service logging boilerplate with BaseService:**
- Created `packages/core/src/services/BaseService.ts` with `executeWithLogging<T>()` and `executeVoid()` helpers that handle setContext/debug/error/clearContext lifecycle.
- All 4 core services now extend `BaseService` (BookingService, QueueService, ClinicService, PatientService).
- `28 setContext` calls were reduced to `3` (only `bookAppointmentForMode`, `manuallyAssignTimeSlot`, `getQueueMode` keep manual try/catch — these have custom error return types).
- `25 executeWithLogging`/`executeVoid` usages across all services.
- `subscribeToSlotUpdates` and `subscribeToQueueUpdates` left as-is (no try/catch).

### Verification
- `tsc --noEmit`: core, MCP server, web — all clean
- Core tests: 14/14 passed
- MCP tests: 146/146 passed  
- Web tests: 206/206 passed (32 files)
- **Total: 366 tests pass across all packages**

### Files changed
| Package | File | Change |
|---------|------|--------|
| core | `services/BaseService.ts` | NEW — abstract base with `executeWithLogging`/`executeVoid` |
| core | `services/booking/BookingService.ts` | Extends BaseService; removed event interfaces/publish helpers; 3 methods via executeWithLogging |
| core | `services/queue/QueueService.ts` | Extends BaseService; removed event interfaces/publish calls; 9 methods via executeWithLogging |
| core | `services/clinic/ClinicService.ts` | Extends BaseService; 7 methods via executeWithLogging |
| core | `services/patient/PatientService.ts` | Extends BaseService; 5 methods via executeWithLogging |
