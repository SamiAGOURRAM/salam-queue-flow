# QueueMed Technical Architecture Strategy

> Living document — the **technical** north star. Commercial/market strategy lives elsewhere; this file is only about how the system is structured, why, and how we keep it clean as it grows.

---

## 0. Scope of this document

This is not a business plan. It answers three engineering questions:

1. **What architectural pattern do we commit to**, so that auth, database, messaging, and the queue engine are all swappable behind stable interfaces?
2. **How is the AI agent structured** relative to the rest of the system, and what security property does that buy us?
3. **Where is the current code duplicated / drifting**, and what is the concrete plan to consolidate it (DRY) without a rewrite?

Verified open-source survey conclusions are kept (condensed) at the end because they're a *technical* build-vs-fork decision — but the bulk of this doc is about our own internal structure.

---

## 1. The pattern we commit to: Hexagonal (Ports & Adapters)

**Decision: QueueMed's business logic lives in `@queuemed/core` and depends only on *ports* (interfaces). Every external concern — database, auth, logging, events, messaging, queue — is an *adapter* that implements a port. No business logic ever imports Supabase, a provider SDK, or a transport directly.**

This is not aspirational — we already started it and should now finish it *consistently*:

- `packages/core/src/ports/` already defines repository ports, auth ports, a logger port, and an event-bus port.
- `packages/core/src/ports/database.ts` was deliberately emptied — the DB is no longer a port of its own; the **repository interfaces** (`IBookingRepository`, `IQueueRepository`, …) are the true data ports, and the Supabase clients are their adapters.
- `packages/core/src/container.ts` is the single composition root: apps pass in their concrete `SupabaseClient` (+ optional logger/event bus) and receive a fully-wired `ServiceContainer`. Both the web app and the MCP server build the *same* services from this one factory.

### Why hexagonal is the right call here (and not just fashion)

Your stated requirement is: *"use auth, db, messaging, queue interchangeably."* That requirement **is** the definition of Ports & Adapters. Concretely it gives us:

| Concern | Port (interface in core) | Today's adapter | Swappable to… |
|---|---|---|---|
| Persistence | `IBookingRepository`, `IQueueRepository`, `IClinicRepository`, `IPatientRepository` | Supabase Postgres | Raw Postgres / Prisma / a FHIR-backed store / an in-memory fake for tests |
| Auth / identity | `auth/*` ports | Supabase Auth | Clerk / Auth0 / Keycloak / a test stub |
| Logging | `ILogger` | `ConsoleLogger` | Winston / Pino / OpenTelemetry |
| Events | `IEventBus` | `InMemoryEventBus` | Redis pub/sub / NATS / Postgres LISTEN-NOTIFY |
| Messaging (SMS/WhatsApp/email/push) | `INotifier` (✅ added) | web `NotificationService` (Edge Functions) | Twilio / a local SMTP fake / `NoOpNotifier` for offline dev |
| Queue engine | service methods on `QueueService` (the domain logic) backed by `IQueueRepository` | Supabase RPCs | any store implementing the repository contract |

The litmus test for whether the architecture is honest: **you can instantiate the entire core with in-memory fake adapters and run the full booking + queue domain logic in a unit test with no network, no Supabase, no LLM.** Every gap from that ideal is technical debt this doc tracks.

### The one rule that keeps it clean

> A symbol from `@supabase/*`, a provider SDK, an HTTP framework, or `process.env` must **never** appear inside `packages/core/src/services/**`. If core needs it, it's a port; the app supplies the adapter at the composition root.

This is enforceable with an ESLint `no-restricted-imports` rule scoped to the services directory — cheap to add, and it makes "interfaceable" a compile-time guarantee instead of a code-review hope (mirrors our global lesson on branding security-sensitive values to make illegal states unrepresentable).

---

## 2. The AI agent is not a privileged actor — it has tool parity with the web app

This is the single most important architectural clarification, and it *reverses* the usual "LLM with write access is dangerous" concern.

**The LLM strictly invokes MCP tools that are also exposed to the web app. The agent has no capability the patient does not already have through the normal UI.** The MCP server is a *thin transport* over the same `@queuemed/core` services the React app calls. Anything the agent can do, the patient could do by clicking — and, crucially, **authorization is enforced in the data layer (RLS + scoped per-request JWT), not by which tools the model can see.**

That gives us a clean security property:

