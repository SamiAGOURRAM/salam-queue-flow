# 🏛️ QueueMed - Architecture Diagrams

Visual representation of the system architecture transformation.

---

## 📊 Current Architecture (Before)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser / Client                         │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              React Components (UI)                      │    │
│  │                                                         │    │
│  │  • EnhancedQueueManager                                 │    │
│  │  • BookingFlow                                          │    │
│  │  • ClinicQueue                                          │    │
│  │  • PatientDashboard                                     │    │
│  │                                                         │    │
│  │  ⚠️ Business logic mixed with UI                        │    │
│  │  ⚠️ Direct database access via Supabase client          │    │
│  └────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              │ supabase.from('table')            │
│                              ▼                                   │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │
┌──────────────────────────────┼───────────────────────────────────┐
│                              ▼                                    │
│                    Supabase Platform                              │
│                                                                   │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐  │
│  │  Edge Functions     │  │      PostgreSQL Database         │  │
│  │  (Deno Runtime)     │  │                                  │  │
│  │                     │  │  • clinics                       │  │
│  │  • smart-queue-     │  │  • appointments                  │  │
│  │    manager          │  │  • absent_patients               │  │
│  │  • send-sms         │  │  • queue_overrides               │  │
│  │  • send-staff-      │  │  • notification_templates        │  │
│  │    invitation       │  │  • profiles                      │  │
│  │  • update-queue-    │  │                                  │  │
│  │    state            │  │  ✅ Row Level Security (RLS)     │  │
│  │                     │  │  ✅ Proper indexes                │  │
│  │  ⚠️ Hard to test    │  │  ✅ Normalized schema             │  │
│  │  ⚠️ Deno-specific   │  │                                  │  │
│  └─────────────────────┘  └──────────────────────────────────┘  │
│           │                            │                         │
│           └────────────────────────────┘                         │
│                                                                   │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐  │
│  │  Auth               │  │     Realtime Subscriptions       │  │
│  │  • JWT tokens       │  │  • Queue updates                  │  │
│  │  • User sessions    │  │  • Live notifications             │  │
│  └─────────────────────┘  └──────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   External APIs      │
                    │   • Twilio (SMS)     │
                    └──────────────────────┘
