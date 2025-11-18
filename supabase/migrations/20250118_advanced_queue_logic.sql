-- Migration: Advanced Queue Logic Schema Changes
-- Description: Adds support for waitlist, evolves queue_overrides, and adds queue mode configuration

-- =====================================================
-- 1. CREATE WAITLIST TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL,
  patient_id UUID NULL, -- Nullable for guest patients
  guest_name TEXT NULL,
  guest_phone TEXT NULL,
  requested_date DATE NOT NULL,
  requested_time_range TSRANGE NULL, -- Optional time preference
  priority INT DEFAULT 0,
  status TEXT DEFAULT 'waiting',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notified_at TIMESTAMPTZ NULL,
  promoted_to_appointment_id UUID NULL,
  
  CONSTRAINT waitlist_clinic_id_fkey FOREIGN KEY (clinic_id) 
    REFERENCES public.clinics(id) ON DELETE CASCADE,
  CONSTRAINT waitlist_patient_id_fkey FOREIGN KEY (patient_id) 
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT waitlist_promoted_to_appointment_id_fkey FOREIGN KEY (promoted_to_appointment_id) 
    REFERENCES public.appointments(id) ON DELETE SET NULL,
  CONSTRAINT waitlist_status_check CHECK (
    status IN ('waiting', 'notified', 'booked', 'expired', 'cancelled')
  )
) TABLESPACE pg_default;

-- Waitlist indexes
CREATE INDEX IF NOT EXISTS idx_waitlist_clinic_date 
  ON public.waitlist(clinic_id, requested_date);
CREATE INDEX IF NOT EXISTS idx_waitlist_status 
  ON public.waitlist(status) WHERE status = 'waiting';

-- =====================================================
-- 2. EVOLVE QUEUE_OVERRIDES TABLE
-- =====================================================

-- Add new columns to queue_overrides
ALTER TABLE public.queue_overrides 
  ADD COLUMN IF NOT EXISTS metadata JSONB NULL;

ALTER TABLE public.queue_overrides 
  ADD COLUMN IF NOT EXISTS affected_appointments UUID[] NULL;

-- Drop the existing constraint
ALTER TABLE public.queue_overrides 
  DROP CONSTRAINT IF EXISTS queue_overrides_action_type_check;

-- Add updated constraint with new action types
ALTER TABLE public.queue_overrides 
  ADD CONSTRAINT queue_overrides_action_type_check CHECK (
    action_type = ANY (ARRAY[
      'call_present'::text,
      'mark_absent'::text,
      'late_arrival'::text,
      'emergency'::text,
      'reorder'::text,
      'swap'::text,
      'priority_boost'::text,
      'force_add'::text,
      'create_slot'::text,
      'extend_slot'::text
    ])
  );

-- =====================================================
-- 3. UPDATE CLINICS TABLE
-- =====================================================

-- Add queue mode configuration columns
ALTER TABLE public.clinics 
  ADD COLUMN IF NOT EXISTS queue_mode TEXT DEFAULT 'fluid';

ALTER TABLE public.clinics 
  ADD COLUMN IF NOT EXISTS allow_overflow BOOLEAN DEFAULT false;

ALTER TABLE public.clinics 
  ADD COLUMN IF NOT EXISTS grace_period_minutes INT DEFAULT 10;

ALTER TABLE public.clinics 
  ADD COLUMN IF NOT EXISTS daily_capacity_limit INT NULL;

-- Add constraint for queue_mode
ALTER TABLE public.clinics 
  DROP CONSTRAINT IF EXISTS clinics_queue_mode_check;

ALTER TABLE public.clinics 
  ADD CONSTRAINT clinics_queue_mode_check CHECK (
    queue_mode IN ('fixed', 'fluid', 'hybrid')
  );

-- =====================================================
-- 4. UPDATE APPOINTMENTS TABLE
-- =====================================================

-- Add fields for dynamic priority and status tracking
ALTER TABLE public.appointments 
  ADD COLUMN IF NOT EXISTS priority_score INT DEFAULT 100;

ALTER TABLE public.appointments 
  ADD COLUMN IF NOT EXISTS is_gap_filler BOOLEAN DEFAULT false;

ALTER TABLE public.appointments 
  ADD COLUMN IF NOT EXISTS promoted_from_waitlist BOOLEAN DEFAULT false;

ALTER TABLE public.appointments 
  ADD COLUMN IF NOT EXISTS late_arrival_converted BOOLEAN DEFAULT false;

-- Add index for priority-based queries
CREATE INDEX IF NOT EXISTS idx_appointments_priority 
  ON public.appointments(clinic_id, appointment_date, priority_score DESC) 
  WHERE status IN ('scheduled', 'waiting', 'checked_in');

-- =====================================================
-- 5. COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.waitlist IS 
  'Remote waiting list for patients requesting appointments when clinic is full';

COMMENT ON COLUMN public.waitlist.requested_time_range IS 
  'Optional time preference as a range (e.g., ''10:00-14:00'')';

COMMENT ON COLUMN public.queue_overrides.metadata IS 
  'Flexible JSONB field for action-specific data (e.g., swap details, priority reason)';

COMMENT ON COLUMN public.queue_overrides.affected_appointments IS 
  'Array of appointment IDs affected by this action (e.g., both IDs for a swap)';

COMMENT ON COLUMN public.clinics.queue_mode IS 
  'Queue management mode: fixed (strict schedule), fluid (smart shifting), hybrid (mixed)';

COMMENT ON COLUMN public.clinics.allow_overflow IS 
  'Whether to allow overflow patients when all slots are full (adds to waitlist)';

COMMENT ON COLUMN public.clinics.grace_period_minutes IS 
  'Minutes of grace period before marking a patient as late/absent';

COMMENT ON COLUMN public.appointments.priority_score IS 
  'Dynamic priority score for "Call Next" algorithm (higher = higher priority)';

COMMENT ON COLUMN public.appointments.is_gap_filler IS 
  'True if patient arrived early and can fill gaps from cancellations';

COMMENT ON COLUMN public.appointments.promoted_from_waitlist IS 
  'True if patient was promoted from waitlist to fill a gap';

COMMENT ON COLUMN public.appointments.late_arrival_converted IS 
  'True if patient arrived late and was converted to walk-in priority';
