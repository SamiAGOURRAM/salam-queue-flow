# 🏗️ Architecture Analysis & Recommendations
## QueueMed - Healthcare Queue Management System

**Date**: October 15, 2025  
**Version**: 1.0.0  
**Status**: MVP - Modular Monolithic Architecture

---

## 📋 Executive Summary

### Current State
QueueMed is a **React + Supabase** based healthcare queue management platform with:
- ✅ Real-time queue management
- ✅ SMS notification system (Twilio)
- ✅ Multi-tenant architecture (clinic isolation via RLS)
- ✅ Role-based access control (RBAC)
- ✅ Edge Functions for business logic
- ✅ Comprehensive database schema

### Architecture Pattern
**Current**: Supabase-centric architecture with:
- Frontend: React SPA (Vite + TypeScript + shadcn/ui)
- Backend: Supabase (PostgreSQL + Edge Functions)
- Auth: Supabase Auth
- Storage: Supabase Storage (potential)
- Real-time: Supabase Realtime

### Target
**Modular Monolithic** architecture ready for:
- Service extraction to microservices/containers
- AI agent integration via well-defined APIs
- Horizontal scaling
- Multi-channel support (web, mobile, API)

---

## 🎯 Strategic Goals

### 1. High-Quality MVP
- ✅ Production-ready code quality
- ✅ Comprehensive error handling
- ✅ Security-first approach (RLS policies)
- ❌ Limited test coverage (needs improvement)
- ❌ No API documentation (needs OpenAPI/Swagger)

### 2. Modular Architecture
- ⚠️ **Current Gap**: Business logic scattered across:
  - React components (UI layer)
  - Edge Functions (serverless)
  - Database triggers (data layer)
- 🎯 **Target**: Clear service boundaries with defined APIs

### 3. AI Agent Readiness
- ⚠️ **Current Gap**: No standardized API layer
- 🎯 **Target**: RESTful/GraphQL APIs that AI agents can consume as tools

### 4. Container Migration Path
- ⚠️ **Current Gap**: Supabase Edge Functions are Deno-based (not Docker)
- 🎯 **Target**: Services that can be containerized independently

---

## 🔍 Current Architecture Analysis

### Strengths ✅

#### 1. **Database Design** (⭐⭐⭐⭐⭐)
- Well-normalized schema
- Proper indexing strategy
- Comprehensive RLS policies
- Audit trail implementation
- Multi-language support
- ML-ready data structures

#### 2. **Real-time Capabilities** (⭐⭐⭐⭐⭐)
- Supabase Realtime subscriptions
- Event-driven updates
- Low-latency queue state sync

#### 3. **Security** (⭐⭐⭐⭐⭐)
- Row-Level Security (RLS) on all tables
- Multi-tenant isolation
- JWT-based authentication
- Role-based access control

#### 4. **Type Safety** (⭐⭐⭐⭐)
- TypeScript throughout
- Auto-generated types from DB schema
- Proper interface definitions

### Weaknesses ⚠️

#### 1. **Service Layer** (⭐⭐)
**Problem**: No clear service abstraction layer

**Current**:
```
React Components → Supabase Client → Database
                → Edge Functions → Database
```

**Issues**:
- Direct database access from UI components
- Business logic in multiple places
- Hard to test
- Tight coupling to Supabase
- No API contracts

#### 2. **Edge Functions** (⭐⭐⭐)
**Problem**: Limited to Deno runtime, hard to migrate

**Current Edge Functions**:
- `smart-queue-manager` - Queue operations
- `send-sms` - Notification delivery
- `send-staff-invitation` - Team management
- `update-queue-state` - State synchronization

**Issues**:
- Deno-specific imports
- Cannot run in Docker directly
- No local development without Supabase CLI
- Limited observability

#### 3. **API Layer** (⭐)
**Problem**: No standardized API layer for external consumers

**Missing**:
- RESTful API endpoints
- API versioning
- Request/response schemas
- API documentation
- Rate limiting
- API keys/OAuth for AI agents

