# 🏥 Salam Queue Flow - Codebase Exploration Summary

**Date**: Current  
**Project**: Moroccan Healthcare Platform (Inspired by Doctolib, Palantir Healthcare, Oracle)

---

## 📋 Executive Summary

This is a **React + TypeScript** healthcare queue management platform built for the Moroccan market. The system focuses on solving the critical queue management problem in Moroccan healthcare, providing real-time updates, ML-powered wait time predictions, and an all-in-one patient experience.

---

## 🏗️ Technology Stack

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **UI Library**: shadcn/ui (Radix UI components)
- **Styling**: Tailwind CSS
- **State Management**: React Query (TanStack Query)
- **Routing**: React Router v6
- **Internationalization**: i18next (Arabic, English, French)
- **Form Handling**: React Hook Form + Zod validation

### Backend
- **Database**: Supabase (PostgreSQL)
- **Backend Services**: Supabase Edge Functions (Deno)
- **Real-time**: Supabase Realtime subscriptions
- **Authentication**: Supabase Auth
- **Notifications**: Twilio SMS

### Architecture Pattern
- **Service Layer Architecture** (in progress)
- **Domain-Driven Design** (partial)
- **Event-Driven Communication** (EventBus pattern)
- **Repository Pattern** (QueueRepository)

---

## ✅ Implemented Features

### 1. **Queue Management System** ⭐ Core Feature
**Location**: `src/services/queue/`

**Key Components**:
- `QueueService.ts` - Main service orchestrating queue operations
- `QueueRepository.ts` - Data access layer
- `EnhancedQueueManager.tsx` - Clinic-side queue UI
- `MyQueue.tsx` - Patient-side queue view

**Features**:
- ✅ Real-time queue position tracking
- ✅ Dynamic queue override system (skip, absent, late arrival)
- ✅ Grace period for absent patients (15 minutes default)
- ✅ Queue position reordering
- ✅ Check-in functionality
- ✅ Walk-in patient support
- ✅ Guest patient support (for non-registered patients)

**Database Tables**:
- `appointments` - Main appointment/queue entries
- `absent_patients` - Grace period tracking
- `queue_overrides` - Audit trail for queue changes
- `queue_snapshots` - Historical queue state

---

### 2. **ML-Based Wait Time Prediction** 🤖
**Location**: `src/services/queue/estimators/`

**Current Implementation**:
- ✅ **Simulated ML Estimator** (`SimulatedMlWaitTimeEstimator.ts`)
- ✅ **Basic Estimator** (`BasicWaitTimeEstimator.ts`)
- ✅ **Factory Pattern** (`QueueEstimatorFactory.ts`)

**Features**:
- ✅ Hybrid estimation mode (basic, ML, hybrid)
- ✅ Confidence scoring
- ✅ Historical feature aggregation
- ✅ Real-time prediction updates
- ✅ Feature snapshot recording for ML training

**Database Tables**:
- `appointment_metrics` - Stores predictions and actuals for model training
- `queue_snapshots` - Historical data for feature engineering

**Current Status**: 
- ⚠️ **Simulated ML** - Ready for real ML model integration
- The system collects all necessary features for ML training
- Prediction infrastructure is in place, needs real ML endpoint

**ML Features Collected**:
- Queue position, length, staff load
- Appointment type, complexity
- Historical averages (wait time, service duration)
- Patient punctuality, lateness
- Day of week, holiday flags
- Staff utilization

---

### 3. **Real-Time Notifications** 📱
**Location**: `src/services/notification/`

**Features**:
- ✅ SMS notifications via Twilio
- ✅ Multi-language templates (Arabic, English, French)
- ✅ Notification budget tracking per clinic
- ✅ Delivery status tracking
- ✅ Retry mechanism
- ✅ Cost estimation

**Notification Types**:
- Appointment confirmed
- Position update
- Almost your turn
- Your turn
- Appointment delayed
- Appointment cancelled
- Patient absent
- Grace period ending

**Database Tables**:
- `notifications` - Notification records
- `notification_templates` - Customizable templates
- `clinic_notification_budgets` - Budget management
- `notification_analytics` - Delivery metrics

**Channels Supported**:
- ✅ SMS (implemented)
- ⏳ WhatsApp (placeholder)
- ⏳ Email (placeholder)
- ⏳ Push (placeholder)

---

### 4. **Patient Experience** 👤
**Location**: `src/pages/patient/`

**Features**:
- ✅ Patient dashboard with appointment history
- ✅ Real-time queue tracking (`MyQueue.tsx`)
- ✅ Appointment booking flow
- ✅ Clinic browsing and search
- ✅ Favorite clinics
- ✅ Patient profile management
- ✅ Review system for completed appointments
- ✅ Appointment cancellation

