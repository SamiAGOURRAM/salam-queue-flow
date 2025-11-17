# 📊 ML Data Inventory: Realistic Feature Mapping

**Date**: January 2025  
**Status**: Data Inventory Phase  
**Purpose**: Map actual database schema to ML features - distinguish between available, computable, and missing data

---

## 🎯 Goal

**Create a realistic feature set** based on what data we can actually ingest from the platform, not aspirational features.

---

## 📋 Data Source Inventory

### **1. `appointments` Table** (Main Data Source)

**Available Fields** (Directly Stored):
```sql
✅ id                              -- UUID
✅ clinic_id                       -- UUID
✅ patient_id                      -- UUID (nullable)
✅ staff_id                        -- UUID (nullable)
✅ appointment_date                -- DATE
✅ scheduled_time                  -- TIME (nullable)
✅ start_time                      -- TIMESTAMP (nullable)
✅ end_time                        -- TIMESTAMP (nullable)
✅ queue_position                  -- INTEGER (nullable)
✅ status                          -- ENUM (scheduled, waiting, in_progress, completed, cancelled, no_show)
✅ appointment_type                -- ENUM (consultation, follow_up, emergency, procedure, vaccination, screening)
✅ estimated_duration              -- INTEGER (minutes, nullable)
✅ actual_start_time               -- TIMESTAMP (nullable)
✅ actual_end_time                 -- TIMESTAMP (nullable)
✅ actual_duration                 -- INTEGER (minutes, nullable)
✅ checked_in_at                   -- TIMESTAMP (nullable)
✅ patient_arrival_time            -- TIMESTAMP (nullable)
✅ late_by_minutes                 -- INTEGER (nullable)
✅ marked_absent_at                -- TIMESTAMP (nullable)
✅ returned_at                     -- TIMESTAMP (nullable)
✅ is_first_visit                  -- BOOLEAN (nullable)
✅ is_walk_in                      -- BOOLEAN (nullable)
✅ is_present                      -- BOOLEAN (nullable)
✅ is_holiday                      -- BOOLEAN (nullable)
✅ day_of_week                     -- INTEGER (0-6, nullable)
✅ time_slot                       -- STRING (nullable) - "morning", "afternoon", "evening"
✅ skip_count                      -- INTEGER (nullable)
✅ skip_reason                     -- ENUM (nullable)
✅ original_queue_position         -- INTEGER (nullable)
✅ override_by                     -- UUID (nullable)
✅ complexity_score                -- INTEGER (nullable)
✅ booking_method                  -- STRING (nullable)
✅ booked_by                       -- UUID (nullable)
✅ cancellation_reason             -- STRING (nullable)
✅ created_at                      -- TIMESTAMP
✅ updated_at                      -- TIMESTAMP
```

**Computed from `appointments`** (Can Calculate):
```sql
-- From scheduled_time or start_time
✅ hour_of_day                     -- Extract hour (0-23)
✅ is_morning                      -- hour < 12
✅ is_afternoon                    -- 12 <= hour < 17
✅ is_evening                      -- hour >= 17
✅ is_weekday                      -- day_of_week < 5
✅ is_weekend                      -- day_of_week >= 5
✅ minutes_until_appointment       -- (scheduled_time - NOW())
✅ has_checked_in                  -- checked_in_at IS NOT NULL
✅ is_late                         -- late_by_minutes > 0
✅ lateness_minutes                -- late_by_minutes (direct)
✅ wait_time_minutes               -- (actual_start_time - checked_in_at) IF both exist
✅ service_duration_minutes        -- (actual_end_time - actual_start_time) IF both exist

-- From queue_position
✅ people_ahead_count              -- queue_position - 1 (if queue_position > 0)

-- From status
✅ is_scheduled                    -- status = 'scheduled'
✅ is_waiting                      -- status = 'waiting'
✅ is_in_progress                  -- status = 'in_progress'
✅ is_completed                    -- status = 'completed'
✅ is_cancelled                    -- status = 'cancelled'
✅ is_no_show                      -- status = 'no_show'

-- From appointments table (aggregate queries for same clinic/date)
✅ waiting_count                   -- COUNT(*) WHERE status IN ('scheduled', 'waiting') AND clinic_id = X AND appointment_date = Y
✅ in_progress_count               -- COUNT(*) WHERE status = 'in_progress' AND clinic_id = X AND appointment_date = Y
✅ completed_today_count           -- COUNT(*) WHERE status = 'completed' AND clinic_id = X AND appointment_date = Y
✅ queue_length                    -- COUNT(*) WHERE status IN ('scheduled', 'waiting', 'in_progress') AND clinic_id = X AND appointment_date = Y
```

