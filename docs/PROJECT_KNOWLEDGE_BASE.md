# 🏥 QueueMed - Complete Project Knowledge Base

**Last Updated**: January 2025  
**Version**: 2.0.0 (Production-Ready Architecture)  
**Status**: Active Development → ML Implementation Phase

---

## 📋 Table of Contents

1. [Project Vision & Goals](#project-vision--goals)
2. [Current State & Status](#current-state--status)
3. [Architecture Overview](#architecture-overview)
4. [Technology Stack](#technology-stack)
5. [Features Implemented](#features-implemented)
6. [ML Implementation Strategy](#ml-implementation-strategy)
7. [Database Schema](#database-schema)
8. [Service Layer Architecture](#service-layer-architecture)
9. [Key Architectural Decisions](#key-architectural-decisions)
10. [Moroccan Context Adaptations](#moroccan-context-adaptations)
11. [Roadmap & Future Features](#roadmap--future-features)
12. [Best Practices & Standards](#best-practices--standards)
13. [Testing Strategy](#testing-strategy)
14. [Deployment & Infrastructure](#deployment--infrastructure)

---

## 🎯 Project Vision & Goals

### **Mission Statement**
QueueMed (also referred to as "Salam Queue Flow" or "INTIDAR") is a modern healthcare queue management platform designed specifically for the Moroccan healthcare market. Inspired by world leaders like Doctolib, Palantir Healthcare, and Oracle, the platform aims to revolutionize patient experience in Moroccan clinics by solving the critical queue management problem.

### **Core Problem Statement**
In Moroccan healthcare, even with scheduled appointments, patients face unpredictable and often excessive wait times. This creates frustration, reduces clinic efficiency, and degrades the overall healthcare experience.

### **Solution Vision**
An all-in-one healthcare platform that provides:
1. **Real-time queue management** with dynamic position tracking
2. **ML-powered wait time predictions** to set accurate patient expectations
3. **Proactive notifications** (SMS, WhatsApp) to keep patients informed
4. **Digital prescriptions** and comprehensive patient history
5. **GDPR-compliant** data management
6. **Multi-tenant architecture** supporting multiple clinics

### **Target Users**
- **Patients**: Mobile-first experience for booking, tracking, and managing appointments
- **Clinic Owners**: Dashboard for managing operations, staff, and patient flow
- **Clinic Staff**: Queue management interface for daily operations
- **Doctors**: Prescription management and patient history (future)

### **Success Metrics**
- Reduced average wait times
- Improved patient satisfaction scores
- Increased clinic efficiency (patients per day)
- Higher appointment completion rates
- Lower no-show rates

---

## 📊 Current State & Status

### **Development Phase**
- ✅ **MVP Complete**: Core queue management functional
- ✅ **Architecture Refactoring**: Service layer pattern implemented
- ✅ **ML Estimation System**: Event-driven wait time estimation implemented (rule-based MVP)
- ✅ **Performance Optimization**: Eliminated redundant requests and duplicate fetches
- ⏳ **Real ML Model**: External ML service integration (planned)
- ⏳ **Feature Expansion**: Digital prescriptions, enhanced history (planned)

### **Codebase Health**
- ✅ **33 Database Functions**: Cleaned up, all critical functions present
- ✅ **Service Layer**: QueueService, PatientService, ClinicService, StaffService
- ✅ **ML Services**: WaitTimeEstimationService, WaitTimeEstimationOrchestrator, DisruptionDetector
- ✅ **Repository Pattern**: All services use repositories (no direct Supabase calls)
- ✅ **RLS Policies**: Updated and functional
- ✅ **Type Safety**: Full TypeScript coverage
- ✅ **Performance**: Optimized to eliminate duplicate API calls and redundant subscriptions
- ⏳ **Test Coverage**: Testing framework planned (Vitest)

### **Recent Achievements**
1. ✅ **Service Layer Refactoring**: Created PatientService, ClinicService, StaffService with Repository Pattern
2. ✅ **Component Refactoring**: All components now use services instead of direct database calls
3. ✅ **ML Data Collection**: Actual wait time and queue snapshot collection implemented
4. ✅ **Database Cleanup**: Removed 6 redundant functions, updated RLS policies
5. ✅ **Architecture Correction**: Moved all ML processing to backend (MLOps best practices)
6. ✅ **Event-Driven Estimation**: Implemented smart wait time estimation system that only calculates when disruptions occur
7. ✅ **Strategy Pattern**: Implemented estimator strategy pattern (ML, Rule-Based, Historical Average) with fallback chain
8. ✅ **Database Schema Cleanup**: Removed redundant `scheduled_time` column, using `start_time` as single source of truth
9. ✅ **Performance Optimization**: Eliminated duplicate `useQueueService` calls, redundant schedule fetches, and unnecessary event subscriptions
10. ✅ **Code Quality**: Replaced console.log with structured logging, optimized service instance creation

---

## 🏗️ Architecture Overview

### **High-Level Architecture**

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React + TypeScript)             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Components  │→ │   Services   │→ │  Repositories│    │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Supabase (PostgreSQL + Edge Functions)        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Database   │  │ RPC Functions│  │ Edge Functions│    │
│  │  (PostgreSQL)│  │ (SECURITY    │  │  (Deno)      │      │
│  │              │  │  DEFINER)    │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              External Services                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ ML Service   │  │   Twilio     │  │  (Future)    │      │
│  │ (Python/     │  │   (SMS)      │  │  WhatsApp    │      │
│  │  FastAPI)    │  │              │  │  Integration  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### **Architecture Patterns**

#### **1. Service Layer Pattern**
```
Component → Service → Repository → Supabase Client
```
- **Components**: UI logic only, no business logic
- **Services**: Business logic, orchestration
- **Repositories**: Data access abstraction
- **Supabase Client**: Database communication

#### **2. Repository Pattern**
All services use dedicated repository classes:
- `QueueRepository` - Queue data access
- `PatientRepository` - Patient data access
- `ClinicRepository` - Clinic data access
- `StaffRepository` - Staff data access

#### **3. Event-Driven Communication**
- `EventBus` for decoupled component communication
- Queue events: `queue.patient.added`, `queue.appointment.status_changed`, etc.
- Notification events trigger on queue changes

#### **4. Multi-Tenant Architecture**
- Row Level Security (RLS) on all tables
- Clinic isolation by `clinic_id`
- Role-based access control (RBAC)
- `SECURITY DEFINER` functions for authorized operations

---

## 🛠️ Technology Stack

### **Frontend**
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **UI Library**: shadcn/ui (Radix UI components)
- **Styling**: Tailwind CSS
- **State Management**: React Query (TanStack Query)
- **Routing**: React Router v6
- **Internationalization**: i18next (Arabic, English, French)
- **Form Handling**: React Hook Form + Zod validation
- **Logging**: Custom Logger service

### **Backend**
- **Database**: Supabase (PostgreSQL 15+)
- **Backend Services**: Supabase Edge Functions (Deno runtime)
- **Real-time**: Supabase Realtime subscriptions
- **Authentication**: Supabase Auth (phone number-based)
- **Storage**: Supabase Storage (for future file uploads)

### **External Services**
- **SMS Notifications**: Twilio
- **ML Service**: External Python/FastAPI service (planned)
- **Future**: WhatsApp Business API

### **Development Tools**
- **Package Manager**: npm/yarn
- **Version Control**: Git
- **Code Quality**: ESLint, Prettier
- **Testing**: Vitest (planned)

---

## ✅ Features Implemented

### **1. Queue Management System** ⭐ Core Feature

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
- ✅ Clinic-wide and staff-specific queue modes
- ✅ Appointment status management (scheduled, waiting, in_progress, completed, cancelled)

**Database Tables**:
- `appointments` - Main appointment/queue entries
- `absent_patients` - Grace period tracking
- `queue_overrides` - Audit trail for queue changes
- `queue_snapshots` - Historical queue state

**RPC Functions**:
- `create_queue_entry` - Create new appointment
- `get_daily_schedule_for_clinic` - Fetch clinic-wide schedule
- `get_daily_schedule_for_staff` - Fetch staff-specific schedule
- `recalculate_queue_positions` - Reorder queue positions
- `record_actual_wait_time` - Store ML training data

---

### **2. Smart Wait Time Prediction System** 🤖

**Current Status**: ✅ Event-driven estimation system implemented with rule-based MVP

**Architecture** (Following MLOps Best Practices):
```
Frontend → WaitTimeEstimationService → Estimator Strategy (ML/Rule-Based/Historical)
         (displays predictions)       ↓
                                   External ML Service (future)
```

**Core Philosophy**:
- **Normal Flow**: Show scheduled time (no estimation needed)
- **Disruption Detected**: Calculate and show estimated time
- **Event-Driven**: Only recalculates when disruptions occur (no polling)

**Key Components**:

1. **`WaitTimeEstimationOrchestrator`** (`src/services/ml/WaitTimeEstimationOrchestrator.ts`)
   - Event-driven service that listens to queue events
   - Only triggers recalculation when disruptions occur
   - Batches multiple disruptions (2-second debounce)
   - Periodic check for appointments running over time (every 5 minutes)

2. **`WaitTimeEstimationService`** (`src/services/ml/WaitTimeEstimationService.ts`)
   - Orchestrates estimation using Strategy pattern
   - Fallback chain: ML → Rule-Based → Historical Average → Default
   - Context building (queue state, staff info, historical data)
   - Caching (30-second TTL) to prevent duplicate calls

3. **`DisruptionDetector`** (`src/services/ml/DisruptionDetector.ts`)
   - Detects disruptions for individual appointments
   - Used by display logic to decide what to show
   - Checks: late arrival, no-show, unusual duration, queue override, etc.

4. **Estimator Strategy Pattern** (`src/services/ml/estimators/`)
   - `MlEstimator` - Calls external ML service (future)
   - `RuleBasedEstimator` - Business rules-based estimation (current MVP)
   - `HistoricalAverageEstimator` - Last-resort fallback
   - Common interface: `IWaitTimeEstimator`

**Disruption Triggers**:
- ✅ Patient called by staff (affects remaining patients)
- ✅ Appointment completed (checks for unusual duration)
- ✅ Patient marked absent/returned
- ✅ Queue position changed (manual override)
- ✅ Patient added to queue
- ✅ Patient checked in late (>5 minutes)
- ✅ Appointment running over time (periodic check)

**Display Logic**:
- No disruption → Show scheduled time
- Disruption detected → Show estimated time (if available)
- Uses `DisruptionDetector` to determine what to display

**Data Collection**:
- ✅ Actual wait time calculation and storage
- ✅ Queue snapshot collection (every 5-15 minutes)
- ✅ Feature collection infrastructure
- ✅ Training data pipeline
- ✅ Historical data batching (to avoid URL length limits)

**ML Features Collected** (50+ features across 9 categories):
1. **Temporal Features**: hour_of_day, day_of_week, is_weekend, is_holiday
2. **Queue State**: queue_position, queue_length, waiting_count, in_progress_count
3. **Staff & Resources**: active_staff_count, staff_utilization, staff_avg_duration
4. **Appointment Characteristics**: appointment_type, complexity_score, estimated_duration
5. **Patient Behavior**: punctuality_score, reliability_score, no_show_rate
6. **Timing & Arrival**: lateness_minutes, checked_in_at, patient_arrival_time
7. **Queue Disruptions**: skip_count, is_absent, queue_overrides_count
8. **Historical Patterns**: historical_avg_wait_time, historical_volatility
9. **Clinic Configuration**: buffer_time, operating_mode, avg_appointment_duration

**Database Tables**:
- `appointment_metrics` - Stores predictions and actuals for model training (uses `recorded_at` column)
- `queue_snapshots` - Historical data for feature engineering
- `wait_time_predictions` - Prediction log (mode enum: 'basic', 'ml', 'hybrid')
- `wait_time_feature_snapshots` - Feature snapshots for training

**Edge Function**: `supabase/functions/predict-wait-time/index.ts`
- Thin proxy that forwards `appointmentId` to external ML service
- NO processing in frontend or Edge Function (MLOps best practice)

**Current Implementation**:
- ✅ Rule-based estimator (reliable fallback, works immediately)
- ✅ Historical average estimator (last resort)
- ✅ Fallback chain with automatic degradation
- ✅ Event-driven recalculation (only when needed)
- ✅ Disruption detection and tracking

**Next Steps**:
- ⏳ Create external ML service (Python/FastAPI)
- ⏳ Deploy ML service
- ⏳ Configure ML_SERVICE_URL environment variable
- ⏳ Test end-to-end prediction flow

---

### **3. Real-Time Notifications** 📱

**Location**: `src/services/notification/`

**Features**:
- ✅ SMS notifications via Twilio
- ✅ Multi-language templates (Arabic, English, French)
- ✅ Notification budget tracking per clinic
- ✅ Delivery status tracking
- ✅ Retry mechanism (max 3 retries)
- ✅ Cost estimation
- ✅ Notification analytics

**Notification Types**:
- Appointment confirmed
- Position update
- Almost your turn (5 minutes before)
- Your turn (ready to be seen)
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
- ✅ SMS (implemented via Twilio)
- ⏳ WhatsApp (placeholder, high demand in Morocco)
- ⏳ Email (placeholder)
- ⏳ Push (placeholder)

---

### **4. Patient Experience** 👤

**Location**: `src/pages/patient/`

**Features**:
- ✅ Patient dashboard with appointment history
- ✅ Real-time queue tracking (`MyQueue.tsx`)
- ✅ Appointment booking flow (`BookingFlow.tsx`)
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

**Service**: `PatientService` handles all patient operations

---

### **5. Clinic Management** 🏥

**Location**: `src/pages/clinic/`

**Features**:
- ✅ Clinic dashboard
- ✅ Queue management interface (`EnhancedQueueManager.tsx`)
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

**Services**:
- `ClinicService` - Clinic operations
- `StaffService` - Staff management
- `QueueService` - Queue operations

---

### **6. Multi-Tenant Architecture** 🏢

**Features**:
- ✅ Row Level Security (RLS) on all tables
- ✅ Clinic isolation by `clinic_id`
- ✅ Role-based access control (RBAC)
- ✅ Staff role management
- ✅ Clinic owner permissions
- ✅ `SECURITY DEFINER` functions for authorized operations

**Roles**:
- `super_admin` - Platform administrator
- `clinic_owner` - Clinic owner
- `staff` - Clinic staff (receptionist, doctor, etc.)
- `patient` - Patient user

**RLS Strategy**:
- All tables have RLS enabled
- Policies filter by `clinic_id` for multi-tenant isolation
- `SECURITY DEFINER` functions bypass RLS for authorized operations
- Functions like `get_clinic_from_staff`, `get_clinic_estimation_config` use `SECURITY DEFINER`

---

### **7. Internationalization** 🌍

**Location**: `src/locales/`

**Languages**:
- ✅ Arabic (`ar/translation.json`) - Primary
- ✅ English (`en/translation.json`)
- ✅ French (`fr/translation.json`)

**Coverage**: UI components, notifications, error messages

**Framework**: i18next

---

## 🤖 ML Implementation Strategy

### **Architecture (MLOps Best Practices)**

**Key Principle**: NO data processing in frontend. All processing happens in backend.

```
Frontend (React)
  ↓ { appointmentId }
Edge Function (Supabase - Deno)
  ↓ { appointmentId } (proxy only)
External ML Service (Python/FastAPI)
  ↓ Fetches ALL data
  ↓ Feature engineering
  ↓ ML model prediction
  ↓ { waitTimeMinutes, confidence, features }
Edge Function
  ↓ { waitTimeMinutes, confidence }
Frontend
  ↓ Displays result
```

### **Data Collection Strategy**

#### **Phase 1: Real-Time Feature Collection** ✅ Complete
- Collects features at prediction time
- Stores in `appointment_metrics.features` (JSONB)
- Stores in `wait_time_predictions.features` (JSONB)

#### **Phase 2: Historical Feature Collection** ✅ Complete
- Calculates actual wait time after appointment completion
- Stores in `appointment_metrics.actual_wait_time`
- Stores in `wait_time_feature_snapshots.label_wait_time`

#### **Phase 3: Periodic Snapshot Collection** ✅ Complete
- Collects queue snapshots every 5-15 minutes
- Stores in `queue_snapshots` table
- Includes: waiting count, in progress count, staff utilization, delays

#### **Phase 4: Patient History Updates** ⏳ Partial
- Updates `patient_clinic_history` after each visit
- Calculates punctuality and reliability scores
- Updates preferred times/days

### **Feature Categories** (50+ Features)

1. **Temporal Features** (9 features)
   - hour_of_day, day_of_week, is_weekend, is_holiday, month, time_slot, etc.

2. **Queue State Features** (11 features)
   - queue_position, queue_length, waiting_count, in_progress_count, average_wait_time_current, etc.

3. **Staff & Resource Features** (7 features)
   - active_staff_count, staff_utilization, staff_avg_consultation_duration, staff_load_ratio, etc.

4. **Appointment Characteristics** (7 features)
   - appointment_type, estimated_duration, complexity_score, is_first_visit, is_walk_in, etc.

5. **Patient Behavior Features** (10 features)
   - patient_total_visits, patient_no_show_rate, patient_punctuality_score, patient_reliability_score, etc.

6. **Timing & Arrival Features** (6 features)
   - checked_in_at, patient_arrival_time, lateness_minutes, is_late, has_checked_in, etc.

7. **Queue Disruption Features** (6 features)
   - skip_count, is_absent, has_returned, queue_overrides_count_today, emergency_cases_ahead, etc.

8. **Historical Patterns** (8 features)
   - historical_avg_wait_time, historical_avg_service_duration, historical_volatility, recent_trend, etc.

9. **Clinic Configuration Features** (6 features)
   - clinic_buffer_time, clinic_avg_appointment_duration, clinic_operating_mode, clinic_allows_walk_ins, etc.

### **Label Definition**

**Primary Label: Wait Time**
- Definition: Time from check-in to actual start
- Calculation: `actual_start_time - checked_in_at` (in minutes)
- Storage: `appointment_metrics.actual_wait_time`

**Secondary Label: Service Duration**
- Definition: How long the consultation took
- Calculation: `actual_end_time - actual_start_time` (in minutes)
- Storage: `appointments.actual_duration`

### **Implementation Roadmap**

1. ✅ **Data Collection Enhancement** - Complete
2. ⏳ **External ML Service** - Create Python/FastAPI service
3. ⏳ **ML API Integration** - Connect Edge Function to ML service
4. ⏳ **Model Training Pipeline** - Automated training from collected data
5. ⏳ **Model Deployment** - Deploy and version models
6. ⏳ **A/B Testing Framework** - Test model performance

---

## 🗄️ Database Schema

### **Core Tables**

#### **`clinics`**
- Clinic information, settings, ML configuration
- Key fields: `id`, `name`, `owner_id`, `settings` (JSONB), `operating_mode`, `ml_enabled`, `ml_endpoint_url`

#### **`profiles`**
- User profiles (patients/staff)
- Key fields: `id`, `phone_number`, `full_name`, `email`, `preferred_language`, `notification_preferences`

#### **`appointments`**
- Main appointment/queue entries
- Key fields: `id`, `clinic_id`, `patient_id`, `staff_id`, `appointment_date`, `start_time` (timestamp), `end_time`, `queue_position`, `status`, `actual_start_time`, `actual_end_time`, `predicted_wait_time`, `predicted_start_time`, `prediction_mode`, `appointment_type`
- **Note**: Uses `start_time` (timestamp) as single source of truth. Time extracted via `start_time::time` or in application layer.

#### **`clinic_staff`**
- Staff members and their roles
- Key fields: `id`, `clinic_id`, `user_id`, `role`, `specialization`, `working_hours` (JSONB), `average_consultation_duration`

#### **`user_roles`**
- Role assignments
- Key fields: `id`, `user_id`, `role`, `clinic_id`

### **Queue Management Tables**

#### **`absent_patients`**
- Absent patient tracking with grace periods
- Key fields: `appointment_id`, `marked_absent_at`, `returned_at`, `grace_period_ends_at`, `auto_cancelled`

#### **`queue_overrides`**
- Audit trail for queue changes
- Key fields: `appointment_id`, `action_type`, `previous_position`, `new_position`, `performed_by`, `reason`

#### **`queue_snapshots`**
- Historical queue states for ML
- Key fields: `clinic_id`, `snapshot_time`, `total_waiting`, `total_in_progress`, `average_wait_time`, `active_staff_count`, `staff_utilization`

### **ML & Analytics Tables**

#### **`appointment_metrics`**
- Prediction records and actuals for ML training
- Key fields: `appointment_id`, `features` (JSONB), `predicted_wait_time`, `actual_wait_time`, `prediction_error`, `average_service_time`, `model_version`, `recorded_at` (timestamp)
- **Note**: Uses `recorded_at` column (not `created_at`) for temporal queries

#### **`wait_time_predictions`**
- All predictions made
- Key fields: `appointment_id`, `prediction_minutes`, `confidence_score`, `mode` (enum: 'basic', 'ml', 'hybrid'), `model_version`, `features` (JSONB)
- **Note**: Application-side mode values ('rule-based', 'historical-average', 'fallback') are mapped to 'basic' in database

#### **`wait_time_feature_snapshots`**
- Feature snapshots for training
- Key fields: `clinic_id`, `features` (JSONB), `label_wait_time`, `label_service_duration`, `feature_schema_version`, `drift_score`

#### **`patient_clinic_history`**
- Patient behavior patterns
- Key fields: `patient_id`, `clinic_id`, `total_visits`, `punctuality_score`, `reliability_score`, `preferred_time_slot`, `preferred_day_of_week`

### **Notification Tables**

#### **`notifications`**
- Notification records
- Key fields: `appointment_id`, `patient_id`, `channel`, `type`, `status`, `message_template`, `sent_at`, `delivered_at`

#### **`notification_templates`**
- Customizable templates
- Key fields: `clinic_id`, `template_key`, `language`, `template_text`, `variables` (JSONB)

#### **`clinic_notification_budgets`**
- Budget management
- Key fields: `clinic_id`, `monthly_sms_limit`, `current_month_sms_count`, `monthly_budget_amount`, `current_month_spend`

### **Database Functions (RPC)**

**Total**: 33 functions (23 RPC + 10 Triggers)

**Key RPC Functions**:
- `create_queue_entry` - Create new appointment
- `get_daily_schedule_for_clinic` - Fetch clinic-wide schedule
- `get_daily_schedule_for_staff` - Fetch staff-specific schedule
- `get_clinic_from_staff` - Get clinic ID from staff ID (bypasses RLS)
- `get_clinic_estimation_config` - Get clinic ML configuration (bypasses RLS)
- `record_actual_wait_time` - Store ML training data (bypasses RLS)
- `record_queue_snapshot` - Store queue snapshot (bypasses RLS)
- `recalculate_queue_positions` - Reorder queue
- `search_clinics` - Clinic search
- `end_day_for_staff` - End-of-day operations
- `batch_mark_no_shows` - Mark multiple no-shows

**Trigger Functions**:
- `assign_queue_position` - Auto-assign queue positions
- `calculate_appointment_features` - Calculate appointment features
- `update_patient_history` - Update patient history after visit
- `refresh_clinic_favorite_stats` - Update favorite counts
- `refresh_clinic_rating_stats` - Update rating averages
- `set_absent_grace_period` - Set grace period for absent patients
- `trigger_recalculate_queue` - Trigger queue recalculation
- `update_updated_at_column` - Auto-update timestamps
- `handle_new_user` - Create profile for new user
- `reset_monthly_notification_budget` - Reset monthly budgets

---

## 🏛️ Service Layer Architecture

### **Service Structure**

```
src/services/
├── queue/                    ✅ Complete
│   ├── QueueService.ts
│   ├── QueueSnapshotService.ts
│   ├── repositories/
│   │   └── QueueRepository.ts
│   ├── models/
│   │   └── QueueModels.ts
│   └── index.ts
├── patient/                 ✅ Complete
│   ├── PatientService.ts
│   ├── repositories/
│   │   └── PatientRepository.ts
│   └── index.ts
├── clinic/                  ✅ Complete
│   ├── ClinicService.ts
│   ├── repositories/
│   │   └── ClinicRepository.ts
│   └── index.ts
├── staff/                   ✅ Complete
│   ├── StaffService.ts
│   ├── repositories/
│   │   └── StaffRepository.ts
│   └── index.ts
├── notification/            ✅ Complete
│   ├── NotificationService.ts
│   └── models/
├── ml/                      ✅ Complete
│   ├── WaitTimeEstimationService.ts
│   ├── WaitTimeEstimationOrchestrator.ts
│   ├── DisruptionDetector.ts
│   ├── MlApiClient.ts
│   ├── estimators/
│   │   ├── IWaitTimeEstimator.ts
│   │   ├── MlEstimator.ts
│   │   ├── RuleBasedEstimator.ts
│   │   └── HistoricalAverageEstimator.ts
│   └── index.ts
└── shared/                  ✅ Complete
    ├── errors/
    ├── events/
    └── logging/
```

### **Service Responsibilities**

#### **QueueService**
- Appointment creation and management
- Queue position management
- Check-in/check-out operations
- Appointment cancellation (via RPC)
- Queue override operations (skip, absent, late arrival)
- Daily schedule retrieval (no estimation during load - only displays existing predictions)

#### **WaitTimeEstimationService**
- Orchestrates wait time estimation using Strategy pattern
- Context building (queue state, staff info, historical data)
- Fallback chain management (ML → Rule-Based → Historical Average)
- Result caching (30-second TTL)
- Mode mapping (application enums to database enums)

#### **WaitTimeEstimationOrchestrator**
- Event-driven estimation trigger
- Disruption detection and tracking
- Debounced recalculation (2-second batch window)
- Periodic checks for overdue appointments
- Initialization guard (prevents duplicate subscriptions)

#### **DisruptionDetector**
- Individual appointment disruption detection
- Used by UI to decide what to display
- Privacy-conscious (no cross-patient data access)

#### **PatientService**
- Patient profile management
- Find or create patient (registered or guest)
- Patient history retrieval
- Guest patient management

#### **ClinicService**
- Clinic information retrieval
- Clinic settings management
- Clinic search
- Clinic configuration

#### **StaffService**
- Staff management (add, remove, update)
- Staff retrieval by clinic/user
- Staff role management

#### **NotificationService**
- SMS notification sending
- Notification template management
- Budget tracking
- Delivery status tracking

### **Repository Pattern**

All services use dedicated repository classes:
- **QueueRepository**: Queue data access, RPC calls
- **PatientRepository**: Patient data access
- **ClinicRepository**: Clinic data access
- **StaffRepository**: Staff data access

**Benefits**:
- Separation of concerns
- Easy to test (mock repositories)
- Easy to swap data sources
- Consistent error handling

---

## 🎯 Key Architectural Decisions

### **1. MLOps Best Practices**
**Decision**: All ML processing happens in backend, not frontend.

**Rationale**:
- Frontend is for UI/UX only
- Feature engineering requires database access
- Model inference should be centralized
- Easier to version and update models

**Implementation**:
- Frontend sends only `appointmentId` to Edge Function
- Edge Function is a thin proxy to external ML service
- External ML service does ALL processing (data fetching, feature engineering, prediction)

### **2. Repository Pattern**
**Decision**: All services use repositories, not direct Supabase calls.

**Rationale**:
- Separation of concerns
- Easy to test (mock repositories)
- Easy to swap data sources
- Consistent error handling

**Implementation**:
- Each service has a corresponding repository
- Repositories handle all database operations
- Services contain business logic only

### **3. RLS Bypass Strategy**
**Decision**: Use `SECURITY DEFINER` functions for authorized operations.

**Rationale**:
- Some operations need to bypass RLS (e.g., getting clinic from staff)
- Functions run with creator's privileges
- More secure than disabling RLS
- Audit trail through function calls

**Implementation**:
- Functions like `get_clinic_from_staff`, `get_clinic_estimation_config` use `SECURITY DEFINER`
- All RPC functions that need to bypass RLS use this pattern

### **4. Event-Driven Communication**
**Decision**: Use EventBus for decoupled component communication.

**Rationale**:
- Components don't need to know about each other
- Easy to add new event listeners
- Better separation of concerns
- Easier to test

**Implementation**:
- `EventBus` singleton for event publishing/subscribing
- Queue events: `queue.patient.added`, `queue.appointment.status_changed`, etc.
- Notification events trigger on queue changes

### **5. Multi-Tenant Architecture**
**Decision**: Use Row Level Security (RLS) for data isolation.

**Rationale**:
- Secure by default
- Clinic data isolation
- Role-based access control
- Scalable

**Implementation**:
- All tables have RLS enabled
- Policies filter by `clinic_id`
- `SECURITY DEFINER` functions for authorized operations

---

## 🇲🇦 Moroccan Context Adaptations

### **Already Implemented** ✅
- **Arabic Language Support**: Primary language, full UI translation
- **SMS Notifications**: Primary communication channel (via Twilio)
- **Phone Number Authentication**: Phone-based auth (common in Morocco)
- **Grace Period for Late Arrivals**: 15-minute grace period (cultural consideration)
- **French Language**: Widely used in healthcare, full UI translation

### **Recommended Additions** ⏳
- **WhatsApp Notifications**: Very popular in Morocco, high demand
- **Moroccan Phone Number Validation**: Country-specific validation
- **Local Payment Methods**: If monetizing (Carte Bancaire, etc.)
- **Integration with Moroccan Health Insurance**: CNSS, RAMED, etc.
- **Ramadan Awareness**: Special handling during Ramadan period
- **Moroccan Holidays**: Holiday calendar integration

---

## 🚀 Roadmap & Future Features

### **Priority 1: Complete Core Features**

#### **1. Digital Prescriptions** 📋
**Status**: ❌ Not Implemented

**What's Needed**:
- Prescription creation by doctors
- Digital signature support
- Prescription history for patients
- PDF generation
- Pharmacy integration (optional)
- Medication tracking

**Implementation**:
- New service: `src/services/prescription/PrescriptionService.ts`
- New tables: `prescriptions`, `prescription_items`
- New page: `src/pages/patient/Prescriptions.tsx`

#### **2. Comprehensive Patient History** 📚
**Status**: ⚠️ Partially Implemented

**Current State**:
- ✅ Appointment history exists
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

#### **3. GDPR Compliance** 🔒
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
- New service: `src/services/gdpr/GdprService.ts`
- Features: Export patient data (JSON/PDF), Delete patient data (with cascade), Consent tracking, Privacy policy versioning, Data access audit logs

### **Priority 2: ML Enhancement**

#### **1. Real ML Model Integration** 🤖
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

#### **2. Model Training Pipeline**
**Status**: ⏳ Planned

**What's Needed**:
- Automated training from `appointment_metrics`
- Model versioning
- Performance monitoring
- Model evaluation dashboard

### **Priority 3: Polish & Scale**

#### **1. WhatsApp Notifications** 📱
**Status**: ⏳ High demand in Morocco

**What's Needed**:
- WhatsApp Business API integration
- Template message support
- Delivery status tracking

#### **2. Mobile App** 📱
**Status**: ⏳ Planned

**What's Needed**:
- React Native app
- Push notifications
- Offline support

#### **3. Pharmacy Integration** 💊
**Status**: ⏳ Planned (for prescriptions)

**What's Needed**:
- Pharmacy API integration
- Prescription fulfillment tracking

#### **4. Payment Integration** 💳
**Status**: ⏳ Planned (if needed)

**What's Needed**:
- Payment gateway integration
- Moroccan payment methods

#### **5. Analytics Dashboard** 📊
**Status**: ⏳ Planned (for clinics)

**What's Needed**:
- Clinic performance metrics
- Patient flow analytics
- Revenue analytics

---

## 📋 Best Practices & Standards

### **Code Organization**
- **Service Layer**: All business logic in services
- **Repository Pattern**: All data access in repositories
- **Component Separation**: UI logic only in components
- **Type Safety**: Full TypeScript coverage

### **Error Handling**
- Custom error classes: `DatabaseError`, `NotFoundError`, `ValidationError`
- Comprehensive logging with `Logger` service
- User-friendly error messages
- Error boundaries in React components

### **Logging**
- Structured logging with `Logger` service
- Log levels: `debug`, `info`, `warn`, `error`
- Metadata for context
- Console and remote logging support

### **Security**
- Row Level Security (RLS) on all tables
- `SECURITY DEFINER` functions for authorized operations
- Input validation with Zod
- SQL injection prevention (parameterized queries)

### **Performance**
- React Query for caching
- Lazy loading for routes
- Optimistic updates
- Database indexes on foreign keys
- Service instance reuse (useMemo for singleton patterns)
- Estimation result caching (30-second TTL)
- Debounced recalculations (2-second batch window)
- Batched queries (to avoid URL length limits)
- Reduced log verbosity (DEBUG level for frequent operations)
- Eliminated duplicate `useQueueService` calls
- Event subscription cleanup on unmount

### **Testing** (Planned)
- Unit tests for services
- Integration tests for repositories
- Component tests with React Testing Library
- E2E tests with Playwright (planned)

---

## 🧪 Testing Strategy

### **Testing Philosophy**
- **Test-Driven Development**: Write tests before implementation (planned)
- **80%+ Coverage Goal**: Comprehensive test coverage
- **Test Types**: Unit, Integration, E2E

### **Test Framework**
- **Vitest**: Unit and integration tests
- **React Testing Library**: Component tests
- **Playwright**: E2E tests (planned)

### **Test Structure**
```
src/
├── services/
│   └── queue/
│       ├── QueueService.ts
│       └── QueueService.test.ts
├── components/
│   └── clinic/
│       ├── EnhancedQueueManager.tsx
│       └── EnhancedQueueManager.test.tsx
```

### **Testing Phases**
1. **Phase 1**: Service layer tests (QueueService, PatientService, etc.)
2. **Phase 2**: Repository tests (QueueRepository, PatientRepository, etc.)
3. **Phase 3**: Component tests (UI components)
4. **Phase 4**: E2E tests (user flows)

---

## 🚀 Deployment & Infrastructure

### **Current Setup**
- **Frontend**: Vite dev server (local development)
- **Backend**: Supabase (hosted)
- **Database**: Supabase PostgreSQL (hosted)
- **Edge Functions**: Supabase Edge Functions (hosted)

### **Deployment Strategy** (Planned)
- **Frontend**: Vercel/Netlify
- **Backend**: Supabase (already hosted)
- **ML Service**: Separate deployment (Python/FastAPI on AWS/GCP)
- **Database**: Supabase (already hosted)

### **Environment Variables**
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase anonymous key
- `ML_SERVICE_URL`: External ML service URL (to be configured)

### **Monitoring** (Planned)
- Application performance monitoring
- Error tracking (Sentry)
- Database performance monitoring
- ML model performance monitoring

---

## 📝 Key Files & Locations

### **Services**
- Queue: `src/services/queue/QueueService.ts`
- Patient: `src/services/patient/PatientService.ts`
- Clinic: `src/services/clinic/ClinicService.ts`
- Staff: `src/services/staff/StaffService.ts`
- Notifications: `src/services/notification/NotificationService.ts`
- ML Estimation: `src/services/ml/WaitTimeEstimationService.ts`
- ML Orchestration: `src/services/ml/WaitTimeEstimationOrchestrator.ts`
- ML Disruption Detection: `src/services/ml/DisruptionDetector.ts`
- ML API Client: `src/services/ml/MlApiClient.ts`

### **Pages**
- Patient Dashboard: `src/pages/patient/PatientDashboard.tsx`
- Patient Queue: `src/pages/patient/MyQueue.tsx`
- Clinic Queue: `src/pages/clinic/ClinicQueue.tsx`
- Clinic Dashboard: `src/pages/clinic/ClinicDashboard.tsx`

### **Components**
- Queue Manager: `src/components/clinic/EnhancedQueueManager.tsx`
- Booking Flow: `src/components/booking/BookingFlow.tsx`

### **Database**
- Migrations: `supabase/migrations/`
- Edge Functions: `supabase/functions/`
- Types: `src/integrations/supabase/types.ts`

---

## 🎓 Learning Resources

### **Architecture Documents**
- `CODEBASE_EXPLORATION_SUMMARY.md` - Overview of codebase
- `ML_DATA_STRATEGY.md` - ML feature engineering strategy
- `ML_SERVICE_ARCHITECTURE.md` - ML architecture (MLOps best practices)
- `SERVICES_CREATED_SUMMARY.md` - Service layer documentation
- `CODEBASE_CLEANUP_SUMMARY.md` - Performance optimization and code cleanup summary

### **Testing Guides**
- `TESTING_STRATEGY.md` - Testing philosophy and approach
- `TESTING_IMPLEMENTATION_GUIDE.md` - Quick start guide
- `SERVICE_TESTING_SETUP.md` - Service testing details

### **Cleanup Documentation**
- `CLEANUP_SUCCESS_SUMMARY.md` - Database function cleanup summary
- `FUNCTION_CLEANUP_PLAN.md` - Function cleanup plan
- `CODEBASE_CLEANUP_SUMMARY.md` - Recent code cleanup and optimization summary

### **ML Implementation Documents**
- `ML_INTEGRATION_EXPERT_ANALYSIS.md` - Expert analysis of ML integration approach
- `WAIT_TIME_ESTIMATION_STRATEGY.md` - Event-driven estimation strategy
- `SMART_ESTIMATION_IMPLEMENTATION.md` - Implementation details of smart estimation system

---

## 🔄 Recent Changes & Updates

### **January 2025**

#### **Week 2-3: Wait Time Estimation System Implementation**
1. ✅ **Event-Driven Estimation**: Implemented `WaitTimeEstimationOrchestrator` that only calculates when disruptions occur
2. ✅ **Strategy Pattern**: Implemented estimator strategy pattern (ML, Rule-Based, Historical Average) with fallback chain
3. ✅ **Disruption Detection**: Created `DisruptionDetector` for smart display logic
4. ✅ **Rule-Based Estimator**: Implemented reliable MVP estimator using business rules
5. ✅ **Context Building**: Enhanced `WaitTimeEstimationService` to fetch real queue state, staff info, and historical data
6. ✅ **Database Schema Cleanup**: Removed redundant `scheduled_time` column, using `start_time` as single source of truth
7. ✅ **Enum Type Fix**: Fixed `estimation_mode` enum mismatch between application and database
8. ✅ **Query Optimization**: Fixed URL length limit issues by batching historical data queries
9. ✅ **Column Name Fix**: Fixed `created_at` vs `recorded_at` mismatch in `appointment_metrics` queries

#### **Week 2: Performance & Code Quality Optimization**
1. ✅ **Duplicate Hook Elimination**: Removed duplicate `useQueueService` calls (ClinicQueue + EnhancedQueueManager)
2. ✅ **Service Instance Optimization**: Reused QueueService instances via useMemo (PatientDashboard, MyQueue)
3. ✅ **Direct Repository Usage Fix**: ClinicCalendar now uses QueueService instead of direct repository
4. ✅ **Service Layer Consistency**: All components now use services (staffService, clinicService) instead of direct Supabase queries
5. ✅ **Logging Cleanup**: Replaced console.log with structured logger calls
6. ✅ **Log Verbosity Reduction**: Reduced subscription and schedule fetch log verbosity
7. ✅ **Event Subscription Management**: Fixed duplicate subscriptions with proper cleanup and initialization guards

#### **Week 1: Service Layer Foundation**
1. ✅ **Service Layer Refactoring**: Created PatientService, ClinicService, StaffService with Repository Pattern
2. ✅ **Component Refactoring**: All components now use services instead of direct database calls
3. ✅ **Database Cleanup**: Removed 6 redundant functions, updated RLS policies
4. ✅ **RLS Policy Updates**: Updated to use `can_user_accept_invitation`
5. ✅ **ML Data Collection**: Actual wait time and queue snapshot collection implemented

### **December 2024**
1. ✅ **ML Architecture Correction**: Moved all processing to backend (MLOps best practices)
2. ✅ **Edge Function Refactoring**: Made Edge Function a thin proxy
3. ✅ **Feature Engineering Removal**: Removed frontend feature engineering

---

## 📞 Support & Contact

### **Documentation**
- Architecture: `ARCHITECTURE_README.md`
- API Docs: Coming in Week 7-10 (per README)
- Testing: Vitest setup planned

### **Key Decisions Log**
- All architectural decisions documented in this file
- Code comments explain complex logic
- Git commit messages follow conventional commits

---

## 🎯 Success Criteria

### **Technical**
- ✅ Service layer architecture implemented
- ✅ Repository pattern in place
- ✅ RLS policies functional
- ⏳ 80%+ test coverage (planned)
- ⏳ ML model integrated (in progress)

### **Business**
- ⏳ Reduced average wait times
- ⏳ Improved patient satisfaction
- ⏳ Increased clinic efficiency
- ⏳ Higher appointment completion rates
- ⏳ Lower no-show rates

---

**This knowledge base is a living document. Update it as the project evolves!** 🚀

