-- Migration: Merge Fixed and Hybrid queue modes into Slotted
-- Date: November 2025
-- Purpose: Simplify queue modes from 3 (fixed, hybrid, fluid) to 2 (slotted, fluid)
--          Fixed and Hybrid were functionally identical, so merging them simplifies the system

-- Step 1: Update clinics.queue_mode column constraint
ALTER TABLE clinics
  DROP CONSTRAINT IF EXISTS clinics_queue_mode_check;

ALTER TABLE clinics
  ADD CONSTRAINT clinics_queue_mode_check CHECK (
    queue_mode IN ('slotted', 'fluid')
  );

-- Step 2: Migrate existing data
-- Convert 'fixed' and 'hybrid' to 'slotted'
UPDATE clinics
SET queue_mode = 'slotted'
WHERE queue_mode IN ('fixed', 'hybrid');

-- Step 3: Update daily_queue_modes in settings JSONB
-- This updates all daily_queue_modes entries in the settings JSONB column
UPDATE clinics
SET settings = jsonb_set(
  settings,
  '{daily_queue_modes}',
  (
    SELECT jsonb_object_agg(
      key,
      CASE 
        WHEN value::text IN ('"fixed"', '"hybrid"') THEN '"slotted"'::jsonb
        ELSE value
      END
    )
    FROM jsonb_each(COALESCE(settings->'daily_queue_modes', '{}'::jsonb))
  )
)
WHERE settings ? 'daily_queue_modes'
  AND EXISTS (
    SELECT 1
    FROM jsonb_each(settings->'daily_queue_modes')
    WHERE value::text IN ('"fixed"', '"hybrid"')
  );

-- Step 4: Update get_effective_queue_mode function to handle migration
CREATE OR REPLACE FUNCTION get_effective_queue_mode(p_clinic_id uuid, p_date date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings jsonb;
  v_queue_mode text;
  v_day_name text;
  v_day_mode text;
BEGIN
  -- Get clinic settings and queue_mode
  SELECT settings, queue_mode 
  INTO v_settings, v_queue_mode
  FROM clinics
  WHERE id = p_clinic_id;

  IF v_settings IS NULL THEN
    RETURN COALESCE(v_queue_mode, 'fluid');
  END IF;

  -- Get day name (lowercase)
  v_day_name := lower(to_char(p_date, 'Day'));
  v_day_name := trim(v_day_name);

  -- Check if daily_queue_modes exists and has entry for this day
  IF v_settings ? 'daily_queue_modes' THEN
    v_day_mode := v_settings #>> ARRAY['daily_queue_modes', v_day_name];
    
    -- Migrate legacy modes to new standard
    IF v_day_mode IN ('fixed', 'hybrid') THEN
      v_day_mode := 'slotted';
    END IF;
    
    IF v_day_mode IS NOT NULL AND v_day_mode IN ('slotted', 'fluid') THEN
      RETURN v_day_mode;
    END IF;
  END IF;

  -- Fall back to clinic-level queue_mode (with migration)
  IF v_queue_mode IN ('fixed', 'hybrid') THEN
    RETURN 'slotted';
  END IF;

  RETURN COALESCE(v_queue_mode, 'fluid');
END;
$$;

-- Step 5: Add comment explaining the migration
COMMENT ON FUNCTION get_effective_queue_mode IS 
'Returns the effective queue mode for a clinic on a specific date. Migrates legacy "fixed" and "hybrid" modes to "slotted" for backward compatibility.';

-- Step 6: Update any RPC functions that return queue_mode
-- (get_daily_schedule_for_clinic and get_daily_schedule_for_staff already use get_effective_queue_mode, so they're covered)

-- Verification query (run this to check migration)
-- SELECT 
--   id,
--   name,
--   queue_mode,
--   settings->'daily_queue_modes' as daily_modes
-- FROM clinics
-- WHERE queue_mode IN ('fixed', 'hybrid')
--    OR EXISTS (
--      SELECT 1
--      FROM jsonb_each(COALESCE(settings->'daily_queue_modes', '{}'::jsonb))
--      WHERE value::text IN ('"fixed"', '"hybrid"')
--    );