---

### **2. `appointment_metrics` Table** (ML Training Data)

**Available Fields** (Directly Stored):
```sql
✅ id                              -- UUID
✅ appointment_id                  -- UUID (FK -> appointments)
✅ clinic_id                       -- UUID (FK -> clinics)
✅ features                        -- JSONB (nullable) - Stores feature snapshot at prediction time
✅ predicted_wait_time             -- INTEGER (minutes, nullable)
✅ actual_wait_time                -- INTEGER (minutes, nullable) - LABEL
✅ prediction_error                -- INTEGER (nullable)
✅ absolute_error                  -- INTEGER (nullable)
✅ queue_position                  -- INTEGER (nullable)
✅ queue_length                    -- INTEGER (nullable)
✅ staff_count                     -- INTEGER (nullable)
✅ average_service_time            -- INTEGER (minutes, nullable)
✅ current_delay_minutes           -- INTEGER (nullable)
✅ confidence_score                -- DECIMAL (nullable)
✅ model_version                   -- STRING (nullable)
✅ recorded_at                     -- TIMESTAMP (nullable)
```

**Computed from `appointment_metrics`** (Can Calculate):
```sql
-- Historical averages (aggregate queries)
✅ historical_avg_wait_time        -- AVG(actual_wait_time) WHERE clinic_id = X AND recorded_at > Y
✅ historical_avg_service_duration -- AVG(average_service_time) WHERE clinic_id = X
✅ historical_wait_time_std        -- STDDEV(actual_wait_time) WHERE clinic_id = X
✅ historical_wait_time_p90        -- PERCENTILE_CONT(0.9) WHERE clinic_id = X
✅ historical_wait_time_p10        -- PERCENTILE_CONT(0.1) WHERE clinic_id = X
```

---

### **3. `queue_snapshots` Table** (Historical Queue State)

**Available Fields** (Directly Stored):
```sql
✅ id                              -- UUID
✅ clinic_id                       -- UUID (FK -> clinics)
✅ snapshot_date                   -- DATE
✅ snapshot_time                   -- TIMESTAMP
✅ total_waiting                   -- INTEGER (nullable)
✅ total_in_progress               -- INTEGER (nullable)
✅ total_completed_today           -- INTEGER (nullable)
✅ average_wait_time               -- INTEGER (minutes, nullable)
✅ longest_wait_time               -- INTEGER (minutes, nullable)
✅ current_delay_minutes           -- INTEGER (nullable)
✅ active_staff_count              -- INTEGER (nullable)
✅ staff_utilization               -- DECIMAL (0-1, nullable)
✅ created_at                      -- TIMESTAMP
```