#### 4. **Testing** (⭐)
**Problem**: No test infrastructure

**Missing**:
- Unit tests
- Integration tests
- E2E tests
- Test fixtures
- Mocking strategy

#### 5. **Domain Models** (⭐⭐)
**Problem**: Anemic domain models (just types, no behavior)

**Current**:
```typescript
interface QueuePatient {
  id: string;
  patient_id: string;
  queue_position: number;
  // ... just data
}
```

**Missing**:
- Domain logic encapsulation
- Business rule validation
- Domain events
- Aggregates

---

## 🏛️ Recommended Architecture

### Architecture Pattern: **Modular Monolith with Domain-Driven Design**

```
┌─────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ React Web    │  │ Mobile App   │  │  API Gateway │      │
│  │     SPA      │  │  (Future)    │  │  (AI Agents) │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Service Orchestration Layer             │   │
│  │  • QueueService • NotificationService • AuthService  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       DOMAIN LAYER                           │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │   Queue    │  │  Clinic    │  │   Patient  │            │
│  │  Domain    │  │  Domain    │  │   Domain   │            │
│  │            │  │            │  │            │            │
│  │ • Entities │  │ • Entities │  │ • Entities │            │
│  │ • Value Obj│  │ • Value Obj│  │ • Value Obj│            │
│  │ • Aggregat │  │ • Aggregat │  │ • Aggregat │            │
│  │ • Events   │  │ • Events   │  │ • Events   │            │
│  └────────────┘  └────────────┘  └────────────┘            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   INFRASTRUCTURE LAYER                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Repositories • Database • External APIs • Messaging │   │
│  │  • Supabase Client • Twilio • Email • Storage       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📐 Detailed Design Recommendations

### 1. Service Layer Architecture

#### Create Service Modules

```
src/
├── services/
│   ├── queue/
│   │   ├── QueueService.ts           # Main service
│   │   ├── QueueRepository.ts        # Data access
│   │   ├── models/
│   │   │   ├── QueueAggregate.ts     # Domain model
│   │   │   ├── Patient.ts            # Value object
│   │   │   └── QueuePosition.ts      # Value object
│   │   ├── events/
│   │   │   ├── PatientCalledEvent.ts
│   │   │   ├── PatientAbsentEvent.ts
│   │   │   └── QueueUpdatedEvent.ts
│   │   └── api/
│   │       └── QueueAPI.ts           # API contract
│   │
│   ├── notification/
│   │   ├── NotificationService.ts
│   │   ├── channels/
│   │   │   ├── SMSChannel.ts
│   │   │   ├── EmailChannel.ts       # Future
│   │   │   └── WhatsAppChannel.ts    # Future
│   │   ├── templates/
│   │   │   └── TemplateEngine.ts
│   │   └── api/
│   │       └── NotificationAPI.ts
│   │
│   ├── clinic/
│   │   ├── ClinicService.ts
│   │   ├── StaffService.ts
│   │   ├── models/
│   │   └── api/
│   │
│   ├── appointment/
│   │   ├── AppointmentService.ts
│   │   ├── BookingService.ts
│   │   ├── models/
│   │   └── api/
│   │
│   └── shared/
│       ├── EventBus.ts               # Event-driven communication
│       ├── Logger.ts
│       ├── Validator.ts
│       └── ErrorHandler.ts
```

#### Example Service Implementation

```typescript
// src/services/queue/QueueService.ts
import { QueueRepository } from './QueueRepository';
import { QueueAggregate } from './models/QueueAggregate';
import { EventBus } from '../shared/EventBus';
import { PatientCalledEvent, PatientAbsentEvent } from './events';

export class QueueService {
  constructor(
    private repository: QueueRepository,
    private eventBus: EventBus
  ) {}

  async callNextPatient(clinicId: string, staffId: string): Promise<QueueAggregate> {
    // 1. Load queue aggregate
    const queue = await this.repository.getActiveQueue(clinicId);
    
    // 2. Business logic in domain
    const result = queue.callNextPatient(staffId);
    
    // 3. Persist changes
    await this.repository.save(queue);
    
    // 4. Publish events
    this.eventBus.publish(new PatientCalledEvent(result.patient, clinicId));
    
    return queue;
  }

