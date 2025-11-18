# Salam Queue Flow – Codebase Reference

> Single source of truth for how the project is wired together. Use this when onboarding new contributors, planning features, or validating architectural decisions.

## 1. Quick Facts
- **Frontend stack:** Vite + React 18 + TypeScript + Tailwind CSS (with shadcn/ui components and Radix primitives).
- **State & data:** React Query for server state, lightweight custom hooks for auth/queue, Supabase JS client for persistence.
- **Backend touch points:** Supabase Database (Postgres), Supabase Edge Functions, external ML service for wait-time predictions.
- **Testing & quality:** Vitest + Testing Library, ESLint 9, SWC React plugin, Tailwind + PostCSS tooling.
- **Package scripts:** `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm preview`.

## 2. Repository Layout (High-Level)
```
├── docs/                         # Architecture notes, analyses, and this reference
├── public/                       # Static assets served by Vite
├── src/
│   ├── assets/                   # Images & static files
│   ├── components/               # UI building blocks (marketing, booking, clinic tooling, auth)
│   ├── hooks/                    # Reusable React hooks (auth, queue, search, toasts, etc.)
│   ├── i18n/ + locales/          # i18next setup and translation JSON (en, fr, ar)
│   ├── integrations/supabase/    # Generated Supabase client + shared types
│   ├── layouts/                  # Patient and clinic shells wrapping nested routes
│   ├── pages/                    # Route-level components (public, patient, clinic, auth)
│   ├── services/                 # Domain logic (queue, clinic, staff, notification, ML, etc.)
│   ├── test/                     # Vitest setup & utilities
│   └── main.tsx / App.tsx        # App bootstrap & routing
├── supabase/                     # Edge functions + SQL migrations
├── package.json / pnpm-lock.yaml # Dependencies & scripts
├── tsconfig*.json                # TypeScript + path aliases
└── vite.config.ts                # Vite + SWC + component tagging config
```

## 3. Build & Tooling
- **Vite config (`vite.config.ts`):** Enables React SWC plugin for fast HMR; binds dev server to `::` on port 8080; registers `@` alias to `src/`; activates `lovable-tagger` in development to label components automatically.
- **TypeScript configs:** Root `tsconfig.json` delegates to `tsconfig.app.json`/`tsconfig.node.json` and defines `@/*` alias. `strictNullChecks` currently disabled to ease migration of legacy Supabase types.
- **Styling:** Tailwind CSS with `tailwind.config.ts`, `postcss.config.js`, and `App.css` / `index.css`. shadcn/ui and Radix primitives provide accessible widgets.
- **Lint/Test scripts:**
  - `pnpm lint` → ESLint 9 with React Hooks + React Refresh plugins.
  - `pnpm test` / `test:watch` / `test:ui` / `test:coverage` → Vitest runner (jsdom) + Testing Library + `@vitest/ui` as needed.
  - `pnpm build` → Vite production build.

## 4. Application Bootstrap
1. `src/main.tsx`
   - Imports i18n configuration (`./i18n/config`).
   - Initializes global queue handlers (`initializeQueueEventHandlers`) and the ML/queue `waitTimeEstimationOrchestrator` before rendering.
   - Mounts `<App />` inside `<StrictMode>`.
2. `src/App.tsx`
   - Wraps everything in `QueryClientProvider`, `BrowserRouter`, and Radix `TooltipProvider`.
   - Renders both the shadcn Toaster and the Sonner Toaster for different notification styles.
   - Declares all routes and guards using React Router v6 `<Routes>` / `<Route>` / nested `<Outlet>`.

## 5. Routing & Layouts
- **Public/Patient:**
  - `PatientLayout` wraps `/` routes. It renders hero navigation, translation switcher, and auth-aware buttons. Nested routes include:
    - `/` → `pages/Index.tsx` (clinic directory landing).
    - `/welcome` → marketing/mission page.
    - `/clinic/:clinicId` → `ClinicDetailView` for deep dive.
    - `/booking/:clinicId` → multi-step booking flow.
    - Protected sub-routes (guarded by `ProtectedRoute`): `my-appointments`, `patient/profile`, `patient/queue/:appointmentId`.
- **Clinic/Admin:**
  - `ClinicLayout` handles `/clinic/*` routes, fetching the current clinic via Supabase depending on owner vs staff roles. Nested pages: `dashboard`, `queue`, `calendar`, `team`, `settings`, `profile` (role-based visibility).