**Computed from `queue_snapshots`** (Can Calculate):
```sql
-- Recent queue state (latest snapshot for clinic/date)
✅ recent_total_waiting            -- SELECT total_waiting WHERE clinic_id = X AND snapshot_date = Y ORDER BY snapshot_time DESC LIMIT 1
✅ recent_total_in_progress        -- SELECT total_in_progress WHERE clinic_id = X AND snapshot_date = Y ORDER BY snapshot_time DESC LIMIT 1
✅ recent_average_wait_time        -- SELECT average_wait_time WHERE clinic_id = X AND snapshot_date = Y ORDER BY snapshot_time DESC LIMIT 1
✅ recent_active_staff_count       -- SELECT active_staff_count WHERE clinic_id = X AND snapshot_date = Y ORDER BY snapshot_time DESC LIMIT 1
✅ recent_staff_utilization        -- SELECT staff_utilization WHERE clinic_id = X AND snapshot_date = Y ORDER BY snapshot_time DESC LIMIT 1

-- Trends (compare latest vs previous snapshots)
✅ queue_growth_rate               -- (current_waiting - previous_waiting) / time_diff
✅ wait_time_trend                 -- (current_avg - previous_avg) / previous_avg
```

---

### **4. `clinic_staff` Table** (Staff Information)

**Available Fields** (Directly Stored):
```sql
✅ id                              -- UUID
✅ clinic_id                       -- UUID (FK -> clinics)
✅ user_id                         -- UUID (FK -> profiles)
✅ role                            -- STRING
✅ specialization                  -- STRING (nullable)
✅ is_active                       -- BOOLEAN (nullable)
✅ average_consultation_duration   -- INTEGER (minutes, nullable)
✅ patients_per_day_avg            -- INTEGER (nullable)
✅ working_hours                   -- JSONB (nullable)
✅ created_at                      -- TIMESTAMP
✅ updated_at                      -- TIMESTAMP
```

**Computed from `clinic_staff`** (Can Calculate):
```sql
-- Aggregate queries for clinic
✅ active_staff_count              -- COUNT(*) WHERE clinic_id = X AND is_active = true
✅ total_staff_count               -- COUNT(*) WHERE clinic_id = X
✅ clinic_avg_consultation_duration -- AVG(average_consultation_duration) WHERE clinic_id = X AND is_active = true
✅ assigned_staff_avg_duration     -- SELECT average_consultation_duration WHERE id = staff_id (if assigned)

-- Staff utilization (needs real-time calculation)
⚠️ staff_utilization               -- Requires counting active appointments per staff (NOT directly available)
```

---

### **5. `clinics` Table** (Clinic Information)

**Available Fields** (Directly Stored):
```sql
✅ id                              -- UUID
✅ name                            -- STRING
✅ name_ar                         -- STRING (nullable)
✅ specialty                       -- STRING
✅ practice_type                   -- ENUM (private, public, hospital)
✅ city                            -- STRING
✅ address                         -- STRING
✅ phone                           -- STRING
✅ email                           -- STRING (nullable)
✅ owner_id                        -- UUID
✅ settings                        -- JSONB (nullable) - Can contain: operating_mode, buffer_time, etc.
✅ is_active                       -- BOOLEAN (nullable)
✅ subscription_tier               -- STRING (nullable)
✅ created_at                      -- TIMESTAMP
✅ updated_at                      -- TIMESTAMP
```

**Computed from `clinics`** (Can Calculate):
```sql
-- From settings JSONB (if exists)
⚠️ clinic_operating_mode          -- settings->>'operating_mode' (clinic_wide, staff_specific)
⚠️ clinic_buffer_time              -- settings->>'buffer_time' (INTEGER, minutes)
⚠️ clinic_allows_walk_ins          -- settings->>'allows_walk_ins' (BOOLEAN)
⚠️ clinic_avg_appointment_duration -- settings->>'avg_appointment_duration' (INTEGER)

-- Direct fields
✅ clinic_specialty                -- specialty (direct)
✅ clinic_city                     -- city (direct)
✅ clinic_practice_type            -- practice_type (direct)
```

---

### **6. `patient_clinic_history` Table** (Patient Behavior)