  async markPatientAbsent(
    appointmentId: string, 
    reason: string,
    staffId: string
  ): Promise<void> {
    const queue = await this.repository.getQueueForAppointment(appointmentId);
    
    queue.markPatientAbsent(appointmentId, reason, staffId);
    
    await this.repository.save(queue);
    
    this.eventBus.publish(new PatientAbsentEvent(appointmentId, reason));
  }

  // API for AI Agents
  async getQueueStatus(clinicId: string): Promise<QueueStatusDTO> {
    const queue = await this.repository.getActiveQueue(clinicId);
    return this.toDTO(queue);
  }
}
```

#### Example Domain Model

```typescript
// src/services/queue/models/QueueAggregate.ts
export class QueueAggregate {
  private patients: Patient[] = [];
  private currentPatient: Patient | null = null;
  
  constructor(
    public readonly clinicId: string,
    private clinicSettings: ClinicSettings
  ) {}

  callNextPatient(staffId: string): { patient: Patient; skippedPatients: Patient[] } {
    // Business rule: Find next present patient
    const presentPatients = this.patients.filter(p => p.isPresent);
    
    if (presentPatients.length === 0) {
      throw new NoPatientAvailableError();
    }

    const nextPatient = presentPatients[0];
    const skippedPatients = this.patients
      .slice(0, this.patients.indexOf(nextPatient))
      .filter(p => p.isPresent);

    // Business logic: increment skip count
    skippedPatients.forEach(p => p.incrementSkipCount());

    // Update state
    this.currentPatient = nextPatient;
    nextPatient.markAsInProgress(staffId);

    return { patient: nextPatient, skippedPatients };
  }

  markPatientAbsent(appointmentId: string, reason: string, staffId: string): void {
    const patient = this.findPatient(appointmentId);
    
    // Business rule: Grace period
    const gracePeriod = this.clinicSettings.absentGracePeriodMinutes;
    patient.markAsAbsent(reason, gracePeriod, staffId);

    // Business rule: Auto-cancel after grace period
    if (this.clinicSettings.autoCancelAfterGracePeriod) {
      patient.scheduleAutoCancellation(gracePeriod);
    }
  }

  // Encapsulated business logic
  private findPatient(appointmentId: string): Patient {
    const patient = this.patients.find(p => p.appointmentId === appointmentId);
    if (!patient) {
      throw new PatientNotFoundError(appointmentId);
    }
    return patient;
  }
}
```

### 2. API Layer for AI Agents

#### RESTful API Design

```typescript
// src/api/v1/routes/queue.routes.ts
import { Router } from 'express'; // Or Hono for Edge Runtime
import { QueueService } from '@/services/queue/QueueService';

export const queueRoutes = Router();

/**
 * @openapi
 * /api/v1/clinics/{clinicId}/queue:
 *   get:
 *     summary: Get current queue status
 *     tags: [Queue]
 *     parameters:
 *       - in: path
 *         name: clinicId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Queue status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QueueStatus'
 */
queueRoutes.get('/clinics/:clinicId/queue', async (req, res) => {
  const queueService = new QueueService();
  const status = await queueService.getQueueStatus(req.params.clinicId);
  res.json(status);
});

/**
 * @openapi
 * /api/v1/clinics/{clinicId}/queue/call-next:
 *   post:
 *     summary: Call next patient in queue
 *     tags: [Queue]
 *     description: AI Agent can use this to automate queue management
 */
queueRoutes.post('/clinics/:clinicId/queue/call-next', async (req, res) => {
  const queueService = new QueueService();
  const result = await queueService.callNextPatient(
    req.params.clinicId,
    req.body.staffId
  );
  res.json(result);
});
```

#### API Schema Definitions

```typescript
// src/api/v1/schemas/queue.schema.ts
import { z } from 'zod';