```

**Problems**:
- ❌ Business logic scattered (Components, Edge Functions, DB Triggers)
- ❌ Tight coupling to Supabase
- ❌ Hard to test (no mocking layer)
- ❌ No API for external consumers
- ❌ Components directly access database
- ❌ Edge Functions hard to containerize

---

## 🎯 Target Architecture (After - Modular Monolith)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                                   │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │  React SPA   │  │  Mobile App  │  │ API Gateway  │                  │
│  │   (Web UI)   │  │   (Future)   │  │ (AI Agents)  │                  │
│  │              │  │              │  │              │                  │
│  │  Components  │  │  React Native│  │  REST API    │                  │
│  │  use hooks   │  │  components  │  │  /v1/queue   │                  │
│  │              │  │              │  │  /v1/clinics │                  │
│  │  ✅ No DB    │  │  ✅ No DB    │  │              │                  │
│  │     access   │  │     access   │  │  ✅ OpenAPI  │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
│         │                  │                  │                          │
└─────────┼──────────────────┼──────────────────┼──────────────────────────┘
          │                  │                  │
          │  useQueueService │                  │ HTTP/JSON
          │  useClinicService│                  │
          │                  │                  │
┌─────────┼──────────────────┼──────────────────┼──────────────────────────┐
│         ▼                  ▼                  ▼                          │
│              APPLICATION LAYER (Service Orchestration)                   │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │ QueueService    │  │NotificationSvc  │  │ ClinicService   │         │
│  │                 │  │                 │  │                 │         │
│  │• getQueueStatus │  │• sendSMS        │  │• getClinic      │         │
│  │• callNext       │  │• sendEmail      │  │• updateSettings │         │
│  │• markAbsent     │  │• sendPush       │  │• addStaff       │         │
│  │• lateArrival    │  │• getTemplates   │  │                 │         │
│  │                 │  │                 │  │                 │         │
│  │✅ Testable      │  │✅ Testable      │  │✅ Testable      │         │
│  │✅ Reusable      │  │✅ Channels      │  │✅ Clear API     │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
│         │                    │                     │                     │
│         │  Publishes Events  │                     │                     │
│         └────────────────────┼─────────────────────┘                     │
│                              ▼                                           │
│                   ┌──────────────────────┐                               │
│                   │     Event Bus        │                               │
│                   │  (Pub/Sub Pattern)   │                               │
│                   │                      │                               │
│                   │ • PatientCalled      │                               │
│                   │ • PatientAbsent      │                               │
│                   │ • QueueUpdated       │                               │
│                   │                      │                               │
│                   │ ✅ Loose coupling    │                               │
│                   │ ✅ Async events      │                               │
│                   └──────────────────────┘                               │
└──────────────────────────────────────────────────────────────────────────┘
                              │
                              │ Uses Domain Models
                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      DOMAIN LAYER (Business Logic)                        │
│                                                                          │
│  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────────┐  │
│  │  Queue Domain      │  │  Clinic Domain     │  │ Patient Domain   │  │
│  │                    │  │                    │  │                  │  │
│  │  Aggregates:       │  │  Aggregates:       │  │ Entities:        │  │
│  │  • QueueAggregate  │  │  • ClinicAggregate │  │ • Patient        │  │
│  │                    │  │                    │  │ • Appointment    │  │
│  │  Entities:         │  │  Entities:         │  │                  │  │
│  │  • Patient         │  │  • Clinic          │  │ Value Objects:   │  │
│  │  • Appointment     │  │  • Staff           │  │ • PhoneNumber    │  │
│  │                    │  │                    │  │ • EmailAddress   │  │
│  │  Value Objects:    │  │  Value Objects:    │  │                  │  │
│  │  • QueuePosition   │  │  • Address         │  │ Events:          │  │
│  │  • GracePeriod     │  │  • WorkingHours    │  │ • PatientJoined  │  │
│  │  • WaitTime        │  │                    │  │ • PatientLeft    │  │
│  │                    │  │  Business Rules:   │  │                  │  │
│  │  Business Rules:   │  │  • Validate hours  │  │                  │  │
│  │  • Grace period    │  │  • Staff limits    │  │                  │  │
│  │  • Skip fairness   │  │  • Capacity        │  │                  │  │
│  │  • Call logic      │  │                    │  │                  │  │
│  │                    │  │                    │  │                  │  │
│  │  ✅ Pure logic     │  │  ✅ Encapsulated   │  │ ✅ Testable      │  │
│  │  ✅ No I/O         │  │  ✅ No DB access    │  │ ✅ Reusable      │  │
│  └────────────────────┘  └────────────────────┘  └──────────────────┘  │
│                                                                          │
│  Domain models contain ALL business logic and rules                      │
│  Services orchestrate domain models and infrastructure                   │
└──────────────────────────────────────────────────────────────────────────┘
                              │
                              │ Persisted via Repositories
                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                  INFRASTRUCTURE LAYER (Data & External)                   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────┐        │
│  │                      Repositories                            │        │
│  │                                                              │        │
│  │  • QueueRepository      • ClinicRepository                   │        │
│  │  • AppointmentRepository• NotificationRepository             │        │
│  │                                                              │        │
│  │  ✅ Abstract data access                                     │        │
│  │  ✅ Mockable for tests                                       │        │
│  │  ✅ Can swap implementation (Supabase → PostgreSQL)          │        │
│  └─────────────────────────────────────────────────────────────┘        │
│                              │                                           │
│                              ▼                                           │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐         │
│  │ Database Access      │  │    External Services             │         │
│  │                      │  │                                  │         │
│  │ • Supabase Client    │  │  • Twilio (SMS)                  │         │
│  │ • PostgreSQL         │  │  • SendGrid (Email - Future)     │         │
│  │ • RLS Policies       │  │  • Firebase (Push - Future)      │         │
│  │ • Real-time subs     │  │  • WhatsApp API (Future)         │         │
│  │                      │  │                                  │         │
│  │ ✅ Secure (RLS)      │  │  ✅ Wrapped in services          │         │
│  │ ✅ Optimized queries │  │  ✅ Retry logic                  │         │
│  └──────────────────────┘  └──────────────────────────────────┘         │
│                                                                          │
│  Infrastructure layer handles ALL external communication                 │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                     CROSS-CUTTING CONCERNS                                │
│                                                                          │
│  • Logger (structured JSON logging)                                      │
│  • Error Handler (global error catching)                                 │
│  • Validator (Zod schemas)                                               │
│  • Cache (Redis - Future)                                                │
│  • Monitoring (Sentry, metrics)                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Benefits**:
- ✅ Clear separation of concerns (4 layers)
- ✅ Testable business logic (domain layer)
- ✅ Reusable services (application layer)
- ✅ Flexible infrastructure (easy to swap)
- ✅ API-ready for AI agents
- ✅ Container-ready for scaling

---

## 🔄 Service Interaction Flow

### Example: Call Next Patient in Queue

```
┌─────────────┐
│   React UI  │ User clicks "Call Next Patient"
│  Component  │
└──────┬──────┘
       │
       │ useQueueService.callNextPatient(clinicId, staffId)
       ▼