**Available Fields** (Directly Stored):
```sql
✅ id                              -- UUID
✅ patient_id                      -- UUID (FK -> profiles)
✅ clinic_id                       -- UUID (FK -> clinics)
✅ completed_visits                -- INTEGER (nullable)
✅ no_show_count                   -- INTEGER (nullable)
✅ cancellation_count              -- INTEGER (nullable)
✅ punctuality_score               -- DECIMAL (0-1, nullable)
✅ reliability_score               -- DECIMAL (0-1, nullable)
✅ average_actual_duration         -- INTEGER (minutes, nullable)
✅ preferred_time_slot             -- STRING (nullable)
✅ preferred_day_of_week           -- INTEGER (nullable)
✅ preferred_staff_id              -- UUID (nullable)
✅ last_visit_date                 -- DATE (nullable)
✅ last_appointment_id             -- UUID (nullable)
✅ created_at                      -- TIMESTAMP
✅ updated_at                      -- TIMESTAMP
```

**Computed from `patient_clinic_history`** (Can Calculate):
```sql
-- Direct fields (already computed/stored)
✅ patient_total_visits            -- completed_visits (direct)
✅ patient_no_show_rate            -- no_show_count / (completed_visits + no_show_count) IF both exist
✅ patient_cancellation_rate       -- cancellation_count / (completed_visits + cancellation_count + no_show_count) IF all exist
✅ patient_punctuality_score       -- punctuality_score (direct, 0-1)
✅ patient_reliability_score       -- reliability_score (direct, 0-1)
✅ patient_avg_appointment_duration -- average_actual_duration (direct)
✅ patient_preferred_time_slot     -- preferred_time_slot (direct)
✅ patient_preferred_day           -- preferred_day_of_week (direct)

-- If patient_clinic_history doesn't exist (new patient)
⚠️ patient_total_visits            -- COUNT(*) WHERE patient_id = X AND clinic_id = Y AND status = 'completed'
⚠️ patient_no_show_rate            -- COUNT(*) WHERE status = 'no_show' / COUNT(*) WHERE status IN ('completed', 'no_show')
```

---

### **7. `profiles` Table** (Patient Basic Info)

**Available Fields** (Directly Stored):
```sql
✅ id                              -- UUID
✅ full_name                       -- STRING
✅ phone_number                    -- STRING
✅ email                           -- STRING (nullable)
✅ preferred_language              -- STRING (nullable)
✅ notification_preferences        -- JSONB (nullable)
✅ created_at                      -- TIMESTAMP
✅ updated_at                      -- TIMESTAMP
```

**NOT USEFUL FOR ML**: This table only has basic profile info, not behavior metrics.

---

### **8. `absent_patients` Table** (Absent Tracking)

**Available Fields** (Directly Stored):
```sql
✅ id                              -- UUID
✅ appointment_id                  -- UUID (FK -> appointments)
✅ clinic_id                       -- UUID (FK -> clinics)
✅ patient_id                      -- UUID (FK -> profiles)
✅ marked_absent_at                -- TIMESTAMP (nullable)
✅ returned_at                     -- TIMESTAMP (nullable)
✅ grace_period_ends_at            -- TIMESTAMP (nullable)
✅ auto_cancelled                  -- BOOLEAN (nullable)
✅ new_position                    -- INTEGER (nullable)
✅ notification_sent               -- BOOLEAN (nullable)
✅ created_at                      -- TIMESTAMP
✅ updated_at                      -- TIMESTAMP
```

**Computed from `absent_patients`** (Can Calculate):
```sql
-- Aggregate queries for clinic/date
✅ no_shows_today                  -- COUNT(*) WHERE clinic_id = X AND appointment_date = Y AND auto_cancelled = true
✅ returned_patients_today         -- COUNT(*) WHERE clinic_id = X AND appointment_date = Y AND returned_at IS NOT NULL
✅ disruptions_from_absence        -- COUNT(*) WHERE clinic_id = X AND appointment_date = Y AND marked_absent_at IS NOT NULL
```

---

### **9. `queue_overrides` Table** (Queue Manipulations)