- **Auth & Onboarding:** Dedicated pages under `pages/auth/*` (login, signup, staff signup, onboarding flows, invitation acceptance).
- **Guarding:**
  - `ProtectedRoute` uses `useAuth()` to check session state, display a loading fallback, and redirect unauthenticated users to `/auth/login`.

## 6. Key UI Components
- **Marketing:** `components/Hero`, `Features`, `CTA`, etc., power the landing sections.
- **Booking:** `components/booking/*` contains `ClinicDirectory`, `ClinicDetailView`, and `BookingFlow` (search filters, date pickers, walk-in support). `useClinicSearch` drives the cards.
- **Clinic Tools:** `components/clinic/*` houses `EnhancedQueueManager`, `AddWalkInDialog`, `BookAppointmentDialog`, `EndDayConfirmationDialog`, `OrdinalQueueList`, `TimeGridQueueList`. These rely heavily on `useQueueService` for live data.
- **Shared UI:** `components/ui/*` (shadcn wrappers) plus special components like `LanguageSwitcher`, `Navbar`, and `Footer`.

## 7. Hooks & State Utilities
- **`useAuth`**: Centralized Supabase auth wrapper. Exposes `user`, `session`, `loading`, derived booleans (`isClinicOwner`, `isStaff`, `isPatient`), and actions (`signIn`, `signUp`, `signOut`). Reads `user_roles`, `clinic_staff`, and `profiles` to hydrate context.
- **`useQueueService`**: High-level hook wrapping `QueueService`. Maintains today’s schedule per staff member, listens to queue domain events via `eventBus`, provides mutations (create appointment, call next, mark absent/returned, check-in, complete appointment, reorder).
- **`useClinicSearch`**: Debounces user input, calls Supabase RPC `search_clinics`, caches results for 5 minutes, and keeps stale data for smoother UX.
- **Utility hooks**: `useDebounce`, `useToast` (shadcn toast helpers), `use-mobile`, `useFavorite`, `useClinicSearch`, `useQueueService`, `useRating`, `useUnclosedDays` to encapsulate domain-specific logic.

## 8. Service Layer Pattern
Every domain module follows: **Service → Repository → Supabase**.

### 8.1 Queue Domain (`src/services/queue`)
- **`QueueService`**
  - Fetches daily schedules (`getDailySchedule`) clinic-wide by default (via `QueueRepository.getDailySchedule` -> RPC `get_daily_schedule_for_clinic`).
  - Creates appointments through `createQueueEntryViaRpc` (handles walk-ins, guest patients, manual slotting).
  - Operational commands: `callNextPatient`, `checkInPatient`, `markPatientAbsent`, `markPatientReturned`, `completeAppointment`, `reorderQueue`, `cancelAppointment`.
  - Emits domain events using `QueueEventFactory` + `eventBus` for each change.
  - Records actual wait/service durations into analytics tables via `QueueRepository.recordActualWaitTime` (Supabase RPC `record_actual_wait_time`).
- **`QueueRepository`**
  - Encapsulates all Supabase queries/RPCs (daily schedule, queue overrides, absent patients, wait-time predictions, feature snapshots, clinic estimation config, booked slot lookups).
  - Provides typed mapping from raw rows to `QueueEntry` domain models.
- **Handlers & Events**
  - `services/queue/events` define event payloads and types.
  - `services/queue/handlers/QueueEventHandlers.ts` currently logs stub notifications (will call `NotificationService`).

### 8.2 ML & Estimation (`src/services/ml`)
- **`WaitTimeEstimationOrchestrator`** subscribes to queue domain events (patient called/check-in/absent/returned/status change/position change/added). It buffers disruptions per clinic, debounces recalculation, and asks `waitTimeEstimationService` to update predictions only when necessary.
- **`WaitTimeEstimationService`** builds estimation context (appointment + clinic config + queue snapshot + staff info + historical metrics) and runs estimator chain: `MlEstimator` → `RuleBasedEstimator` → `HistoricalAverageEstimator`. Results, confidence, and feature hashes are persisted through `QueueRepository.recordWaitTimePredictions`.
- **`MlApiClient`** is a thin wrapper around Supabase Edge Function `predict-wait-time`, which proxies requests to the external ML service, ensuring the frontend never handles sensitive data or feature engineering.
- **`DisruptionDetector`** is used client-side (e.g., `MyQueue`) to decide whether to show scheduled times or predicted ETAs based on lateness, absences, overrides, or unusual durations.

### 8.3 Clinic & Staff Services
- **`ClinicService`** fetches clinics by ID/owner, updates settings (hours, buffer, appointment types), and maps DB rows to typed domain objects.
- **`StaffService`** manages clinic staff membership (fetch by user/clinic, add/remove/update, expose working hours/specialization metadata).