export const QueueStatusSchema = z.object({
  clinicId: z.string().uuid(),
  currentPatient: z.object({
    id: z.string().uuid(),
    name: z.string(),
    appointmentType: z.string(),
    startedAt: z.string().datetime(),
  }).nullable(),
  waitingPatients: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    queuePosition: z.number(),
    estimatedWaitTime: z.number(), // minutes
    isPresent: z.boolean(),
  })),
  absentPatients: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    gracePeriodEndsAt: z.string().datetime(),
  })),
  statistics: z.object({
    totalWaiting: z.number(),
    averageWaitTime: z.number(),
    longestWaitTime: z.number(),
  }),
});

export type QueueStatusDTO = z.infer<typeof QueueStatusSchema>;
```

### 3. Migration Strategy from Edge Functions to Services

#### Option A: Hybrid Approach (Recommended for MVP)

Keep Supabase Edge Functions but wrap them with service layer:

```
┌──────────────┐
│ React UI     │
└──────────────┘
       │
       ▼
┌──────────────┐      ┌─────────────────┐
│ Service Layer│ ───▶ │ Edge Functions  │
│  (Browser)   │      │  (Serverless)   │
└──────────────┘      └─────────────────┘
       │                       │
       ▼                       ▼
┌──────────────────────────────────┐
│      Supabase Database           │
└──────────────────────────────────┘
```

**Implementation**:
```typescript
// src/services/queue/QueueService.ts
export class QueueService {
  async callNextPatient(clinicId: string): Promise<QueueResult> {
    // For now, delegate to Edge Function
    const { data, error } = await supabase.functions.invoke(
      'smart-queue-manager',
      {
        body: {
          action: 'next',
          clinic_id: clinicId,
        }
      }
    );
    
    if (error) throw new QueueServiceError(error);
    
    // Transform to domain model
    return this.toDomain(data);
  }
}
```

**Benefits**:
- ✅ Quick to implement
- ✅ No breaking changes
- ✅ Gradual migration path
- ✅ Keep Supabase benefits

**Drawbacks**:
- ⚠️ Still coupled to Supabase
- ⚠️ Limited control over runtime

#### Option B: Node.js API Server (Long-term)

Migrate to Express/Fastify/Hono API server:

```
┌──────────────┐
│ React UI     │
└──────────────┘
       │
       ▼
┌──────────────────────────┐
│    API Gateway           │
│  (Express/Fastify)       │
│                          │
│  ┌────────────────────┐  │
│  │ Queue Service      │  │
│  │ Notification Svc   │  │
│  │ Clinic Service     │  │
│  └────────────────────┘  │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│   PostgreSQL             │
│   (Direct or via ORM)    │
└──────────────────────────┘
```

**Implementation**:
```typescript
// server/src/index.ts
import express from 'express';
import { QueueService } from './services/queue/QueueService';

const app = express();

app.post('/api/v1/clinics/:clinicId/queue/call-next', async (req, res) => {
  const queueService = new QueueService();
  const result = await queueService.callNextPatient(req.params.clinicId);
  res.json(result);
});

app.listen(3000);
```

**Benefits**:
- ✅ Full control over runtime
- ✅ Easy to containerize
- ✅ Standard Node.js ecosystem
- ✅ Better testing infrastructure

**Drawbacks**:
- ⚠️ Lose Supabase Realtime (need alternative)
- ⚠️ More infrastructure to manage
- ⚠️ Need to replicate RLS logic

### 4. Container Migration Path

#### Phase 1: Containerize API Server

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

#### Phase 2: Docker Compose Setup

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: ${DATABASE_URL}
      TWILIO_ACCOUNT_SID: ${TWILIO_ACCOUNT_SID}
      TWILIO_AUTH_TOKEN: ${TWILIO_AUTH_TOKEN}
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: queuemed
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf

volumes:
  postgres_data:
```

#### Phase 3: Kubernetes (Future)

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: queuemed-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: queuemed-api
  template:
    metadata:
      labels:
        app: queuemed-api
    spec:
      containers:
      - name: api
        image: queuemed/api:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secrets
              key: url