**Key Pages**:
- `PatientDashboard.tsx` - Main patient hub
- `MyQueue.tsx` - Real-time queue view with predictions
- `PatientProfile.tsx` - Profile and favorites

**Patient Journey**:
1. Browse clinics → 2. Book appointment → 3. Check in → 4. Track queue → 5. Get notified → 6. Complete visit → 7. Leave review

---

### 5. **Clinic Management** 🏥
**Location**: `src/pages/clinic/`

**Features**:
- ✅ Clinic dashboard
- ✅ Queue management interface
- ✅ Calendar view
- ✅ Team management
- ✅ Staff invitations
- ✅ Clinic settings
- ✅ Walk-in patient addition
- ✅ Appointment booking by staff

**Key Pages**:
- `ClinicDashboard.tsx` - Clinic overview
- `ClinicQueue.tsx` - Daily queue management
- `ClinicCalendar.tsx` - Calendar view
- `TeamManagement.tsx` - Staff management
- `ClinicSettings.tsx` - Configuration

---

### 6. **Multi-Tenant Architecture** 🏢
**Features**:
- ✅ Row Level Security (RLS) on all tables
- ✅ Clinic isolation by `clinic_id`
- ✅ Role-based access control (RBAC)
- ✅ Staff role management
- ✅ Clinic owner permissions

**Roles**:
- `super_admin`
- `clinic_owner`
- `staff`
- `patient`

---

### 7. **Internationalization** 🌍
**Location**: `src/locales/`

**Languages**:
- ✅ Arabic (`ar/translation.json`)
- ✅ English (`en/translation.json`)
- ✅ French (`fr/translation.json`)

**Coverage**: UI components, notifications, error messages

---

## ❌ Missing Features (From Your Requirements)

### 1. **Digital Prescriptions** 📋
**Status**: ❌ Not Implemented

**What's Needed**:
- Prescription creation by doctors
- Digital signature support
- Prescription history for patients
- PDF generation
- Pharmacy integration (optional)
- Medication tracking

**Suggested Implementation**:
```typescript
// New service: src/services/prescription/PrescriptionService.ts
// New table: prescriptions
// New table: prescription_items
// New page: src/pages/patient/Prescriptions.tsx
```

---

### 2. **Comprehensive Patient History** 📚
**Status**: ⚠️ Partially Implemented

**Current State**:
- ✅ Appointment history exists (`PatientDashboard.tsx`)
- ✅ `patient_clinic_history` table exists (aggregated stats)
- ❌ Detailed visit history with notes
- ❌ Medical records
- ❌ Test results
- ❌ Diagnosis history

**What's Needed**:
- Visit notes and summaries
- Medical records storage
- Test results upload/view
- Diagnosis tracking
- Treatment history

---

### 3. **GDPR Compliance** 🔒
**Status**: ⚠️ Basic RLS, No Explicit GDPR Features

**Current State**:
- ✅ Row Level Security (RLS) - Data isolation
- ✅ Multi-tenant architecture
- ❌ Data export functionality
- ❌ Data deletion (right to be forgotten)
- ❌ Consent management
- ❌ Privacy policy acceptance tracking
- ❌ Data access logs
- ❌ Anonymization tools

**What's Needed**:
```typescript
// New service: src/services/gdpr/GdprService.ts
// Features:
// - Export patient data (JSON/PDF)
// - Delete patient data (with cascade)
// - Consent tracking
// - Privacy policy versioning
// - Data access audit logs
```

---

### 4. **Real ML Model Integration** 🤖
**Status**: ⚠️ Simulated, Ready for Real ML

**Current State**:
- ✅ Feature collection infrastructure
- ✅ Prediction pipeline
- ✅ Historical data storage
- ❌ Real ML model endpoint
- ❌ Model training pipeline
- ❌ Model versioning

**What's Needed**:
- ML model API endpoint (Python/Node.js)
- Model training pipeline
- Feature engineering service
- Model deployment infrastructure
- A/B testing framework

**Suggested Architecture**:
```
Frontend → QueueService → ML Estimator → [Real ML API]
                                         ↓
                                    Feature Engineering
                                         ↓
                                    Model Prediction
                                         ↓
                                    Confidence + ETA
```

---

## 📊 Database Schema Overview

### Core Tables
- `clinics` - Clinic information
- `profiles` - User profiles (patients/staff)
- `appointments` - Appointments with queue positions
- `clinic_staff` - Staff members
- `user_roles` - Role assignments

### Queue Management
- `appointments` - Main queue entries
- `absent_patients` - Absent patient tracking
- `queue_overrides` - Queue change audit
- `queue_snapshots` - Historical queue states