### 8.4 Patient & Favorites
- **`PatientService`** resolves registered vs guest patients by phone number, supports CRUD on profiles and guests.
- **Favorites (`services/favorite`)** keep patient-clinic bookmarks, powering the heart/favorite UI in `ClinicDirectory`.

### 8.5 Notifications & Analytics
- **`NotificationService`** creates `notifications` rows, renders templates (custom per clinic or default Arabic strings), and invokes Edge Functions (e.g., `send-sms`) to deliver messages. Currently SMS is wired; email/WhatsApp/push methods store placeholder records awaiting provider hookups.
- **`QueueSnapshotService`** periodically captures counts/wait metrics per clinic via Supabase function `record_queue_snapshot`, supporting analytics dashboards and ML datasets.

## 9. Event Bus & Domain Events
- **`eventBus` (`services/shared/events/EventBus.ts`)** is an in-memory pub/sub with history tracking, used exclusively on the client.
- Queue service actions publish events such as `PATIENT_ADDED_TO_QUEUE`, `PATIENT_CALLED`, `PATIENT_MARKED_ABSENT`, `PATIENT_RETURNED`, `APPOINTMENT_STATUS_CHANGED`, `QUEUE_POSITION_CHANGED`, etc.
- Subscribers:
  - **Notification Handlers**: currently log placeholders; future work plugs in `NotificationService` to send SMS/WhatsApp/push.
  - **Wait Time Estimation Orchestrator**: recalculates predictions when disruptions occur and runs periodic checks every 5 minutes for overruns.

## 10. Supabase Integration
- **Client:** `src/integrations/supabase/client.ts` uses `createClient<Database>()` with env vars `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`. Local storage stores auth sessions with auto-refresh enabled.
- **Generated Types:** `src/integrations/supabase/types.ts` (not shown above) provide typed access to tables/RPC outputs.
- **RPCs & Functions Used:**
  - `get_clinic_from_staff`, `get_daily_schedule_for_clinic`, `get_daily_schedule_for_staff`
  - `create_queue_entry_via_rpc` (called inside repository)
  - `record_actual_wait_time`, `record_queue_snapshot`
  - `search_clinics`
  - `get_clinic_estimation_config`
- **Edge Function:** `supabase/functions/predict-wait-time/index.ts` is a thin proxy; it accepts `{ appointmentId }`, fetches `ML_SERVICE_URL` from env, forwards the request, and returns `prediction { waitTimeMinutes, confidence, mode, features }`.
- **Schema Highlights:** (See supplied SQL in user prompt for full definitions.)
  - Core tables: `appointments`, `clinic_staff`, `clinics`, `profiles`, `guest_patients`.
  - Queue metadata: `queue_overrides`, `queue_snapshots`, `absent_patients`, `appointment_events`, `appointment_metrics`.
  - Notifications: `notifications`, `notification_templates`, `notification_analytics`, `clinic_notification_budgets`.
  - Patient engagement: `patient_clinic_history`, `patient_favorites`, `clinic_ratings`.
  - ML features: `wait_time_feature_snapshots`, `wait_time_predictions`.

## 11. Patient Experience Flow
1. **Browse & Filter:** `ClinicDirectory` uses `useClinicSearch` (RPC) with filters for city, specialty, rating, working hours, and favorites.
2. **View Clinic:** `ClinicDetailView` shows summary, photos, services, and CTA to start booking.
3. **Book Appointment / Walk-In:** `BookingFlow` collects patient details, time slot, appointment type, and calls queue service endpoints via `useQueueService` / dedicated booking services.
4. **Monitor Queue:** `MyQueue` fetches the `QueueEntry` via `queueService.getQueueEntry`, subscribes to realtime updates (`supabase.channel('my-queue-updates')`), and displays scheduled vs predicted times using `DisruptionDetector` logic. Patients no longer need manual check-in; staff “Call Next” now timestamps `checked_in_at`.

## 12. Clinic Experience Flow
1. **Dashboard (`ClinicDashboard`):** Aggregates schedule data via `useQueueService`, presenting hero stats, quick actions, and queue highlights.
2. **Queue Management (`ClinicQueue` + `EnhancedQueueManager`):**
   - Determines `clinicId` + `staffId` via `ClinicService` and `StaffService`.
   - `EnhancedQueueManager` controls queue actions:
     - `Call Next` (only enabled if someone is present or auto-eligible).
     - `Check In`, `Mark Absent`, `Return to Queue`, `Complete Appointment`.
     - Visual sections for waiting patients, current patient, absent list with grace periods.
   - Stats updated through `onSummaryChange` callback.