**Available Fields** (Directly Stored):
```sql
✅ id                              -- UUID
✅ clinic_id                       -- UUID (FK -> clinics)
✅ appointment_id                  -- UUID (FK -> appointments)
✅ skipped_patient_ids             -- UUID[] (nullable)
✅ action_type                     -- ENUM (call_present, mark_absent, late_arrival, emergency, skip, etc.)
✅ performed_by                    -- UUID
✅ reason                          -- STRING (nullable)
✅ previous_position               -- INTEGER (nullable)
✅ new_position                    -- INTEGER (nullable)
✅ created_at                      -- TIMESTAMP
```

**Computed from `queue_overrides`** (Can Calculate):
```sql
-- Aggregate queries for clinic/date
✅ queue_overrides_count_today     -- COUNT(*) WHERE clinic_id = X AND DATE(created_at) = Y
✅ skip_actions_today              -- COUNT(*) WHERE action_type = 'skip' AND clinic_id = X AND DATE(created_at) = Y
✅ emergency_insertions_today      -- COUNT(*) WHERE action_type = 'emergency' AND clinic_id = X AND DATE(created_at) = Y
```

---

## 🎯 Realistic Feature Mapping

### **Tier 1: Directly Available Features** (30+ features)

**From `appointments` table** (directly stored):
1. ✅ `queue_position` - Position in queue
2. ✅ `appointment_type` - Type (consultation, follow_up, etc.)
3. ✅ `estimated_duration` - Expected duration (minutes)
4. ✅ `is_first_visit` - First visit flag
5. ✅ `is_walk_in` - Walk-in flag
6. ✅ `is_holiday` - Holiday flag
7. ✅ `day_of_week` - Day (0-6)
8. ✅ `time_slot` - Time slot (morning/afternoon/evening)
9. ✅ `skip_count` - Number of times skipped
10. ✅ `complexity_score` - Complexity rating

**From `appointments` table** (computed):
11. ✅ `hour_of_day` - Extract from `scheduled_time` or `start_time`
12. ✅ `is_morning` - hour < 12
13. ✅ `is_afternoon` - 12 <= hour < 17
14. ✅ `is_evening` - hour >= 17
15. ✅ `is_weekday` - day_of_week < 5
16. ✅ `is_weekend` - day_of_week >= 5
17. ✅ `people_ahead_count` - queue_position - 1 (if > 0)
18. ✅ `has_checked_in` - checked_in_at IS NOT NULL
19. ✅ `is_late` - late_by_minutes > 0
20. ✅ `lateness_minutes` - late_by_minutes (direct)

**From `appointment_metrics` table** (directly stored):
21. ✅ `queue_length` - Total queue length (at prediction time)
22. ✅ `staff_count` - Active staff count (at prediction time)
23. ✅ `current_delay_minutes` - Current delay (at prediction time)

**From `appointment_metrics` table** (computed - historical):
24. ✅ `historical_avg_wait_time` - AVG(actual_wait_time) WHERE clinic_id = X (last 30 days)
25. ✅ `historical_avg_service_duration` - AVG(average_service_time) WHERE clinic_id = X
26. ✅ `historical_wait_time_std` - STDDEV(actual_wait_time) WHERE clinic_id = X
27. ✅ `historical_wait_time_p90` - PERCENTILE_CONT(0.9) WHERE clinic_id = X

**From `queue_snapshots` table** (latest snapshot):
28. ✅ `recent_total_waiting` - Latest snapshot total_waiting
29. ✅ `recent_total_in_progress` - Latest snapshot total_in_progress
30. ✅ `recent_active_staff_count` - Latest snapshot active_staff_count
31. ✅ `recent_staff_utilization` - Latest snapshot staff_utilization
32. ✅ `recent_average_wait_time` - Latest snapshot average_wait_time