┌─────────────────────────────────────────────────────────┐
│                  Application Layer                       │
│                                                          │
│  ┌──────────────────────────────────────────────┐       │
│  │         QueueService.callNextPatient()       │       │
│  │                                              │       │
│  │  1. Load queue from repository               │       │
│  │  2. Call domain logic (QueueAggregate)       │       │
│  │  3. Persist changes via repository           │       │
│  │  4. Publish PatientCalledEvent               │       │
│  │  5. Return result                            │       │
│  └──────────────────────────────────────────────┘       │
│         │              │              │                  │
└─────────┼──────────────┼──────────────┼──────────────────┘
          │              │              │
    ┌─────┘              │              └─────┐
    │                    │                    │
    ▼                    ▼                    ▼
┌────────────┐  ┌──────────────────┐  ┌────────────────┐
│Repository  │  │ Domain Layer     │  │ Event Bus      │
│            │  │                  │  │                │
│getQueue()  │  │QueueAggregate    │  │publish()       │
│save()      │  │.callNext()       │  │                │
│            │  │                  │  │                │
│            │  │Business Rules:   │  │Listeners:      │
│            │  │• Find present    │  │• Notification  │
│            │  │• Skip absent     │  │  Service       │
│            │  │• Update counts   │  │• Analytics     │
│            │  │• Validate state  │  │• UI updates    │
└────────────┘  └──────────────────┘  └────────────────┘
     │                                        │
     │                                        │
     ▼                                        ▼