3. **Add Walk-Ins / Appointments:** `AddWalkInDialog` and `BookAppointmentDialog` collect patient info and call queue service creation endpoints. Guest patients are handled automatically.
4. **End Day:** `EndDayConfirmationDialog` helps finalize day status, trigger closure analytics, and potentially record snapshots.

## 13. ML & Analytics Data Flow
1. **Disruption triggers** (absences, late arrivals, manual overrides, long durations, emergency inserts) are captured via queue events.
2. **Wait Time Estimation Orchestrator** buffers these disruptions and invokes `WaitTimeEstimationService` only after a debounce window (2s) to avoid thrashing.
3. **Estimation context** gathers raw data from Supabase (appointments, staff, historical metrics) and chooses estimator strategy.
4. **Prediction output** is written back to `appointments.predicted_wait_time`, `predicted_start_time`, `prediction_mode`, etc., plus `wait_time_predictions` for analytics.
5. **Ground truth labels** (actual wait + service duration) recorded when `completeAppointment` runs; these feed ML training via `appointment_metrics` and `wait_time_feature_snapshots`.
6. **Queue snapshots** (counts, wait averages, staff utilization) stored regularly for dashboards and training windows.

## 14. Internationalization & Accessibility
- **i18next setup:** `src/i18n/config.ts` loads translation resources for EN/FR/AR, persists chosen language in `localStorage` key `i18nextLng`, and auto-detects from browser settings.
- **`LanguageSwitcher`:** toggles languages inline in the layout header.
- **Radix UI primitives** + shadcn components ensure accessible focus management and keyboard support.

## 15. Testing & Quality Assurance
- **Vitest** config lives in `vitest.config.ts` (shared across unit/component tests). `test/setup.ts` wires Testing Library helpers.
- **Testing utilities:** `src/test/utils` hold custom render helpers (providers, router contexts).
- **Recommended strategy:**
  - Unit test service-layer logic (QueueService, ClinicService, etc.) using Vitest mocks for repositories.
  - Component tests for key UI flows (`EnhancedQueueManager`, `ClinicDirectory`), mocking `useQueueService` / React Query caches.
- **Static analysis:** run `pnpm lint` before commits; ESLint ensures hooks rules and identifies unused vars.

## 16. Documentation & Knowledge Base
- Existing docs (under `docs/`):
  - `ARCHITECTURE_CLEAN.md` → explains the “frontend = UI only, backend/ML = logic” principle and lists removed legacy estimators.
  - `IMPLEMENTATION_SUMMARY.md` → walk-through of schema cleanup & simplified check-in flow.
  - `QUEUE_MANAGEMENT_DEEP_ANALYSIS.md` → outlines real-world gaps, Moroccan context, and roadmap opportunities.
  - `ACTUAL_FIELD_USAGE_ANALYSIS.md`, `ML_DESIGN_SUMMARY.md`, etc., provide deeper analyses on data, ML, and product direction.
- This document (`CODEBASE_REFERENCE.md`) should be updated whenever architecture or tooling shifts.

## 17. Extending the Project
1. **Respect service boundaries:** Add new Supabase calls inside repositories, expose intent-driven methods through services, and call them via hooks/components.
2. **Publish events:** If you change queue state, emit the appropriate `QueueEventType` so orchestrators and notification handlers stay in sync.
3. **Keep frontend thin:** Avoid data crunching in React; leverage Supabase RPCs or Edge Functions. Follow the Clean Architecture guidelines from `ARCHITECTURE_CLEAN.md`.
4. **Translations:** Any new UI strings should live in the locale JSON files; wire them via `useTranslation`.
5. **Styling:** Use existing shadcn components and Tailwind tokens to maintain visual consistency.
6. **Testing:** For substantial features, add Vitest coverage (service + component) and keep `test/setup.ts` utilities handy.

## 18. Reference Checklist
- [ ] Supabase env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) configured.
- [ ] `ML_SERVICE_URL` set for Edge Function to proxy predictions.
- [ ] Event handlers initialized (`initializeQueueEventHandlers`, `waitTimeEstimationOrchestrator.initialize`).
- [ ] React Query `QueryClient` provided at the root.
- [ ] i18n resources loaded before rendering.
- [ ] Tailwind styles imported in `main.tsx`.
- [ ] Lint/test scripts run before pushing.

---
Need more depth on a module? See the corresponding service/repository under `src/services`, or consult the domain-specific docs already in `docs/`.