**From `clinic_staff` table** (computed):
33. ✅ `active_staff_count` - COUNT(*) WHERE clinic_id = X AND is_active = true
34. ✅ `clinic_avg_consultation_duration` - AVG(average_consultation_duration) WHERE clinic_id = X
35. ✅ `assigned_staff_avg_duration` - SELECT average_consultation_duration WHERE id = staff_id

**From `patient_clinic_history` table** (if exists):
36. ✅ `patient_total_visits` - completed_visits
37. ✅ `patient_punctuality_score` - punctuality_score (0-1)
38. ✅ `patient_reliability_score` - reliability_score (0-1)
39. ✅ `patient_no_show_rate` - no_show_count / (completed_visits + no_show_count)
40. ✅ `patient_avg_appointment_duration` - average_actual_duration

**From aggregate queries** (computed at prediction time):
41. ✅ `waiting_count` - COUNT(*) WHERE status IN ('scheduled', 'waiting') AND clinic_id = X AND appointment_date = Y
42. ✅ `in_progress_count` - COUNT(*) WHERE status = 'in_progress' AND clinic_id = X AND appointment_date = Y
43. ✅ `completed_today_count` - COUNT(*) WHERE status = 'completed' AND clinic_id = X AND appointment_date = Y
44. ✅ `no_shows_today` - COUNT(*) FROM absent_patients WHERE clinic_id = X AND DATE(marked_absent_at) = Y
45. ✅ `queue_overrides_count_today` - COUNT(*) FROM queue_overrides WHERE clinic_id = X AND DATE(created_at) = Y
46. ✅ `emergency_insertions_today` - COUNT(*) FROM queue_overrides WHERE action_type = 'emergency' AND clinic_id = X

**From `clinics` table**:
47. ✅ `clinic_specialty` - specialty
48. ✅ `clinic_city` - city
49. ✅ `clinic_practice_type` - practice_type
50. ⚠️ `clinic_operating_mode` - settings->>'operating_mode' (if exists in JSONB)

---

### **Tier 2: Computable Features** (15+ features)

**Derived from base features**:
51. ✅ `expected_queue_clearance_time` - (people_ahead_count * clinic_avg_consultation_duration) / active_staff_count
52. ✅ `queue_load_ratio` - waiting_count / (active_staff_count * capacity_per_staff) - needs capacity definition
53. ✅ `minutes_until_appointment` - (scheduled_time - NOW()) IF scheduled_time > NOW()
54. ✅ `minutes_since_clinic_open` - Calculate from clinic opening hours (needs working_hours)
55. ✅ `position_times_avg_duration` - queue_position * clinic_avg_consultation_duration
56. ✅ `overload_factor` - waiting_count / historical_avg_waiting_count (needs historical average)

**From `appointment_metrics` (historical trends)**:
57. ✅ `recent_avg_wait_time` - AVG(actual_wait_time) WHERE clinic_id = X AND recorded_at > (NOW() - 7 days)
58. ✅ `wait_time_trend` - (recent_avg_wait_time - historical_avg_wait_time) / historical_avg_wait_time

**From `appointments` (historical by type)**:
59. ✅ `historical_avg_wait_for_type` - AVG(actual_wait_time) WHERE clinic_id = X AND appointment_type = Y
60. ✅ `historical_avg_service_for_type` - AVG(actual_duration) WHERE clinic_id = X AND appointment_type = Y

**From `queue_snapshots` (trends)**:
61. ✅ `queue_growth_rate` - (current_waiting - previous_waiting) / time_diff (compare snapshots)
62. ✅ `wait_time_trend` - (current_avg - previous_avg) / previous_avg (compare snapshots)

---

### **Tier 3: Missing / Not Available** (Would Need Implementation)