┌──────────────────┐              ┌────────────────────┐
│ Infrastructure   │              │ Notification       │
│                  │              │ Service            │
│ Supabase Client  │              │                    │
│ • Update DB      │              │ • Send SMS         │
│ • RLS check      │              │ • Track budget     │
│ • Real-time push │              │ • Log analytics    │
└──────────────────┘              └────────────────────┘
```

**Flow Steps**:
1. UI calls `useQueueService.callNextPatient()`
2. Service loads current queue (via Repository)
3. Service delegates to Domain Model (QueueAggregate)
4. Domain Model applies business rules (pure logic, no I/O)
5. Service persists changes (via Repository)
6. Service publishes `PatientCalledEvent` (Event Bus)
7. NotificationService listens and sends SMS
8. Repository triggers real-time update (Supabase Realtime)
9. UI receives update and re-renders

**Benefits of this flow**:
- Each layer has single responsibility
- Business logic (step 4) is pure and testable
- Services orchestrate but don't implement logic
- Events enable loose coupling
- Easy to add new features (just subscribe to events)

---

## 📦 Directory Structure

```
src/
├── services/                    # Application Layer
│   ├── queue/
│   │   ├── QueueService.ts      # Main service
│   │   ├── models/              # Domain Layer
│   │   │   ├── QueueAggregate.ts
│   │   │   ├── Patient.ts
│   │   │   ├── Appointment.ts
│   │   │   ├── QueuePosition.ts (Value Object)
│   │   │   └── GracePeriod.ts   (Value Object)
│   │   ├── events/              # Domain Events
│   │   │   ├── PatientCalledEvent.ts
│   │   │   ├── PatientAbsentEvent.ts
│   │   │   └── QueueUpdatedEvent.ts
│   │   ├── repositories/        # Infrastructure Layer
│   │   │   └── QueueRepository.ts
│   │   └── api/                 # API Contracts
│   │       └── QueueAPI.ts
│   │
│   ├── notification/
│   │   ├── NotificationService.ts
│   │   ├── channels/
│   │   │   ├── SMSChannel.ts
│   │   │   ├── EmailChannel.ts
│   │   │   └── WhatsAppChannel.ts
│   │   ├── templates/
│   │   │   └── TemplateEngine.ts
│   │   └── api/
│   │       └── NotificationAPI.ts
│   │
│   ├── clinic/
│   │   ├── ClinicService.ts
│   │   ├── StaffService.ts
│   │   ├── models/
│   │   ├── events/
│   │   ├── repositories/
│   │   └── api/
│   │
│   ├── appointment/
│   │   ├── AppointmentService.ts
│   │   ├── BookingService.ts
│   │   ├── models/
│   │   └── repositories/
│   │
│   └── shared/                  # Cross-Cutting Concerns
│       ├── events/
│       │   └── EventBus.ts
│       ├── logging/
│       │   └── Logger.ts
│       ├── errors/
│       │   └── AppError.ts
│       └── validation/
│           └── Validator.ts
│
├── api/                         # API Layer (Optional)
│   └── v1/
│       ├── index.ts             # API Server
│       ├── routes/
│       │   ├── queue.ts
│       │   ├── clinics.ts
│       │   └── appointments.ts
│       ├── schemas/             # Zod Schemas
│       │   └── queue.schema.ts
│       └── middleware/
│           ├── auth.ts
│           ├── logging.ts
│           └── errorHandler.ts
│
├── hooks/                       # React Hooks (Presentation)
│   ├── useQueueService.ts
│   ├── useClinicService.ts
│   └── useAuth.tsx
│
├── components/                  # UI Components
│   ├── clinic/
│   │   ├── QueueManager.tsx     # Uses useQueueService
│   │   └── EnhancedQueueManager.tsx
│   └── booking/
│       └── BookingFlow.tsx
│
└── test/                        # Testing Infrastructure
    ├── setup.ts
    ├── fixtures/
    └── mocks/
```

---

## 🔀 Data Flow Diagrams

### 1. Queue Status Query (Read)

```
User
 │
 │ GET /queue
 ▼
React Component
 │
 │ useQueueService.getQueueStatus()
 ▼
QueueService
 │
 │ repository.getActiveQueue()
 │ repository.getCurrentPatient()
 │ repository.getAbsentPatients()
 ▼
QueueRepository
 │
 │ supabase.from('appointments').select()
 ▼
Supabase (PostgreSQL)
 │
 │ RLS check → Filter by clinic_id
 ▼
Return Data
 │
 ▼
Transform to Domain Models
 │
 ▼
Calculate Statistics
 │
 ▼
Return QueueStatus DTO
 │
 ▼
React Component Updates UI
```

---

### 2. Call Next Patient (Write with Events)

```
User clicks "Call Next"
 │
 ▼
React Component
 │
 │ useQueueService.callNextPatient(clinicId, staffId)
 ▼
