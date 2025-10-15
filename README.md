# 🏥 QueueMed - Healthcare Queue Management System

**Status**: MVP → Production-Ready Architecture Transformation 🚀  
**Version**: 2.0.0 (Architecture Redesign)  
**Date**: October 15, 2025

---

## 🎯 Project Overview

QueueMed is a modern healthcare queue management platform that helps medical clinics optimize patient flow with real-time updates, SMS notifications, and AI-powered predictions.

### Current Features ✅
- ✅ Real-time queue management
- ✅ Dynamic queue override system (skip, absent, late arrival)
- ✅ SMS notifications via Twilio
- ✅ Multi-tenant architecture (clinic isolation)
- ✅ Role-based access control (RBAC)
- ✅ Bilingual UI (Arabic/English)
- ✅ Budget tracking for notifications

### Coming Soon 🚀
- 🔧 Service layer architecture (Week 1-4)
- 🧪 80%+ test coverage (Week 5-6)
- 🌐 RESTful APIs for AI agents (Week 7-10)
- 📊 Production monitoring (Week 11-12)

---

## 📚 **NEW: Architecture Documentation**

We've created comprehensive architecture documentation to transform QueueMed into a production-ready, modular, AI-enabled platform.

### 🎯 Start Here: [ARCHITECTURE_README.md](./ARCHITECTURE_README.md)

This is your **complete guide** to all architecture documents. It includes:
- Reading paths by role (Product Owner, Developer, etc.)
- Quick reference to key concepts
- Links to all detailed documents

### 📋 Key Documents

| Document | Purpose | Best For |
|----------|---------|----------|
| [**EXECUTIVE_SUMMARY.md**](./EXECUTIVE_SUMMARY.md) | High-level overview (20 min read) | Everyone - Start here! |
| [**ARCHITECTURE_ANALYSIS.md**](./ARCHITECTURE_ANALYSIS.md) | Deep technical analysis (1-2 hours) | Architects, Senior Devs |
| [**IMPLEMENTATION_GUIDE.md**](./IMPLEMENTATION_GUIDE.md) | Code examples & patterns (2-3 hours) | Developers implementing changes |
| [**MIGRATION_ROADMAP.md**](./MIGRATION_ROADMAP.md) | Week-by-week migration plan (1-2 hours) | Project Managers, Team Leads |
| [**TODO.md**](./TODO.md) | Week-by-week checklist | Everyone - Track progress |
| [**ARCHITECTURE_DIAGRAMS.md**](./ARCHITECTURE_DIAGRAMS.md) | Visual architecture diagrams | Visual learners |

### 🚀 Quick Start for Team

1. **This Week** (Week 0):
   - [ ] Everyone reads [EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md) (20 min)
   - [ ] Schedule team kickoff meeting (2 hours)
   - [ ] Create project board with tasks from [TODO.md](./TODO.md)

2. **Next Week** (Week 1):
   - [ ] Start implementing service layer
   - [ ] Follow [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md)
   - [ ] First training session: Domain-Driven Design

---

## 🏛️ Architecture Transformation

### Current Architecture (Before)
```
React Components → Supabase Client → PostgreSQL
     ↓                    ↓
Business Logic    Edge Functions (Deno)
```

**Problems**:
- ❌ Business logic scattered
- ❌ Hard to test
- ❌ No API for AI agents

### Target Architecture (After)
```
Presentation Layer (React, Mobile, APIs)
        ↓
Application Layer (Services)
        ↓
Domain Layer (Business Logic)
        ↓
Infrastructure Layer (Database, External APIs)
```

**Benefits**:
- ✅ Testable (80%+ coverage)
- ✅ Maintainable (clear boundaries)
- ✅ Scalable (container-ready)
- ✅ AI-ready (RESTful APIs)

See [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md) for full diagrams.

---

## 🛠️ Technology Stack

### Current Stack
- **Frontend**: React 18 + TypeScript + Vite + shadcn/ui + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Edge Functions + Auth + Realtime)
- **Notifications**: Twilio SMS
- **Testing**: None → **Adding Vitest**
- **API**: None → **Adding RESTful API**

### Future Additions (Phase 2-3)
- **Service Layer**: QueueService, NotificationService, ClinicService
- **Testing**: Vitest with 80%+ coverage
- **API Server**: Express/Hono with OpenAPI docs
- **Monitoring**: Sentry, Grafana, structured logging
- **Container**: Docker → Kubernetes (Phase 4+)

---

## 💻 Development

### Prerequisites
- Node.js 20+ with npm
- Supabase account (or local Supabase via Docker)
- Twilio account (optional, simulation mode available)

### Local Setup


```bash
# Clone repository
git clone <repository-url>
cd salam-queue-flow

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Run database migrations
npx supabase db push

# Start development server
npm run dev
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm test             # Run tests (after Week 1)
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Generate coverage report
```

---

## 🧪 Testing (New in Week 1)

We're implementing comprehensive testing with **Vitest**.

### Run Tests
```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
npm run test:ui          # Interactive UI
```

### Test Structure
```
src/
├── services/
│   └── queue/
│       ├── QueueService.ts
│       └── QueueService.test.ts  # ✅ Unit tests
│
└── test/
    ├── setup.ts                  # Test configuration
    ├── fixtures/                 # Test data
    └── mocks/                    # Mock implementations
```

**Target**: 80%+ coverage by Week 6

---

## 🌐 API Documentation (Coming in Week 7)

RESTful APIs for AI agents and external integrations.