**NOT CURRENTLY AVAILABLE**:
- ❌ `staff_utilization` (real-time) - Can't calculate without active appointment tracking per staff
- ❌ `emergency_cases_ahead` - Not tracked separately (would need appointment_type filtering)
- ❌ `walk_ins_ahead` - Not directly available (would need to query is_walk_in = true AND queue_position < X)
- ❌ `cumulative_delay_minutes` - Not directly tracked (would need to calculate from disruptions)
- ❌ `clinic_buffer_time` - Not stored (in settings JSONB? needs confirmation)
- ❌ `is_ramadan` - Not computed (would need calendar logic)
- ❌ `patient_preferred_time_slot` - Only in patient_clinic_history if exists
- ❌ `clinic_allows_walk_ins` - Not stored (in settings JSONB? needs confirmation)

**CAN BE CALCULATED** (but requires multiple queries):
- ⚠️ `walk_ins_ahead` - COUNT(*) WHERE is_walk_in = true AND queue_position < current_queue_position
- ⚠️ `emergency_cases_ahead` - COUNT(*) WHERE appointment_type = 'emergency' AND queue_position < current_queue_position
- ⚠️ `cumulative_delay_minutes` - SUM of delays from disruptions (needs calculation from overrides/absences)

---

## ✅ Final Realistic Feature Set (60+ Features)

### **Directly Available (47 features)**
All features from Tier 1 that are stored or easily computed from single table.

### **Computable with Queries (15 features)**
All features from Tier 2 that require aggregate queries but are feasible.

### **Total: 62 Features**

---

## 📊 Feature Collection Strategy

### **At Prediction Time** (Real-Time Features)

**Query 1**: Get appointment details
```sql
SELECT * FROM appointments WHERE id = appointment_id
```
**Extracts**: queue_position, appointment_type, estimated_duration, is_first_visit, is_walk_in, day_of_week, time_slot, etc.

**Query 2**: Get queue state for clinic/date
```sql
SELECT 
  COUNT(*) FILTER (WHERE status IN ('scheduled', 'waiting')) AS waiting_count,
  COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress_count,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed_count
FROM appointments
WHERE clinic_id = X AND appointment_date = Y
```
**Extracts**: waiting_count, in_progress_count, completed_today_count

**Query 3**: Get staff info
```sql
SELECT 
  COUNT(*) AS active_staff_count,
  AVG(average_consultation_duration) AS clinic_avg_duration
FROM clinic_staff
WHERE clinic_id = X AND is_active = true
```
**Extracts**: active_staff_count, clinic_avg_consultation_duration

**Query 4**: Get latest queue snapshot
```sql
SELECT * FROM queue_snapshots
WHERE clinic_id = X AND snapshot_date = Y
ORDER BY snapshot_time DESC
LIMIT 1
```
**Extracts**: recent_total_waiting, recent_staff_utilization, etc.

**Query 5**: Get patient history (if exists)
```sql
SELECT * FROM patient_clinic_history
WHERE patient_id = X AND clinic_id = Y
```
**Extracts**: patient_total_visits, patient_punctuality_score, etc.

**Query 6**: Get historical averages
```sql
SELECT 
  AVG(actual_wait_time) AS historical_avg_wait_time,
  AVG(average_service_time) AS historical_avg_service_duration,
  STDDEV(actual_wait_time) AS historical_std
FROM appointment_metrics
WHERE clinic_id = X AND recorded_at > (NOW() - INTERVAL '30 days')
```
**Extracts**: historical_avg_wait_time, historical_avg_service_duration, historical_wait_time_std

**Query 7**: Get disruptions today
```sql
SELECT 
  COUNT(*) AS no_shows_today
FROM absent_patients
WHERE clinic_id = X AND DATE(marked_absent_at) = Y

SELECT 
  COUNT(*) AS overrides_today
FROM queue_overrides
WHERE clinic_id = X AND DATE(created_at) = Y
```
**Extracts**: no_shows_today, queue_overrides_count_today

---

### **After Appointment Completion** (Label Collection)

**Store actual wait time**:
```sql
CALL record_actual_wait_time(
  appointment_id,
  actual_wait_time,  -- (actual_start_time - checked_in_at) in minutes
  actual_service_duration  -- (actual_end_time - actual_start_time) in minutes
)
```
**Stores in**: `appointment_metrics.actual_wait_time` (LABEL)