QueueService
 │
 ├─► 1. Load queue (Repository)
 │    │
 │    ▼
 │   QueueRepository.getActiveQueue()
 │    │
 │    ▼
 │   Supabase query
 │    │
 │    └─► Returns patients[]
 │
 ├─► 2. Business logic (Domain)
 │    │
 │    ▼
 │   QueueAggregate.callNextPatient()
 │    │
 │    ├─► Find next present patient
 │    ├─► Increment skip count for bypassed
 │    ├─► Validate state
 │    └─► Return result
 │
 ├─► 3. Persist changes (Repository)
 │    │
 │    ▼
 │   QueueRepository.save()
 │    │
 │    ├─► Update appointment status
 │    ├─► Update skip counts
 │    └─► Create queue_override audit log
 │
 ├─► 4. Publish event (Event Bus)
 │    │
 │    ▼
 │   eventBus.publish(PatientCalledEvent)
 │    │
 │    ├─► NotificationService listens
 │    │    │
 │    │    ├─► Send "Your turn" SMS to patient
 │    │    └─► Send "Skipped" SMS to bypassed patients
 │    │
 │    ├─► AnalyticsService listens
 │    │    └─► Log event for ML training
 │    │
 │    └─► UI listens (Supabase Realtime)
 │         └─► Re-render queue display
 │
 └─► 5. Return result to UI
      │
      ▼
     Success toast
     Queue UI updates
```

---

## 🧪 Testing Architecture

```
┌──────────────────────────────────────────────────────┐
│               Testing Pyramid                         │
│                                                       │
│                    /\                                 │
│                   /  \   E2E Tests                    │
│                  /    \  (5% - Critical paths)        │
│                 /──────\                              │
│                /        \  Integration Tests          │
│               /          \ (15% - Service workflows)  │
│              /────────────\                           │
│             /              \ Unit Tests               │
│            /                \ (80% - Services,        │
│           /                  \ Domain models)         │
│          /────────────────────\                       │
│                                                       │
└──────────────────────────────────────────────────────┘

Unit Tests (80%):
├── Domain Models
│   ├── QueueAggregate.test.ts      (Pure logic, no mocks)
│   ├── Patient.test.ts
│   └── ValueObjects.test.ts
│
├── Services
│   ├── QueueService.test.ts        (Mock repository)
│   └── NotificationService.test.ts (Mock channels)
│
└── Repositories
    └── QueueRepository.test.ts     (Mock Supabase)

Integration Tests (15%):
├── Queue workflow
│   └── call-next-patient.test.ts   (Service + Repo + DB)
│
└── Event handlers
    └── event-bus.test.ts           (Full event flow)

E2E Tests (5%):
└── Critical user journeys
    ├── patient-booking.test.ts
    └── queue-management.test.ts
