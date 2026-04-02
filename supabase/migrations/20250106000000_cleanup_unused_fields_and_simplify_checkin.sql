-- Migration: Cleanup Unused Fields & Simplify Check-In Flow
-- Note: Base schema already reflects the cleaned-up state.
-- This migration is kept for historical record.

-- Drop columns if they exist (no-op if base schema is already clean)
ALTER TABLE public.appointments DROP COLUMN IF EXISTS patient_arrival_time;
ALTER TABLE public.appointments DROP COLUMN IF EXISTS complexity_score;
ALTER TABLE public.appointments DROP COLUMN IF EXISTS requires_preparation;
ALTER TABLE public.appointments DROP COLUMN IF EXISTS actual_start_time;

COMMENT ON COLUMN public.appointments.checked_in_at IS
'Timestamp when patient entered consultation room (set when staff calls "Call Next").';

COMMENT ON COLUMN public.appointments.actual_end_time IS
'Timestamp when consultation ended (set when staff completes appointment).';