```

---

## 🛣️ Implementation Roadmap

### Phase 1: Foundation (Week 1-2) 🏗️

#### Goal: Establish service layer without breaking existing functionality

**Tasks**:
1. ✅ Create service directory structure
2. ✅ Implement QueueService as wrapper around Edge Functions
3. ✅ Implement NotificationService wrapper
4. ✅ Update React components to use services instead of direct Supabase calls
5. ✅ Add TypeScript strict mode
6. ✅ Add ESLint rules for architecture compliance

**Deliverables**:
- [ ] `src/services/` directory with initial services
- [ ] All components using service layer
- [ ] Documentation for service patterns

**Success Criteria**:
- Zero breaking changes
- All existing features work
- Improved testability

### Phase 2: Domain Models (Week 3-4) 📦

#### Goal: Move business logic from Edge Functions to domain models

**Tasks**:
1. ✅ Define domain entities (Queue, Patient, Appointment, etc.)
2. ✅ Implement value objects (QueuePosition, PhoneNumber, etc.)
3. ✅ Create aggregates with business rules
4. ✅ Implement domain events
5. ✅ Add event bus for inter-service communication
6. ✅ Write unit tests for domain models

**Deliverables**:
- [ ] Domain models with encapsulated business logic
- [ ] 80%+ test coverage for domain layer
- [ ] Event-driven communication between services

**Success Criteria**:
- Business rules are testable in isolation
- Clear separation of concerns
- Domain events enable loose coupling

### Phase 3: API Layer (Week 5-6) 🌐

#### Goal: Create RESTful APIs for AI agent integration

**Tasks**:
1. ✅ Design API contracts (OpenAPI/Swagger)
2. ✅ Implement API routes with Express/Hono
3. ✅ Add request/response validation (Zod)
4. ✅ Implement API authentication (JWT/API keys)
5. ✅ Add rate limiting
6. ✅ Generate API documentation
7. ✅ Create AI agent integration examples

**Deliverables**:
- [ ] `/api/v1/` RESTful endpoints
- [ ] OpenAPI specification
- [ ] API documentation site
- [ ] AI agent example code (LangChain/AutoGPT compatible)

**Success Criteria**:
- AI agents can consume APIs as tools
- Complete API documentation
- Authentication and authorization working

### Phase 4: Testing Infrastructure (Week 7-8) ✅

#### Goal: Achieve comprehensive test coverage

**Tasks**:
1. ✅ Set up Jest/Vitest
2. ✅ Write unit tests for services
3. ✅ Write integration tests for APIs
4. ✅ Write E2E tests for critical workflows
5. ✅ Add test fixtures and factories
6. ✅ Set up CI/CD for automated testing
7. ✅ Add test coverage reporting

**Deliverables**:
- [ ] 80%+ code coverage
- [ ] Automated test suite in CI/CD
- [ ] Test documentation

**Success Criteria**:
- All tests pass
- Coverage > 80%
- Fast test execution (< 5 min)

### Phase 5: Containerization (Week 9-10) 🐳

#### Goal: Make services container-ready

**Tasks**:
1. ✅ Create Dockerfile for API server
2. ✅ Set up Docker Compose for local development
3. ✅ Migrate Edge Functions to containerized services
4. ✅ Add health checks and monitoring
5. ✅ Document deployment process
6. ✅ Test horizontal scaling

**Deliverables**:
- [ ] Docker images for all services
- [ ] Docker Compose configuration
- [ ] Deployment documentation

**Success Criteria**:
- Services run in containers
- Local development uses Docker Compose
- Ready for Kubernetes/Cloud Run

### Phase 6: Observability (Week 11-12) 📊

#### Goal: Add monitoring, logging, and tracing

**Tasks**:
1. ✅ Implement structured logging
2. ✅ Add OpenTelemetry tracing
3. ✅ Set up metrics collection (Prometheus)
4. ✅ Create Grafana dashboards
5. ✅ Add error tracking (Sentry)
6. ✅ Implement health checks

**Deliverables**:
- [ ] Centralized logging (ELK/Loki)
- [ ] Distributed tracing
- [ ] Metrics dashboards
- [ ] Alerting rules

**Success Criteria**:
- < 1 minute to detect issues
- Complete request tracing
- Real-time metrics

---

## 📚 Technology Stack Recommendations

### Current Stack (Keep)
- ✅ **React 18** - Modern, performant UI
- ✅ **TypeScript** - Type safety
- ✅ **Tailwind CSS** - Utility-first styling
- ✅ **shadcn/ui** - Accessible components
- ✅ **Vite** - Fast build tool
- ✅ **Supabase** - Database & Auth (for now)

### Additions for Service Layer

#### Backend Runtime
**Option 1: Node.js** (Recommended)
- ✅ Mature ecosystem
- ✅ Easy containerization
- ✅ Team familiarity
- ✅ Libraries: Express, Fastify, Hono

**Option 2: Bun** (Alternative)
- ✅ Fast
- ✅ TypeScript native
- ⚠️ Less mature ecosystem

#### ORM/Query Builder
**Option 1: Prisma** (Recommended)
```typescript
const queue = await prisma.appointment.findMany({
  where: { clinicId, status: 'waiting' },
  include: { patient: true },
  orderBy: { queuePosition: 'asc' },
});
```
- ✅ Type-safe
- ✅ Great DX
- ✅ Migrations
- ✅ Works with Supabase

**Option 2: Drizzle ORM** (Alternative)
- ✅ Lighter
- ✅ SQL-like syntax
- ✅ Edge-compatible

#### Validation
**Zod** (Recommended)
```typescript
const CreateAppointmentSchema = z.object({
  clinicId: z.string().uuid(),
  patientId: z.string().uuid(),
  appointmentType: z.enum(['consultation', 'follow_up']),
  scheduledTime: z.string().datetime(),
});
```

#### Testing
**Vitest** (Recommended)
```typescript
describe('QueueService', () => {
  it('should call next present patient', async () => {
    const service = new QueueService();
    const result = await service.callNextPatient('clinic-123');
    expect(result.patient.isPresent).toBe(true);
  });
});
```

#### API Documentation
**Scalar** + **OpenAPI** (Recommended)
- ✅ Interactive docs
- ✅ Auto-generated from Zod schemas
- ✅ Beautiful UI

#### Logging
**Pino** (Recommended)
```typescript
logger.info({ clinicId, patientId }, 'Patient called');
```

#### Caching
**Redis** (For high-traffic)
```typescript
const cachedQueue = await redis.get(`queue:${clinicId}`);
```

---

## 🤖 AI Agent Integration Guide

### API Design for AI Agents

#### 1. Tool Definition Format (LangChain)

```typescript
// tools/queuemed-tools.ts
export const queuemedTools = [
  {
    name: "get_queue_status",
    description: "Get the current queue status for a clinic. Returns waiting patients, current patient, and statistics.",
    parameters: {
      type: "object",
      properties: {
        clinicId: {
          type: "string",
          description: "The UUID of the clinic"
        }
      },
      required: ["clinicId"]
    },
    execute: async (params: { clinicId: string }) => {
      const response = await fetch(`/api/v1/clinics/${params.clinicId}/queue`);
      return await response.json();
    }
  },
  {
    name: "call_next_patient",
    description: "Call the next patient in the queue. Automatically selects the next present patient and skips absent ones.",
    parameters: {
      type: "object",
      properties: {
        clinicId: {
          type: "string",
          description: "The UUID of the clinic"
        },
        staffId: {
          type: "string",
          description: "The UUID of the staff member performing the action"
        }
      },
      required: ["clinicId", "staffId"]
    },
    execute: async (params) => {
      const response = await fetch(
        `/api/v1/clinics/${params.clinicId}/queue/call-next`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staffId: params.staffId })
        }
      );
      return await response.json();
    }
  },
  {
    name: "mark_patient_absent",
    description: "Mark a patient as absent. This starts a grace period (default 10 minutes) for the patient to return.",
    parameters: {
      type: "object",
      properties: {
        appointmentId: {
          type: "string",
          description: "The UUID of the appointment"
        },
        reason: {
          type: "string",
          description: "Reason for marking absent"
        },
        staffId: {
          type: "string",
          description: "The UUID of the staff member"
        }
      },
      required: ["appointmentId", "staffId"]
    }
  },
  // ... more tools
];
```

#### 2. Example AI Agent Use Cases

**Use Case 1: Automated Queue Management**
```typescript
// AI Agent monitors queue and auto-calls patients
const agent = new AutoGPT({
  tools: queuemedTools,
  goal: "Manage the clinic queue efficiently"
});

