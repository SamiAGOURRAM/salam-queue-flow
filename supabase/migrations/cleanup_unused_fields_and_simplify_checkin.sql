-- Migration: Cleanup Unused Fields & Simplify Check-In Flow
-- Date: January 2025
-- Purpose: 
--   1. Remove unused/dead columns (patient_arrival_time, complexity_score, requires_preparation)
--   2. Remove actual_start_time (merged with checked_in_at)
--   3. Simplify check-in flow (staff-controlled entry)

-- ============================================================
-- PHASE 1: Backup existing data (if needed for rollback)
-- ============================================================
-- Note: If you need to rollback, you can restore from backups
-- For production, consider creating a backup table first:
-- CREATE TABLE appointments_backup AS SELECT * FROM appointments;

-- ============================================================
-- PHASE 2: Update dependent code logic first
-- ============================================================
-- This migration should be applied AFTER code changes are deployed
-- The code changes should handle the transition period

-- ============================================================
-- PHASE 3: Drop unused columns
-- ============================================================

-- Drop patient_arrival_time (never used)
ALTER TABLE public.appointments 
DROP COLUMN IF EXISTS patient_arrival_time;

-- Drop complexity_score (never used)
ALTER TABLE public.appointments 
DROP COLUMN IF EXISTS complexity_score;

-- Drop requires_preparation (never used)
ALTER TABLE public.appointments 
DROP COLUMN IF EXISTS requires_preparation;

-- ============================================================
-- PHASE 4: Merge actual_start_time into checked_in_at
-- ============================================================

-- Step 1: Migrate existing data (for appointments that have actual_start_time but no checked_in_at)
-- This preserves existing data during transition
UPDATE public.appointments
SET checked_in_at = actual_start_time
WHERE actual_start_time IS NOT NULL 
  AND checked_in_at IS NULL
  AND status IN ('in_progress', 'completed');

-- Step 2: For completed appointments, ensure checked_in_at is set
-- If both exist and they differ, prefer actual_start_time (more accurate)
UPDATE public.appointments
SET checked_in_at = actual_start_time
WHERE actual_start_time IS NOT NULL 
  AND checked_in_at IS NOT NULL
  AND status = 'completed'
  AND actual_start_time != checked_in_at;

-- Step 3: Drop actual_start_time column (now redundant with checked_in_at)
ALTER TABLE public.appointments 
DROP COLUMN IF EXISTS actual_start_time;

-- ============================================================
-- PHASE 5: Update constraints and indexes (if needed)
-- ============================================================

-- No specific constraints or indexes need updating
-- The existing indexes on checked_in_at will handle queries

-- ============================================================
-- PHASE 6: Update appointment_metrics table (if it references actual_start_time)
-- ============================================================

-- Check if appointment_metrics has any references to actual_start_time
-- If the code already uses checked_in_at, this might not be needed
-- But for safety, we'll verify the function that records wait times

-- ============================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================

COMMENT ON COLUMN public.appointments.checked_in_at IS 
'Timestamp when patient entered consultation room (set when staff calls "Call Next"). 
This replaces the old actual_start_time field for simplicity.';

COMMENT ON COLUMN public.appointments.actual_end_time IS 
'Timestamp when consultation ended (set when staff completes appointment).';

COMMENT ON COLUMN public.appointments.start_time IS 
'Scheduled appointment start time (set at booking).';

COMMENT ON COLUMN public.appointments.end_time IS 
'Scheduled appointment end time (set at booking).';

-- ============================================================
-- VERIFICATION QUERIES (run after migration to verify)
-- ============================================================

-- Verify all completed appointments have checked_in_at
-- SELECT COUNT(*) FROM appointments 
-- WHERE status = 'completed' AND checked_in_at IS NULL;

-- Verify no orphaned data
-- SELECT COUNT(*) FROM appointments 
-- WHERE status IN ('in_progress', 'completed') 
--   AND checked_in_at IS NULL;

-- ============================================================
-- ROLLBACK SCRIPT (if needed - DON'T RUN unless rollback is required)
-- ============================================================

/*
-- ROLLBACK: Restore columns (only if migration fails)

-- Restore actual_start_time
ALTER TABLE public.appointments 
ADD COLUMN actual_start_time timestamp with time zone null;

-- Restore patient_arrival_time
ALTER TABLE public.appointments 
ADD COLUMN patient_arrival_time timestamp with time zone null;

-- Restore complexity_score
ALTER TABLE public.appointments 
ADD COLUMN complexity_score integer null 
CHECK (complexity_score >= 1 AND complexity_score <= 5);

-- Restore requires_preparation
ALTER TABLE public.appointments 
ADD COLUMN requires_preparation boolean null default false;

-- Restore data from checked_in_at (if migration ran)
UPDATE public.appointments
SET actual_start_time = checked_in_at
WHERE checked_in_at IS NOT NULL 
  AND actual_start_time IS NULL
  AND status IN ('in_progress', 'completed');
*/