### ML & Analytics
- `appointment_metrics` - Prediction records
- `queue_snapshots` - Feature data
- `patient_clinic_history` - Patient behavior stats

### Notifications
- `notifications` - Notification records
- `notification_templates` - Message templates
- `clinic_notification_budgets` - Budget tracking
- `notification_analytics` - Delivery metrics

### Missing Tables (For Your Requirements)
- `prescriptions` - Digital prescriptions
- `prescription_items` - Prescription line items
- `medical_records` - Patient medical history
- `test_results` - Lab/test results
- `gdpr_consents` - Consent tracking
- `data_exports` - Export history
- `audit_logs` - Enhanced GDPR audit (partially exists)

---

## 🎯 Architecture Highlights

### Service Layer (In Progress)
```
src/services/
├── queue/              ✅ Complete
│   ├── QueueService.ts
│   ├── repositories/
│   ├── estimators/
│   ├── events/
│   └── models/
├── notification/       ✅ Complete
│   ├── NotificationService.ts
│   └── models/
├── rating/             ✅ Basic
├── favorite/           ✅ Basic
└── shared/             ✅ Utilities
    ├── errors/
    ├── events/
    └── logging/
```

### Event-Driven System
- `EventBus` for decoupled communication
- Queue events: PatientAdded, PatientCalled, PositionChanged, etc.
- Notification events trigger on queue changes

### Repository Pattern
- `QueueRepository` abstracts database access
- Clean separation of concerns
- Easy to test and mock

---

## 🚀 Next Steps & Recommendations

### Priority 1: Complete Core Features
1. **Digital Prescriptions**
   - Create prescription service
   - Add prescription tables
   - Build prescription UI for doctors
   - Patient prescription history page

2. **Enhanced Patient History**
   - Visit notes and summaries
   - Medical records storage
   - Test results management

3. **GDPR Compliance**
   - Data export functionality
   - Data deletion workflow
   - Consent management
   - Privacy policy tracking

### Priority 2: ML Enhancement
1. **Real ML Model**
   - Set up ML API endpoint
   - Implement feature engineering
   - Deploy model (Python/Node.js)
   - A/B testing framework

2. **Model Training Pipeline**
   - Automated training from `appointment_metrics`
   - Model versioning
   - Performance monitoring

### Priority 3: Polish & Scale
1. **WhatsApp Notifications** (High demand in Morocco)
2. **Mobile App** (React Native)
3. **Pharmacy Integration** (for prescriptions)
4. **Payment Integration** (if needed)
5. **Analytics Dashboard** (for clinics)

---

## 📁 Key File Locations

### Services
- Queue: `src/services/queue/QueueService.ts`
- Notifications: `src/services/notification/NotificationService.ts`
- ML Estimator: `src/services/queue/estimators/SimulatedMlWaitTimeEstimator.ts`

### Pages
- Patient Dashboard: `src/pages/patient/PatientDashboard.tsx`
- Patient Queue: `src/pages/patient/MyQueue.tsx`
- Clinic Queue: `src/pages/clinic/ClinicQueue.tsx`

### Components
- Queue Manager: `src/components/clinic/EnhancedQueueManager.tsx`
- Booking Flow: `src/components/booking/BookingFlow.tsx`

### Database Types
- Supabase Types: `src/integrations/supabase/types.ts`

---

## 🔍 Code Quality Notes

### Strengths ✅
- Clean service layer architecture
- Type-safe with TypeScript
- Good separation of concerns
- Event-driven design
- Comprehensive error handling
- Real-time updates via Supabase

### Areas for Improvement ⚠️
- Testing coverage (mentioned in README, not yet implemented)
- Some business logic still in components (migration in progress)
- ML model is simulated (needs real implementation)
- GDPR features need explicit implementation

---

## 💡 Moroccan Context Adaptations

### Already Implemented ✅
- Arabic language support
- SMS notifications (primary in Morocco)
- Phone number-based authentication
- Grace period for late arrivals (cultural consideration)

### Recommended Additions 🇲🇦
- WhatsApp notifications (very popular in Morocco)
- French language (widely used in healthcare)
- Moroccan phone number validation
- Local payment methods (if monetizing)
- Integration with Moroccan health insurance systems

---

## 📞 Support & Documentation

- **Architecture Docs**: Referenced in README (ARCHITECTURE_README.md)
- **API Docs**: Coming in Week 7-10 (per README)
- **Testing**: Vitest setup planned

---

**This codebase is well-structured and ready for the features you mentioned. The foundation is solid for building a comprehensive healthcare platform for Morocco!** 🚀