// Agent can:
// 1. Check queue status every 5 minutes
// 2. Call next patient when current is done
// 3. Send reminders to patients nearing their turn
// 4. Mark no-shows as absent automatically
```

**Use Case 2: Patient Inquiry Bot**
```typescript
// Chatbot answers patient questions
const chatbot = new ChatBot({
  tools: queuemedTools,
  systemPrompt: "You are a helpful clinic assistant."
});

// Patient: "What's my position in the queue?"
// Bot: *calls get_queue_status* "You are #3 in the queue"
```

**Use Case 3: Predictive Scheduling**
```typescript
// ML model predicts wait times and suggests appointments
const predictor = new MLAgent({
  tools: [...queuemedTools, ...analyticsTools],
  model: "gpt-4"
});

// Analyzes historical data and suggests optimal times
```

### API Authentication for AI Agents

```typescript
// Generate API key for AI agent
POST /api/v1/auth/api-keys
{
  "name": "Queue Management Bot",
  "scopes": ["queue:read", "queue:write"],
  "expiresAt": "2026-01-01T00:00:00Z"
}

// Use API key
GET /api/v1/clinics/{id}/queue
Authorization: Bearer qm_1234567890abcdef
```

---

## 🔒 Security Considerations

### 1. API Security

#### Rate Limiting
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

app.use('/api/', limiter);
```