```

---

## 🐳 Containerization Strategy (Future)

### Phase 1: Current (Supabase Edge Functions)
```
┌─────────────────────────────────┐
│   Supabase Platform             │
│                                 │
│  ┌────────────────────────┐    │
│  │  Edge Functions (Deno) │    │
│  │  • smart-queue-manager │    │
│  │  • send-sms            │    │
│  └────────────────────────┘    │
│             │                   │
│             ▼                   │
│  ┌────────────────────────┐    │
│  │  PostgreSQL            │    │
│  └────────────────────────┘    │
└─────────────────────────────────┘
```

### Phase 2: Hybrid (Months 4-6)
```
┌─────────────────────────────────┐     ┌──────────────────────┐
│   Docker Containers             │     │  Supabase Platform   │
│                                 │     │                      │
│  ┌────────────────────────┐    │     │  ┌────────────────┐  │
│  │  API Server (Node.js)  │────┼─────┼─►│  PostgreSQL    │  │
│  │  • Queue Service       │    │     │  │  (Database)    │  │
│  │  • Notification Svc    │    │     │  └────────────────┘  │
│  │  • REST APIs           │    │     │                      │
│  └────────────────────────┘    │     │  ┌────────────────┐  │
│             │                   │     │  │  Auth          │  │
│             ▼                   │     │  │  (Keep for now)│  │
│  ┌────────────────────────┐    │     │  └────────────────┘  │
│  │  Redis Cache           │    │     └──────────────────────┘
│  └────────────────────────┘    │
└─────────────────────────────────┘
```

### Phase 3: Full Container (Months 7-12)
```
┌────────────────────────────────────────────────────────┐
│                 Kubernetes Cluster                      │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │   API        │  │ Notification │  │   Queue     │  │
│  │   Service    │  │   Service    │  │  Service    │  │
│  │  (3 pods)    │  │  (2 pods)    │  │  (2 pods)   │  │
│  └──────────────┘  └──────────────┘  └─────────────┘  │
│         │                  │                 │         │
│         └──────────────────┼─────────────────┘         │
│                            ▼                           │
│                  ┌──────────────────┐                  │
│                  │   Event Bus      │                  │
│                  │   (Redis)        │                  │
│                  └──────────────────┘                  │
│                            │                           │
│                            ▼                           │
│                  ┌──────────────────┐                  │
│                  │   PostgreSQL     │                  │
│                  │   (Cloud SQL)    │                  │
│                  └──────────────────┘                  │
└────────────────────────────────────────────────────────┘
```

---

## 🔒 Security Architecture

```
┌─────────────────────────────────────────────────────┐
│               Security Layers                        │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  1. Authentication                          │    │
│  │     • JWT tokens (Supabase Auth)            │    │
│  │     • API keys for external services        │    │
│  │     • Session management                    │    │
│  └────────────────────────────────────────────┘    │
│                     │                               │
│                     ▼                               │
│  ┌────────────────────────────────────────────┐    │
│  │  2. Authorization                           │    │
│  │     • Role-based (RBAC)                     │    │
│  │     • Resource-based (RLS)                  │    │
│  │     • Clinic isolation (multi-tenant)       │    │
│  └────────────────────────────────────────────┘    │
│                     │                               │
│                     ▼                               │
│  ┌────────────────────────────────────────────┐    │
│  │  3. Row Level Security (RLS)                │    │
│  │     • Patients see only own data            │    │
│  │     • Staff see only clinic data            │    │
│  │     • Owners manage clinic                  │    │
│  └────────────────────────────────────────────┘    │
│                     │                               │
│                     ▼                               │
│  ┌────────────────────────────────────────────┐    │
│  │  4. Data Encryption                         │    │
│  │     • At rest (database encryption)         │    │
│  │     • In transit (HTTPS/TLS)                │    │
│  │     • Sensitive fields (PII)                │    │
│  └────────────────────────────────────────────┘    │
│                     │                               │
│                     ▼                               │
│  ┌────────────────────────────────────────────┐    │
│  │  5. Audit Logging                           │    │
│  │     • All data access logged                │    │
│  │     • User actions tracked                  │    │
│  │     • Compliance reports                    │    │
│  └────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

---

## 📊 Monitoring & Observability

```
┌─────────────────────────────────────────────────────┐
│            Application Services                      │
│  • QueueService                                      │
│  • NotificationService                               │
│  • ClinicService                                     │
└─────────┬──────────────┬──────────────┬─────────────┘
          │              │              │
     Logs │              │ Metrics      │ Traces
          ▼              ▼              ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Logger     │  │  Metrics     │  │  Tracing     │
│              │  │  Collector   │  │  (Optional)  │
│ • Structured │  │              │  │              │
│ • JSON       │  │ • Requests   │  │ • Spans      │
│ • Levels     │  │ • Errors     │  │ • Context    │
│ • Context    │  │ • Latency    │  │ • Propagate  │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Log         │  │  Grafana/    │  │  Jaeger/     │
│  Aggregation │  │  Datadog     │  │  Zipkin      │
│              │  │              │  │              │
│ • LogTail    │  │ • Dashboards │  │ • Trace view │
│ • Datadog    │  │ • Alerts     │  │ • Timeline   │
│ • ELK        │  │ • Analytics  │  │ • Dependencies│
└──────────────┘  └──────────────┘  └──────────────┘
       │                 │                 │
       └─────────────────┴─────────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │   Alerting   │
                  │              │
                  │ • PagerDuty  │
                  │ • Slack      │
                  │ • Email      │
                  └──────────────┘
```

---

**Status**: Architecture defined ✅  
**Next**: Implementation Phase  
**Timeline**: 12 weeks  
**Team**: Ready to build! 🚀