> **Agent parity.** The agent's blast radius ⊆ the authenticated user's blast radius. The LLM is a *natural-language front-end to existing, already-authorized operations*, not a new privilege boundary.

Why this matters architecturally:

- **No second authorization model to keep in sync.** RLS is the SSOT for "who can do what." The agent inherits it because it runs every tool with the caller's own JWT. (This is exactly our global lesson: *authorize at the data layer, never by tool visibility.*)
- **The HITL gate on mutations (`booking_create` / `booking_cancel`) is defense-in-depth, not the primary control.** Even with the gate removed, RLS still bounds the agent. The gate exists for UX/consent on irreversible actions, not to prevent privilege escalation.
- **The "lethal trifecta" is partially defused.** The agent reads untrusted input and touches private data, but it has *no externally-distinct exfiltration channel* — its outbound actions (e.g. notifications) are the same RLS-gated operations the user could trigger themselves. The remaining watch item is prompt-injection causing an *in-scope but unwanted* action (e.g. cancelling the wrong appointment), which is precisely what the HITL gate covers.

**Design consequence:** keep the MCP tools as a 1:1 reflection of core service methods. The moment a tool does something the web app *can't*, agent parity breaks and we've quietly created a privileged path. New rule for the MCP server: **a tool may only call `@queuemed/core` services — never a repository, a raw Supabase query, or a service-role key directly.** (Audit item — see §5.)

---

## 3. Should we adopt `iii` (iii-hq/iii) as the structural backbone? — No.

I evaluated it because the goal ("compose auth/db/messaging/queue interchangeably") sounds adjacent. It isn't the right tool here.