#### Input Validation
```typescript
import { validate } from './middleware/validation';

app.post(
  '/api/v1/appointments',
  validate(CreateAppointmentSchema),
  createAppointment
);
```

#### SQL Injection Prevention
- ✅ Use Prisma/ORM (parameterized queries)
- ✅ Never concatenate SQL strings
- ✅ Keep RLS policies in database

### 2. Data Privacy

#### GDPR Compliance
- [ ] Patient data encryption at rest
- [ ] Right to be forgotten implementation
- [ ] Data export functionality
- [ ] Audit logs for data access

#### HIPAA Considerations (if applicable)
- [ ] End-to-end encryption
- [ ] Access controls
- [ ] Audit trails
- [ ] Data retention policies

---

## 📊 Performance Optimization

### 1. Database Optimization

#### Indexes (Already implemented ✅)
```sql
CREATE INDEX idx_appointments_clinic_date 
  ON appointments(clinic_id, appointment_date);
  
CREATE INDEX idx_appointments_queue 
  ON appointments(clinic_id, queue_position) 
  WHERE status IN ('waiting', 'scheduled');
```

#### Query Optimization
```typescript
// ❌ N+1 Query Problem
for (const appointment of appointments) {
  const patient = await prisma.patient.findUnique({
    where: { id: appointment.patientId }
  });
}

// ✅ Eager Loading
const appointments = await prisma.appointment.findMany({
  include: { patient: true }
});
```

### 2. Caching Strategy

#### Redis Cache
```typescript
export class QueueService {
  async getQueueStatus(clinicId: string): Promise<QueueStatus> {
    const cacheKey = `queue:${clinicId}`;
    
    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
    
    // Fetch from DB
    const queue = await this.repository.getActiveQueue(clinicId);
    
    // Cache for 30 seconds
    await redis.setex(cacheKey, 30, JSON.stringify(queue));
    
    return queue;
  }
}
```

### 3. Real-time Optimization