---

## 🎯 Recommended Feature Set (Production-Ready)

### **Phase 1: MVP Features (25 features)** - Start Here

**Core Features** (Must Have):
1. `queue_position` ✅
2. `people_ahead_count` ✅
3. `appointment_type` ✅
4. `estimated_duration` ✅
5. `active_staff_count` ✅
6. `waiting_count` ✅
7. `in_progress_count` ✅
8. `historical_avg_wait_time` ✅
9. `historical_avg_service_duration` ✅
10. `clinic_avg_consultation_duration` ✅

**Temporal Features**:
11. `hour_of_day` ✅
12. `day_of_week` ✅
13. `is_weekend` ✅
14. `is_holiday` ✅
15. `time_slot` ✅

**Appointment Characteristics**:
16. `is_first_visit` ✅
17. `is_walk_in` ✅
18. `complexity_score` ✅ (if available)

**Patient Behavior** (if patient_clinic_history exists):
19. `patient_total_visits` ✅
20. `patient_punctuality_score` ✅
21. `patient_no_show_rate` ✅

**Queue State**:
22. `recent_total_waiting` ✅ (from latest snapshot)
23. `recent_active_staff_count` ✅
24. `recent_staff_utilization` ✅
25. `current_delay_minutes` ✅ (from latest snapshot)

---

### **Phase 2: Enhanced Features (40 features)** - Add After MVP

Add Tier 2 features:
- `expected_queue_clearance_time` (derived)
- `queue_load_ratio` (derived)
- `historical_wait_time_p90` (percentile)
- `wait_time_trend` (comparison)
- `queue_overrides_count_today`
- `no_shows_today`
- `emergency_insertions_today`
- `patient_reliability_score`
- `assigned_staff_avg_duration`

---

### **Phase 3: Advanced Features (60+ features)** - Future

Add all remaining features from Tier 2 and 3.

---

## 🔍 Data Quality Checklist

### **Missing Data Handling**
- ✅ Most fields are nullable (handle NULLs)
- ✅ Use default values for missing features (0, false, median)
- ✅ Track feature completeness (how many features available)

### **Data Validation**
- ✅ Validate `queue_position` >= 0
- ✅ Validate `estimated_duration` > 0
- ✅ Validate `actual_wait_time` >= 0 (label)
- ✅ Cap outliers (actual_wait_time <= 120 minutes)

### **Label Quality**
- ✅ Only use `actual_wait_time` if `checked_in_at` and `actual_start_time` both exist
- ✅ Exclude appointments where `actual_wait_time` < 0 or > 120
- ✅ Minimum 100 samples per clinic before training

---

## 📊 Summary

### **What We Have** ✅
- **47 directly available features** from database
- **15 computable features** from queries
- **Total: 62 realistic features**

### **What We Need to Verify** ⚠️
- `clinic_operating_mode` in `clinics.settings` JSONB?
- `clinic_buffer_time` in `clinics.settings` JSONB?
- `patient_clinic_history` table populated? (if not, calculate on-the-fly)

### **What We Can't Use** ❌
- Real-time `staff_utilization` (not tracked per staff)
- `cumulative_delay_minutes` (not directly tracked, needs calculation)
- `is_ramadan` (needs calendar logic)

---

## 🎯 Next Steps

1. ✅ **Verify JSONB fields**: Check if `clinic_operating_mode`, `clinic_buffer_time` exist in `clinics.settings`
2. ✅ **Verify `patient_clinic_history`**: Check if populated or needs on-the-fly calculation
3. ✅ **Start with Phase 1 (25 features)**: Build MVP model
4. ✅ **Validate data quality**: Check NULL rates, outliers
5. ✅ **Implement feature collection**: Build feature engineering pipeline

---

**This realistic feature set is based on actual database schema - no aspirational features!** ✅