**What `iii` is:** a polyglot distributed-systems *runtime* — a Rust engine plus SDKs (JS/TS, Python, Rust, Go) built on three primitives: **Workers** (processes that register capabilities), **Functions** (named units of work like `content::classify`), and **Triggers** (HTTP, cron, queue subscription, state change). It solves cross-language, cross-service composition + live discovery + observability for a *fleet of independent services*. ([github.com/iii-hq/iii](https://github.com/iii-hq/iii))

**Why it's the wrong fit for QueueMed right now:**

1. **License.** The **engine is Elastic License 2.0** (source-available, not OSI open-source); only the SDKs/CLI/console are Apache-2.0. Putting an ELv2 runtime at the *core* of a project whose identity is "open-source healthcare" is a real licensing constraint (notably the managed-service restriction), and it muddies the licensing story for any future contributor or self-hoster. ([engine README](https://github.com/iii-hq/iii/blob/main/engine/README.md))
2. **Scale mismatch.** `iii` exists to tame *many* polyglot services talking point-to-point. QueueMed is a TS monorepo: a React SPA, an MCP server, and a Chat API, all sharing one `@queuemed/core` and one Supabase. We have an in-process composition problem, not a distributed-orchestration problem. Introducing a Rust engine + worker registry would add an operational tier (the engine must run, be discovered, be observed) for zero current benefit.
3. **It competes with, doesn't complete, hexagonal.** Ports & Adapters already gives us swappable boundaries *in-process* with no runtime. `iii` would move those boundaries to a network runtime — strictly heavier, and it would pull business logic out of `core` into "functions," eroding the SSOT we're trying to consolidate toward.

**What to borrow conceptually (not as a dependency):** the **Function / Trigger** mental model is a nice articulation of "one named use-case, invoked by many transports." That's literally what a core service method already is — invoked by a React hook, an MCP tool, or (later) a cron Edge Function. Keep that framing; don't adopt the runtime. Revisit `iii` only if we ever genuinely split into polyglot services at a scale Docker Compose can't serve — which the broader plan explicitly defers.

---

## 4. Target shape (where consolidation is heading)

```
                         ┌──────────────────────────────┐
   React SPA  ─────────► │                              │
   (hooks)               │      @queuemed/core          │
                         │                              │
   MCP server ─────────► │   services/  (BUSINESS LOGIC)│
   (AI agent tools)      │   - BookingService           │  ◄── depends ONLY on ports
                         │   - QueueService             │
   Chat API  ──────────► │   - ClinicService            │
   (REST, later)         │   - PatientService           │
                         │                              │
                         │   ports/   (INTERFACES)      │
                         │   - I*Repository             │
                         │   - auth/*                   │
                         │   - ILogger / IEventBus      │
                         │   - INotifier  (to add)      │
                         └───────────────┬──────────────┘
                                         │ implemented by
                         ┌───────────────▼──────────────┐
                         │   adapters (per app/runtime)  │
                         │   - Supabase repositories     │
                         │   - Supabase Auth             │
                         │   - Edge-Fn / Twilio notifier │
                         │   - Console/OTel logger       │
                         │   - InMemory/Redis event bus  │
                         └───────────────────────────────┘
                  composition root: packages/core/src/container.ts
```

**Single source of truth = `@queuemed/core`.** SSOT means *one* copy, not two copies plus a drift-check (our standing lesson). Every duplicated implementation below is a violation to be deleted, not synced.

---

## 5. Current-state audit: what's clean vs. what's duplicated

**Clean (keep as the model for everything else):**
- The ports layer, the container, and `BookingService` are the reference for how a core service should look (depends on a repo port + event bus + logger, nothing else).
- The MCP server consuming `createServiceContainer` is the right shape *if* every tool routes through services (verify — see audit item A).

**Duplicated / drifting (the actual problem):**

The feedback flagged `createAppointment`, but the duplication is broader. **web's `apps/web/src/services/queue/QueueService.ts` (~974 lines) re-implements methods that already exist in `packages/core`'s `QueueService` and `BookingService`:**

| Web `QueueService` method | Already in core? | Action |
|---|---|---|
| `createAppointment(dto)` | overlaps `BookingService.bookAppointmentForMode` | **Consolidate** — one booking entry point in core (feedback item 1) |
| `getDailySchedule` | ✅ core `QueueService.getDailySchedule` | Delete web copy, call core |
| `getQueueEntry` | ✅ core `QueueService.getQueueEntry` | Delete web copy, call core |
| `checkInPatient` | ✅ core `QueueService.checkInPatient` | Reconcile (web adds `allowedStaffIds` scope) → push scope into core |
| `callNextPatient` | ✅ core `QueueService.callNextPatient` | Delete web copy, call core |
| `cancelAppointment` | ✅ core `QueueService.cancelAppointment` | Reconcile signature (`cancelledBy`/`reason`) → core |
| `reorderQueue` | ❌ web-only | **Port to core** (feedback item 2 — most general staff op) |
| `markPatientAbsent/Returned`, `resolveAbsentAppointment`, `autoMarkNoShow`, `startQueueBreak/endQueueBreak`, `callSpecificPatient`, `updateAppointmentPaymentStatus`, `getQueueStatusToken`, `getPublicQueueStatus` | ❌ web-only | Domain logic → migrate to core over time; pure presentation glue can stay |

**The risk this creates:** the web app and the MCP agent can take *divergent* code paths for "the same" operation. That directly threatens **agent parity** (§2): if the agent books via core and the UI books via web's `QueueService`, they can validate differently, and "the agent did something the UI wouldn't" becomes possible. Consolidation isn't cosmetic DRY — it's what *preserves the security property*.

---

## 6. Consolidation plan (DRY, no rewrite) — incremental & verifiable

Ordered by impact, each step independently shippable and type-checkable:

1. **Booking SSOT (feedback item 1).** Make `BookingService.bookAppointmentForMode` the *only* appointment-creation path. Reduce web's `QueueService.createAppointment` to a thin delegate (or delete it and have callers use the booking service via `createServiceContainer`). Reconcile the DTOs (`CreateQueueEntryDTO` vs `BookingRequest`) into one core type. **Verify:** existing booking unit tests + browser-test the web booking flow (feedback item 3 — still outstanding, must be exercised live, not just type-checked).

2. **Port `reorderQueue` to core (feedback item 2).** Move it onto core `QueueService` backed by `IQueueRepository`; web calls through. Add a unit test in core (confirm core has its own test runner before assuming the web/root runner picks it up — standing monorepo lesson).

3. **Collapse the duplicated queue reads/transitions.** Delete the web copies of `getDailySchedule`, `getQueueEntry`, `callNextPatient`; for `checkInPatient`/`cancelAppointment`, lift the extra web parameters (`allowedStaffIds` scoping, `cancelledBy`) into the core signatures so nothing is lost, then delete the web copies.

4. **Add the `INotifier` port.** Messaging is currently the least-abstracted concern (Edge Functions invoked ad hoc). Define `INotifier` in core; the Edge-Function/Twilio implementation becomes an adapter; offline dev gets a no-op/console notifier — closing the "messaging interchangeable" requirement and unblocking offline/CI runs (relevant given the Groq quota wall already blocks demos).

5. **Audit item A — MCP tool purity.** Grep the MCP server for direct `supabase`/repository/`service-role` usage inside tools; route every one through `@queuemed/core` services so agent parity (§2) holds by construction.

6. **Add the ESLint boundary rule** (§1) so core can't regress into importing Supabase/transport/env.

**What we are NOT doing** (explicit non-goals, to prevent scope creep):
- Not adopting `iii` or any external runtime.
- Not migrating the genuinely UI-specific web helpers (status tokens, payment-status UI glue) into core unless they carry real domain logic.
- Not introducing FHIR as a storage model (it remains an export concern).
- Not splitting into microservices / K8s.

---

## 7. Build-vs-fork (condensed, verified) — still don't fork

This was the original doc's core question and the conclusion holds up against current sources:

- **Ottehr** — open-source frontend, but its backend (**Oystehr**) is cloud-only/proprietary; running Ottehr as-is requires an Oystehr account. Forking it = adopting a proprietary backend. ([oystehr.com](https://oystehr.com/post/oystehr-ottehr)) **Don't fork.**
- **Medplum** — genuinely self-hostable, Apache-2.0, FHIR-native — but FHIR-first storage is heavy for operational queue/booking workflows. ([medplum.com/docs/self-hosting](https://www.medplum.com/docs/self-hosting)) **Borrow FHIR resource *shapes* for the eventual export adapter; don't adopt as datastore.**
- **OpenMRS / OpenEMR** — do have scheduling/queue features (so "nobody does the operational engine" is overstated), but legacy stacks (Java/PHP). **Borrow clinical workflow taxonomies (encounter types, problem lists), not code.**

**Net:** keep building on Supabase + `@queuemed/core`. The differentiator is not "first to do queues" — it's a *modern TS hexagonal core with an AI agent that has strict tool parity with the UI*. Hexagonal is what lets the FHIR-export and alternative-provider stories later be *adapters*, not rewrites.

---

## 8. Consolidation roadmap — divergence audit (2026-06-17)

Full sweep of `apps/web/src/services` vs `@queuemed/core`. The goal is one authoritative implementation per domain in core, with web as a thin facade — and every infrastructure concern (DB, queue, messaging, auth) behind a swappable port.

**Boundary status:** core is clean — no service imports Supabase, `process.env`, or web aliases. This is now **enforced by a test** (`packages/core/src/architecture.boundary.test.ts`); it fails CI if a core service ever reaches for infrastructure.

**Per-domain state:**

| Domain | Core | Web | State |
|---|---|---|---|
| Booking | ✅ `BookingService` | facade (52 ln) | **Done** — agent + UI share core |
| Clinic | ✅ `ClinicService` | facade (253 ln) | **Done** — web repo deleted, facade only |
| Queue | ⚠️ thin | rich (993 ln) | **Partial** — `reorderQueue` ported; reads/transitions + absent/break/no-show still web-only |
| Patient | ✅ `PatientService` (+ walk-in) | facade (~190 ln) | **Done** — `findOrCreatePatient`/`getWalkInPatient` ported to core; web repo deleted, facade only |
| Messaging | ✅ `INotifier` port + `NoOpNotifier` | `NotificationService implements INotifier` (adapter) | **Port done** — swappable at core (container injects); web service is the adapter, no logic moved. Consumer wiring (core service calling `notifier.notify`) is the next increment |
| Medical records, Staff, Analytics, ML, Favorite, Invitation, Rating, Referrals | ❌ none | standalone | **Web-only** — not duplication; need core buildout to be hexagonal |

**Phased plan — each phase is a bounded, independently-verifiable unit (the `reorderQueue` template: port → web delegates → tests green):**

- **Phase A — DONE (this session):** `reorderQueue` → core (port + adapter + service + web delegation + 6 tests); hexagonal boundary test; honest `ClinicSettings` type; monorepo fully type-clean.
- **Phase B — DONE:** ported `findOrCreatePatient` + `getWalkInPatient` (walk-in RPCs `find_patient_by_phone`/`create_patient`/`get_patient_decrypted`) into core `PatientService` + `IPatientRepository`; enhanced core profile read (extended fields + decrypt fallback); web `PatientService` → facade; deleted orphaned web `PatientRepository` + dead mock. Verified: monorepo type-clean, core 24 tests, web 205 tests green.
- **Phase C — DONE:** defined `INotifier` in core (`ports/notifier.ts`, channel as parameter) + `NoOpNotifier` default; added optional `notifier` to the container (defaults to no-op); web `NotificationService implements INotifier` (the production adapter — no logic moved, no consumer rewiring). Messaging is now swappable at the core boundary.
- **Phase C.1 — DONE (booking confirmation seam):** core `BookingService` now publishes an `appointment.booked` domain event (`APPOINTMENT_BOOKED_EVENT`) after a successful booking — best-effort, never breaks the booking. This is the **correct** trigger (the existing notification pipeline is event-driven: a handler resolves the recipient via `ChannelRouter`, then sends), shared by UI + agent. A direct `BookingService → notifier.notify` was rejected: it would be inert (NoOp is the default everywhere), divergent from the event-driven pattern, and missing recipient resolution. Verified: core 30 tests (3 new), web 205 tests, monorepo type-clean.
- **Phase C.2 — DONE (event-bus bridge, web):** introduced a single shared web core container (`apps/web/src/services/core/coreContainer.ts`) — one `eventBus` + the web `NotificationService` injected as the `notifier`. The booking facade now publishes/observes on this shared bus. Added `BookingNotificationHandler` that subscribes to `appointment.booked`, resolves the recipient via `ChannelRouter`, and delivers the confirmation through the `INotifier` port (fire-and-forget, never blocks/fails a booking), wired at startup in `main.tsx`. **Web booking confirmations now fire end-to-end** (gated on `VITE_SMS_ENABLED`). Verified: core 30 tests, web 209 tests (4 new handler tests), monorepo type-clean.
- **Phase C.4 — DONE (MCP-side bridge / agent parity):** the MCP server now wires every container (`buildContainer` — single call site) with a `LoggingNotifier` adapter and subscribes a `bookingNotification` handler. On `appointment.booked`, it resolves the recipient via **core `PatientService.getPatientProfile`** (RLS-scoped to the caller's JWT — no web `ChannelRouter` needed, the Phase B payoff) and delivers via the `INotifier` port. Agent-created bookings now go through the same book → event → resolve → notify flow as the UI. The notifier is a logging placeholder (no server-side provider yet) — swap the adapter when one exists. Verified: mcp 151 tests (5 new), monorepo type-clean.
  - **Channel-resolution parity follow-up:** web uses the richer `ChannelRouter` (preferred channel + enabled flags); MCP uses a minimal phone→SMS/else→email rule. Unifying them behind a shared core resolver is the remaining (optional) increment.
- **Phase C.3 — DONE (facade SSOT):** migrated the clinic, patient, and queue facades to the shared `coreContainer`. `createServiceContainer` is now called in exactly one place (`services/core/coreContainer.ts`) — a true single composition root: one event bus + one notifier shared by all four facades, so any core domain event reaches the app's handlers regardless of which service published it. Verified: web 209 tests, all packages type-clean.
- **Phase D — Queue reads/transitions:** delegate web `getDailySchedule`/`getQueueEntry`/`callNextPatient`/`checkInPatient`/`cancelAppointment` to core (core already implements them); keep the UI event re-publish in web (transport concern, per `reorderQueue`).
- **Phase E — Queue domain:** port absent/break/no-show/gap/waitlist logic into core services behind `IQueueRepository`.
- **Phase F — New core domains:** staff, analytics, medical-records, ML behind ports; web → facades.

Why phased and not one diff: a single rewrite of ~25 services is unreviewable and regression-prone; each phase here is small, test-gated, and preserves working behavior — which is how Phase A stayed green.

---

## 9. Open technical questions

- **`INotifier` granularity:** one port with channel routing inside, or a port per channel? (Lean: one port, channel as a parameter, routing in the adapter.)
- **Event bus across processes:** `InMemoryEventBus` is per-process; when the MCP server and web need to react to each other's events, the bus becomes a real cross-process adapter (Postgres LISTEN/NOTIFY is the cheapest fit given Supabase).
- **Where does RLS-context (the per-request JWT) live in the container?** Today the `SupabaseClient` carries it. Confirm every adapter is constructed *per request* with the caller's token, never a long-lived service-role client, or agent parity (§2) silently breaks.