#### Current: Supabase Realtime
```typescript
// Filtered subscription (reduces load)
supabase
  .channel(`queue:${clinicId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'appointments',
    filter: `clinic_id=eq.${clinicId}`
  }, handleUpdate)
  .subscribe();
```

#### Future: WebSocket Server
```typescript
// Custom WebSocket for more control
io.of('/queue').on('connection', (socket) => {
  socket.join(`clinic:${socket.clinicId}`);
  
  // Broadcast to room
  io.to(`clinic:${clinicId}`).emit('queue:updated', queue);
});
```

---

## 🎯 Success Metrics

### Technical Metrics
- [ ] API response time < 200ms (p95)
- [ ] Database query time < 50ms (p95)
- [ ] Test coverage > 80%
- [ ] Zero critical security vulnerabilities
- [ ] Uptime > 99.9%

### Business Metrics
- [ ] Patient wait time reduced by 30%
- [ ] Staff efficiency increased by 25%
- [ ] Patient satisfaction > 4.5/5
- [ ] Clinic onboarding time < 30 minutes

### Developer Experience
- [ ] Local setup time < 10 minutes
- [ ] CI/CD pipeline < 10 minutes
- [ ] Clear documentation for all APIs
- [ ] Hot reload works reliably

---

## 📖 Documentation Requirements

### 1. API Documentation
- [ ] OpenAPI specification
- [ ] Interactive API explorer (Scalar/Swagger)
- [ ] Authentication guide
- [ ] Example requests/responses
- [ ] Error codes reference

### 2. Architecture Documentation
- [ ] System architecture diagrams
- [ ] Data flow diagrams
- [ ] Sequence diagrams for key workflows
- [ ] Database schema documentation
- [ ] Deployment architecture

### 3. Developer Guides
- [ ] Getting started guide
- [ ] Local development setup
- [ ] Testing guide
- [ ] Deployment guide
- [ ] Troubleshooting guide

### 4. AI Agent Integration Guide
- [ ] Tool definitions
- [ ] Authentication setup
- [ ] Example agent implementations
- [ ] Best practices

---

## 🚀 Next Steps

### Immediate Actions (This Week)
1. **Review this document** with team
2. **Decide on architecture approach**: Hybrid vs. Full migration
3. **Create project board** with roadmap tasks
4. **Set up branch strategy** for incremental changes
5. **Schedule architecture review meetings** (weekly)

### Week 1 Tasks
1. Create `src/services/` directory structure
2. Implement QueueService wrapper
3. Update one component to use service layer (proof of concept)
4. Write first unit tests
5. Document patterns and conventions

### Questions to Answer
- [ ] Do we want to keep Supabase long-term or migrate?
- [ ] What's the timeline for AI agent integration?
- [ ] Do we need HIPAA compliance?
- [ ] What's the expected scale (clinics, patients/day)?
- [ ] What's the budget for infrastructure?

---

## 🤝 Team Structure Recommendations

### Roles Needed
- **Backend Engineer** - Service layer, APIs
- **Frontend Engineer** - React components, UI/UX
- **DevOps Engineer** - Containerization, CI/CD
- **QA Engineer** - Testing infrastructure
- **AI/ML Engineer** - Agent integration, predictions

### Knowledge Gaps to Fill
- [ ] Domain-Driven Design (DDD)
- [ ] Event-driven architecture
- [ ] Container orchestration (Kubernetes)
- [ ] API design best practices
- [ ] Testing strategies (TDD/BDD)

---

## 📚 Recommended Resources

### Books
- *Domain-Driven Design* by Eric Evans
- *Building Microservices* by Sam Newman
- *Clean Architecture* by Robert C. Martin

### Online
- [OpenAPI Specification](https://swagger.io/specification/)
- [The Twelve-Factor App](https://12factor.net/)
- [Martin Fowler's Blog](https://martinfowler.com/)
- [LangChain Documentation](https://langchain.com/docs)

---

**Document Version**: 1.0.0  
**Last Updated**: October 15, 2025  
**Author**: AI Architecture Consultant  
**Status**: Draft - Awaiting Review
