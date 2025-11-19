-- Migration: Implement Advanced Queue Logic & Day-Specific Modes (Clean Standard)
-- Description: Adds RFC fields, migrates legacy JSON settings, and updates queue sorting.
-- Author: QueueMed AI

-- ============================================================================
-- 1. SCHEMA UPDATES
-- ============================================================================

-- Update CLINICS table
ALTER TABLE clinics 
ADD COLUMN IF NOT EXISTS queue_mode TEXT DEFAULT 'fluid' CHECK (queue_mode IN ('fixed', 'fluid', 'hybrid')),
ADD COLUMN IF NOT EXISTS allow_overflow BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS grace_period_minutes INT DEFAULT 15,
ADD COLUMN IF NOT EXISTS daily_capacity_limit INT,
ADD COLUMN IF NOT EXISTS late_arrival_policy TEXT DEFAULT 'priority_walk_in' CHECK (late_arrival_policy IN ('priority_walk_in', 'reschedule_only'));

-- Update APPOINTMENTS table
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS priority_score INT DEFAULT 100,
ADD COLUMN IF NOT EXISTS is_gap_filler BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS promoted_from_waitlist BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS late_arrival_converted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS original_slot_time TIMESTAMP WITH TIME ZONE;

-- Create WAITLIST table
CREATE TABLE IF NOT EXISTS waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    guest_patient_id UUID REFERENCES guest_patients(id) ON DELETE SET NULL,
    requested_date DATE NOT NULL,
    requested_time_range_start TIME, 
    requested_time_range_end TIME,   
    priority_score INT DEFAULT 0,
    status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'notified', 'promoted', 'expired', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,
    CONSTRAINT check_waitlist_patient CHECK (
        (patient_id IS NOT NULL AND guest_patient_id IS NULL) OR 
        (patient_id IS NULL AND guest_patient_id IS NOT NULL)
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_waitlist_clinic_date ON waitlist(clinic_id, requested_date);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(status);

-- RLS
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Clinic staff can view waitlist" ON waitlist;
CREATE POLICY "Clinic staff can view waitlist" ON waitlist FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM clinic_staff WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "Clinic staff can manage waitlist" ON waitlist;
CREATE POLICY "Clinic staff can manage waitlist" ON waitlist FOR ALL USING (clinic_id IN (SELECT clinic_id FROM clinic_staff WHERE user_id = auth.uid()));

-- Enhance QUEUE_OVERRIDES
ALTER TABLE queue_overrides
ADD COLUMN IF NOT EXISTS previous_state JSONB,
ADD COLUMN IF NOT EXISTS new_state JSONB;

ALTER TABLE queue_overrides DROP CONSTRAINT IF EXISTS queue_overrides_action_type_check;
ALTER TABLE queue_overrides 
ADD CONSTRAINT queue_overrides_action_type_check CHECK (
    action_type IN (
        'call_present', 'mark_absent', 'late_arrival', 'emergency', 'reorder',
        'swap', 'force_add', 'priority_boost', 'manual_move'
    )
);

-- ============================================================================
-- 2. DATA MIGRATION (Eliminating Legacy Debt)
-- ============================================================================

-- Migrate 'daily_queue_modes' inside settings JSONB
-- Replace 'time_grid_fixed' -> 'fixed'
-- Replace 'ordinal_queue' -> 'fluid'

UPDATE clinics
SET settings = jsonb_set(
    settings,
    '{daily_queue_modes}',
    (
        SELECT jsonb_object_agg(
            key,
            CASE value::text
                WHEN '"time_grid_fixed"' THEN '"fixed"'::jsonb
                WHEN '"ordinal_queue"' THEN '"fluid"'::jsonb
                ELSE value
            END
        )
        FROM jsonb_each(settings->'daily_queue_modes')
    )
)
WHERE settings ? 'daily_queue_modes';

-- Migrate 'operating_mode' column if it exists (converting to queue_mode)
-- Only update queue_mode if it hasn't been manually set yet (still default)
UPDATE clinics
SET queue_mode = CASE 
    WHEN operating_mode::text = 'time_grid_fixed' THEN 'fixed'
    WHEN operating_mode::text = 'ordinal_queue' THEN 'fluid'
    ELSE 'fluid'
END
WHERE queue_mode IS NOT DISTINCT FROM 'fluid' -- Only if still default
  AND operating_mode IS NOT NULL;


-- ============================================================================
-- 3. FUNCTION UPDATES (Clean Standard Logic)
-- ============================================================================

-- Helper: Calculate Priority Score
CREATE OR REPLACE FUNCTION calculate_priority_score(
    p_appointment_type TEXT,
    p_is_walk_in BOOLEAN,
    p_is_emergency BOOLEAN DEFAULT FALSE
) RETURNS INT AS $$
BEGIN
    IF p_is_emergency THEN RETURN 500; END IF;
    IF p_is_walk_in THEN RETURN 50; END IF;
    RETURN 100;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger for Initial Score
CREATE OR REPLACE FUNCTION set_initial_priority_score() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.priority_score IS NULL OR NEW.priority_score = 100 THEN
         NEW.priority_score := calculate_priority_score(
             NEW.appointment_type, 
             NEW.is_walk_in, 
             (NEW.appointment_type = 'emergency')
         );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_priority_score_trigger ON appointments;
CREATE TRIGGER set_priority_score_trigger
BEFORE INSERT ON appointments
FOR EACH ROW EXECUTE FUNCTION set_initial_priority_score();


-- Function: get_effective_queue_mode (CLEAN)
-- No legacy mapping. Only understands 'fixed', 'fluid', 'hybrid'.
CREATE OR REPLACE FUNCTION get_effective_queue_mode(p_clinic_id uuid, p_date date)
RETURNS TEXT AS $$
DECLARE
    v_settings JSONB;
    v_day_name TEXT;
    v_day_mode TEXT;
    v_global_mode TEXT;
BEGIN
    -- 1. Get Clinic Settings & Global Mode
    SELECT settings, queue_mode 
    INTO v_settings, v_global_mode
    FROM clinics 
    WHERE id = p_clinic_id;

    -- 2. Determine Day Name (monday, tuesday...)
    v_day_name := LOWER(TRIM(TO_CHAR(p_date, 'Day')));

    -- 3. Check for Daily Override in settings
    v_day_mode := v_settings #>> ARRAY['daily_queue_modes', v_day_name];

    -- 4. Return specific mode if valid
    IF v_day_mode IN ('fixed', 'fluid', 'hybrid') THEN RETURN v_day_mode; END IF;

    -- 5. Fallback to Global Default
    RETURN COALESCE(v_global_mode, 'fluid');
END;
$$ LANGUAGE plpgsql STABLE;


-- Function: recalculate_queue_positions (UPDATED)
CREATE OR REPLACE FUNCTION public.recalculate_queue_positions(p_clinic_id uuid, p_appointment_date date)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_mode TEXT;
BEGIN
  -- Get the effective mode for this specific date
  v_mode := get_effective_queue_mode(p_clinic_id, p_appointment_date);

  -- Recalculate positions
  WITH ranked_queue AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        ORDER BY 
           -- Logic Switch based on Mode
           CASE WHEN v_mode = 'fixed' THEN 0 ELSE priority_score END DESC, -- Fluid: High Score First
           
           -- Secondary Sort: Time
           COALESCE(start_time::time, '00:00:00'::time) ASC,
           
           -- Tertiary Sort: Creation Time (FIFO)
           created_at ASC
      ) as new_position
    FROM appointments
    WHERE clinic_id = p_clinic_id
      AND appointment_date = p_appointment_date
      AND status IN ('scheduled', 'waiting')
      AND (skip_reason IS NULL OR skip_reason != 'patient_absent')
  )
  UPDATE appointments a
  SET queue_position = rq.new_position
  FROM ranked_queue rq
  WHERE a.id = rq.id;
  
  -- Set queue_position to NULL for non-waiting patients
  UPDATE appointments
  SET queue_position = NULL
  WHERE clinic_id = p_clinic_id
    AND appointment_date = p_appointment_date
    AND (
      status NOT IN ('scheduled', 'waiting')
      OR skip_reason = 'patient_absent'
    );
END;
$function$;
