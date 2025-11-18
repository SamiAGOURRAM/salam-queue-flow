# Codebase & Architecture Analysis Report

**Date**: 2025-01-22
**Status**: Analysis Complete
**Scope**: Database Schema, Service Layer (Queue & ML), Architecture Patterns

---

## 1. Executive Summary

The codebase generally follows a clean **Service-Repository pattern**, but there are significant **architectural violations** in the newer ML/Estimation services where the pattern breaks down.

*   **Strengths**: Strong domain modeling (`QueueModels.ts`), event-driven architecture (`EventBus`, `Orchestrator`), and comprehensive audit logging (`queue_overrides`, `audit_logs`).
*   **Critical Issues**: Direct database access in Services (bypassing Repositories), hardcoded "magic numbers" for thresholds, and schema redundancy.
*   **Risk**: High technical debt if ML services are expanded without refactoring first.

---

## 2. Architectural Analysis

### **A. Separation of Concerns (The "Repository Pattern" Violation)**

**The Rule**: Services should contain *business logic*. Repositories should contain *data access logic*. Services should NEVER call the DB client (`supabase`) directly.

**The Violation**:
*   **`WaitTimeEstimationService.ts`**:
    *   Methods `getQueueState` and `getHistoricalData` import and use `supabase` client directly.
    *   *Impact*: Hard to test (cannot mock DB), tight coupling to Supabase, inconsistent error handling.
*   **`WaitTimeEstimationOrchestrator.ts`**:
    *   Methods `checkRunningOverAppointments` and `recalculateForClinic` use `supabase` client directly.
    *   *Impact*: Same as above. Logic for "finding running over appointments" belongs in a Repository.

**Recommendation**:
1.  Create `AnalyticsRepository` for historical data fetching.
2.  Extend `QueueRepository` to handle `getQueueState`, `getInProgressAppointments`, and batch updates.

### **B. Hardcoded Values ("Magic Numbers")**

The code contains numerous hardcoded values that should be in a `Config` object or Database Settings.

**Found in `WaitTimeEstimationService.ts`**:
*   `CACHE_TTL_MS = 30000` (30 seconds)
*   `15` (Default wait time minutes in fallback)
*   `0.3` (Default confidence score)
*   `30` (Days for historical lookback)
*   `50` (Batch size for queries)

**Found in `WaitTimeEstimationOrchestrator.ts`**:
*   `DEBOUNCE_MS = 2000` (2 seconds)
*   `LATE_ARRIVAL_THRESHOLD_MINUTES = 5`
*   `DURATION_THRESHOLD_MINUTES = 10`
*   `5 * 60 * 1000` (5 minute interval)
*   `30` (Default estimated duration if missing)

**Recommendation**:
*   Move these to a `SystemConfig` constant file or, better yet, `clinics.settings` JSONB column so they can be tuned per clinic (e.g., a busy public clinic might need a 2-minute late threshold, while a private one allows 15).

---

## 3. Database Schema Analysis

### **A. Redundancy & Cleanup**
1.  **`appointments_backup_before_dedup`**:
    *   *Status*: **DELETE**. Clearly a temporary table.
2.  **`resource_availabilities` vs `clinic_staff.working_hours`**:
    *   *Issue*: Data duplication. `working_hours` is JSONB (good for UI), `resource_availabilities` is relational (good for SQL queries).
    *   *Risk*: They can get out of sync.
    *   *Recommendation*: Pick ONE as the source of truth. For a "Unicorn" scale app, **Relational (`resource_availabilities`)** is superior for complex queries (e.g., "Find all doctors free at 10:00 AM"). Use a DB Trigger to update the JSONB cache for the UI.
3.  **`wait_time_predictions` vs `appointments` columns**:
    *   `appointments` table has `predicted_wait_time`, `predicted_start_time`.
    *   `wait_time_predictions` table stores a log of predictions.
    *   *Verdict*: **Keep both**. The table is a history/audit log (crucial for ML training), the column is the "current state".

### **B. Missing Indexes (Inferred)**
*   `appointment_metrics` queries by `appointment_id` and `recorded_at`. Needs composite index.
*   `appointments` queries by `clinic_id` + `appointment_date` + `status`. Needs composite index for the Queue Manager to be fast.

---

## 4. Quality & Code Style

*   **Type Safety**: Good usage of Enums (`AppointmentStatus`, `DisruptionType`).
*   **Error Handling**: `WaitTimeEstimationService` swallows some errors with `catch(() => null)`. This is dangerous; it should log the error before returning null.
*   **Logging**: Good usage of structured logger.

---

## 5. Action Plan (Pre-Implementation)

Before building the "Smart Queue" features, we must stabilize the foundation:

1.  **Refactor**: Move all `supabase.*` calls from Services to Repositories.
2.  **Config**: Extract magic numbers to a `QueueConfig` object.
3.  **Cleanup**: Drop `appointments_backup_before_dedup`.
4.  **Schema**: Add the new tables defined in the RFC (`waitlist`, `manual_overrides`).

Ready to proceed with this cleanup?