### Endpoints (Preview)
```
GET    /api/v1/clinics/:id/queue          # Get queue status
POST   /api/v1/clinics/:id/queue/call-next # Call next patient
POST   /api/v1/clinics/:id/queue/mark-absent # Mark patient absent
POST   /api/v1/appointments                # Book appointment
```

### Authentication
```bash
# API Key
Authorization: Bearer qm_your_api_key_here

# JWT Token
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Interactive Docs**: Available at `/api/docs` (Week 9)

---

## 🤖 AI Agent Integration (Coming in Week 9)

QueueMed will provide AI-ready APIs with OpenAPI specification.

### Example: LangChain Tool
```typescript
import { queuemedTools } from '@queuemed/langchain-tools';

const agent = new ChatAgent({
  tools: queuemedTools,
  // AI can now:
  // - Check queue status
  // - Call next patient
  // - Get wait time predictions
});
```

### Example: Custom Bot
```typescript
// Simple chatbot that answers patient questions
const status = await fetch('/api/v1/clinics/123/queue');
const data = await status.json();

console.log(`You are #${data.yourPosition} in the queue`);
console.log(`Estimated wait: ${data.estimatedWaitTime} minutes`);
```

See [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md#api-layer-for-ai-agents) for full examples.

---

## 📂 Project Structure

```
salam-queue-flow/
├── src/
│   ├── services/              # 🆕 Application services (Week 1-4)
│   │   ├── queue/             # Queue management
│   │   ├── notification/      # SMS, Email, Push
│   │   ├── clinic/            # Clinic operations
│   │   └── shared/            # Shared utilities
│   │
│   ├── api/                   # 🆕 REST API (Week 7-10)
│   │   └── v1/                # API version 1
│   │
│   ├── components/            # React components
│   │   ├── clinic/            # Clinic-specific UI
│   │   ├── booking/           # Booking flow
│   │   └── ui/                # shadcn/ui components
│   │
│   ├── hooks/                 # Custom React hooks
│   ├── pages/                 # Page components
│   ├── integrations/          # External integrations
│   └── lib/                   # Utilities
│
├── supabase/
│   ├── functions/             # Edge Functions
│   └── migrations/            # Database migrations
│
├── docs/                      # 🆕 Architecture docs
│   ├── EXECUTIVE_SUMMARY.md
│   ├── ARCHITECTURE_ANALYSIS.md
│   ├── IMPLEMENTATION_GUIDE.md
│   ├── MIGRATION_ROADMAP.md
│   └── ARCHITECTURE_DIAGRAMS.md
│
└── README.md                  # This file
```

---

## 🗂️ Database Schema

See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) for full schema.

### Key Tables
- `clinics` - Clinic information
- `appointments` - Patient appointments with queue positions
- `absent_patients` - Grace period tracking
- `queue_overrides` - Audit trail for queue changes
- `clinic_notification_budgets` - SMS budget tracking
- `notification_templates` - Multilingual templates

### Security
- ✅ Row Level Security (RLS) on all tables
- ✅ Multi-tenant isolation by clinic_id
- ✅ Role-based access control (RBAC)

---

## 🚀 Deployment

### Current (Supabase)
```bash
# Deploy Edge Functions
npx supabase functions deploy smart-queue-manager
npx supabase functions deploy send-sms

# Deploy frontend (Vercel/Netlify)
npm run build
# Upload dist/ folder
```

### Future (Containers - Week 13+)
```bash
# Build Docker image
docker build -t queuemed-api .

# Run locally
docker-compose up

# Deploy to cloud
# - Google Cloud Run
# - AWS ECS
# - Kubernetes
```

---

## 🔐 Environment Variables

```bash
# .env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Supabase Secrets (Edge Functions)
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=+1234567890
```

---

## 📊 Roadmap

### ✅ Completed (MVP)
- [x] Queue management system
- [x] SMS notifications
- [x] Real-time updates
- [x] Multi-tenant architecture
- [x] Bilingual UI

### 🔧 In Progress (Weeks 1-4)
- [ ] Service layer architecture
- [ ] Domain-driven design
- [ ] Event-driven communication
- [ ] Component migration

### 🎯 Upcoming (Weeks 5-12)
- [ ] 80%+ test coverage
- [ ] RESTful APIs
- [ ] OpenAPI documentation
- [ ] AI agent examples
- [ ] Production monitoring

### 🚀 Future (Months 4+)
- [ ] Mobile app (React Native)
- [ ] WhatsApp notifications
- [ ] ML-powered predictions
- [ ] Kubernetes deployment

---

## 👥 Team

- **Architecture**: [Your Team]
- **Backend**: [Your Team]
- **Frontend**: [Your Team]
- **DevOps**: [Your Team]

---

## 📄 License

Internal Use Only - [Your Organization]

---

## 🆘 Need Help?

### Documentation
- **Start here**: [ARCHITECTURE_README.md](./ARCHITECTURE_README.md)
- **Quick overview**: [EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md)
- **Implementation**: [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md)
- **Timeline**: [MIGRATION_ROADMAP.md](./MIGRATION_ROADMAP.md)

### Support
- **Slack**: #architecture
- **Office Hours**: Tuesdays/Thursdays 3-5pm
- **Issues**: [GitHub Issues](https://github.com/your-org/your-repo/issues)

---

**Status**: 🚀 Ready for Architecture Transformation  
**Next Step**: Read [ARCHITECTURE_README.md](./ARCHITECTURE_README.md)  
**Questions?**: See [EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md#faq)

**Let's build something great! 💪**
