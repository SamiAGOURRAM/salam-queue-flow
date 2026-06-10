-- =====================================================
-- Phase 50A: Patient medical passport core foundation.
-- Addresses gaps #23, #25, #26 and improves #30.
-- =====================================================

DO $$ BEGIN
  CREATE TYPE public.patient_medical_entry_source AS ENUM ('patient', 'clinician');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.patient_problem_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  problem_name TEXT NOT NULL,
  icd10_code TEXT,
  notes TEXT,
  onset_date DATE,
  source public.patient_medical_entry_source NOT NULL DEFAULT 'clinician',
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_problem_list_problem_non_empty CHECK (length(trim(problem_name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_patient_problem_list_patient_active
  ON public.patient_problem_list(patient_id, is_active, recorded_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_problem_list_unique_active_problem
  ON public.patient_problem_list(patient_id, lower(problem_name))
  WHERE is_active;

CREATE TABLE IF NOT EXISTS public.patient_current_medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  medication_name TEXT NOT NULL,
  dosage TEXT,
  route TEXT,
  frequency TEXT,
  instructions TEXT,
  started_on DATE,
  expected_end_on DATE,
  source public.patient_medical_entry_source NOT NULL DEFAULT 'clinician',
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  stopped_at TIMESTAMPTZ,
  stopped_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  stop_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_current_medications_name_non_empty CHECK (length(trim(medication_name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_patient_current_medications_patient_active
  ON public.patient_current_medications(patient_id, is_active, recorded_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_current_medications_unique_active_name
  ON public.patient_current_medications(patient_id, lower(medication_name), COALESCE(lower(dosage), ''))
  WHERE is_active;

CREATE OR REPLACE FUNCTION public._patient_medical_passport_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patient_problem_list_touch_updated_at ON public.patient_problem_list;
CREATE TRIGGER patient_problem_list_touch_updated_at
  BEFORE UPDATE ON public.patient_problem_list
  FOR EACH ROW
  EXECUTE FUNCTION public._patient_medical_passport_touch_updated_at();

DROP TRIGGER IF EXISTS patient_current_medications_touch_updated_at ON public.patient_current_medications;
CREATE TRIGGER patient_current_medications_touch_updated_at
  BEFORE UPDATE ON public.patient_current_medications
  FOR EACH ROW
  EXECUTE FUNCTION public._patient_medical_passport_touch_updated_at();

CREATE OR REPLACE FUNCTION public._is_patient_owner(
  p_patient_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND p.user_id = p_user_id
      AND NOT p.is_anonymized
  );
$$;

CREATE OR REPLACE FUNCTION public._clinic_user_can_access_patient_medical_passport(
  p_patient_id UUID,
  p_user_id UUID DEFAULT auth.uid(),
  p_permission_key TEXT DEFAULT 'view_medical_records'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed BOOLEAN := false;
BEGIN
  IF p_patient_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF public._is_patient_owner(p_patient_id, p_user_id) THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.patient_id = p_patient_id
      AND public._user_has_clinic_permission(a.clinic_id, p_user_id, p_permission_key)
  )
  INTO v_allowed;

  RETURN v_allowed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._is_patient_owner(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._clinic_user_can_access_patient_medical_passport(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._is_patient_owner(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public._clinic_user_can_access_patient_medical_passport(UUID, UUID, TEXT) TO authenticated;

-- Backfill a baseline active problem list from latest diagnoses.
INSERT INTO public.patient_problem_list (
  patient_id,
  clinic_id,
  problem_name,
  icd10_code,
  notes,
  source,
  recorded_by,
  recorded_at,
  is_active
)
SELECT
  seed.patient_id,
  seed.clinic_id,
  seed.problem_name,
  seed.icd10_code,
  seed.notes,
  'clinician'::public.patient_medical_entry_source,
  seed.recorded_by,
  seed.recorded_at,
  true
FROM (
  SELECT
    d.patient_id,
    d.clinic_id,
    trim(d.diagnosis_label) AS problem_name,
    d.diagnosis_code AS icd10_code,
    d.diagnosis_notes AS notes,
    d.diagnosed_by AS recorded_by,
    d.created_at AS recorded_at,
    ROW_NUMBER() OVER (
      PARTITION BY d.patient_id, lower(trim(d.diagnosis_label))
      ORDER BY d.created_at DESC, d.id DESC
    ) AS rn
  FROM public.medical_record_diagnoses d
  WHERE COALESCE(trim(d.diagnosis_label), '') <> ''
) AS seed
WHERE seed.rn = 1
  AND NOT EXISTS (
    SELECT 1
    FROM public.patient_problem_list existing
    WHERE existing.patient_id = seed.patient_id
      AND existing.is_active = true
      AND lower(existing.problem_name) = lower(seed.problem_name)
  );

-- Backfill a baseline active current-medication list from latest prescriptions.
INSERT INTO public.patient_current_medications (
  patient_id,
  clinic_id,
  medication_name,
  dosage,
  route,
  frequency,
  instructions,
  source,
  recorded_by,
  recorded_at,
  is_active
)
SELECT
  seed.patient_id,
  seed.clinic_id,
  seed.medication_name,
  seed.dosage,
  seed.route,
  seed.frequency,
  seed.instructions,
  'clinician'::public.patient_medical_entry_source,
  seed.recorded_by,
  seed.recorded_at,
  true
FROM (
  SELECT
    p.patient_id,
    p.clinic_id,
    trim(p.medication_name) AS medication_name,
    p.dosage,
    p.route,
    p.frequency,
    p.instructions,
    p.prescribed_by AS recorded_by,
    p.created_at AS recorded_at,
    ROW_NUMBER() OVER (
      PARTITION BY p.patient_id, lower(trim(p.medication_name)), COALESCE(lower(p.dosage), '')
      ORDER BY p.created_at DESC, p.id DESC
    ) AS rn
  FROM public.medical_record_prescriptions p
  WHERE COALESCE(trim(p.medication_name), '') <> ''
) AS seed
WHERE seed.rn = 1
  AND NOT EXISTS (
    SELECT 1
    FROM public.patient_current_medications existing
    WHERE existing.patient_id = seed.patient_id
      AND existing.is_active = true
      AND lower(existing.medication_name) = lower(seed.medication_name)
      AND COALESCE(lower(existing.dosage), '') = COALESCE(lower(seed.dosage), '')
  );

ALTER TABLE public.patient_problem_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_current_medications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_select_own_problem_list ON public.patient_problem_list;
CREATE POLICY patient_select_own_problem_list
  ON public.patient_problem_list FOR SELECT
  USING (public._is_patient_owner(patient_id, auth.uid()));

DROP POLICY IF EXISTS patient_insert_own_problem_list ON public.patient_problem_list;
CREATE POLICY patient_insert_own_problem_list
  ON public.patient_problem_list FOR INSERT
  WITH CHECK (
    public._is_patient_owner(patient_id, auth.uid())
    AND source = 'patient'
    AND recorded_by = auth.uid()
  );

DROP POLICY IF EXISTS patient_update_own_problem_list ON public.patient_problem_list;
CREATE POLICY patient_update_own_problem_list
  ON public.patient_problem_list FOR UPDATE
  USING (public._is_patient_owner(patient_id, auth.uid()))
  WITH CHECK (public._is_patient_owner(patient_id, auth.uid()));

DROP POLICY IF EXISTS clinic_staff_select_problem_list ON public.patient_problem_list;
CREATE POLICY clinic_staff_select_problem_list
  ON public.patient_problem_list FOR SELECT
  USING (
    public._clinic_user_can_access_patient_medical_passport(patient_id, auth.uid(), 'view_medical_records')
  );

DROP POLICY IF EXISTS clinic_staff_insert_problem_list ON public.patient_problem_list;
CREATE POLICY clinic_staff_insert_problem_list
  ON public.patient_problem_list FOR INSERT
  WITH CHECK (
    public._clinic_user_can_access_patient_medical_passport(patient_id, auth.uid(), 'manage_medical_records')
    AND recorded_by = auth.uid()
    AND source = 'clinician'
  );

DROP POLICY IF EXISTS clinic_staff_update_problem_list ON public.patient_problem_list;
CREATE POLICY clinic_staff_update_problem_list
  ON public.patient_problem_list FOR UPDATE
  USING (
    public._clinic_user_can_access_patient_medical_passport(patient_id, auth.uid(), 'manage_medical_records')
  )
  WITH CHECK (
    public._clinic_user_can_access_patient_medical_passport(patient_id, auth.uid(), 'manage_medical_records')
  );

DROP POLICY IF EXISTS patient_select_own_current_medications ON public.patient_current_medications;
CREATE POLICY patient_select_own_current_medications
  ON public.patient_current_medications FOR SELECT
  USING (public._is_patient_owner(patient_id, auth.uid()));

DROP POLICY IF EXISTS patient_insert_own_current_medications ON public.patient_current_medications;
CREATE POLICY patient_insert_own_current_medications
  ON public.patient_current_medications FOR INSERT
  WITH CHECK (
    public._is_patient_owner(patient_id, auth.uid())
    AND source = 'patient'
    AND recorded_by = auth.uid()
  );

DROP POLICY IF EXISTS patient_update_own_current_medications ON public.patient_current_medications;
CREATE POLICY patient_update_own_current_medications
  ON public.patient_current_medications FOR UPDATE
  USING (public._is_patient_owner(patient_id, auth.uid()))
  WITH CHECK (public._is_patient_owner(patient_id, auth.uid()));

DROP POLICY IF EXISTS clinic_staff_select_current_medications ON public.patient_current_medications;
CREATE POLICY clinic_staff_select_current_medications
  ON public.patient_current_medications FOR SELECT
  USING (
    public._clinic_user_can_access_patient_medical_passport(patient_id, auth.uid(), 'view_medical_records')
  );

DROP POLICY IF EXISTS clinic_staff_insert_current_medications ON public.patient_current_medications;
CREATE POLICY clinic_staff_insert_current_medications
  ON public.patient_current_medications FOR INSERT
  WITH CHECK (
    public._clinic_user_can_access_patient_medical_passport(patient_id, auth.uid(), 'manage_medical_records')
    AND recorded_by = auth.uid()
    AND source = 'clinician'
  );

DROP POLICY IF EXISTS clinic_staff_update_current_medications ON public.patient_current_medications;
CREATE POLICY clinic_staff_update_current_medications
  ON public.patient_current_medications FOR UPDATE
  USING (
    public._clinic_user_can_access_patient_medical_passport(patient_id, auth.uid(), 'manage_medical_records')
  )
  WITH CHECK (
    public._clinic_user_can_access_patient_medical_passport(patient_id, auth.uid(), 'manage_medical_records')
  );

GRANT SELECT, INSERT, UPDATE ON public.patient_problem_list TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.patient_current_medications TO authenticated;

CREATE OR REPLACE FUNCTION public.get_patient_medical_passport(
  p_patient_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_allergies JSONB := '[]'::jsonb;
  v_active_problems JSONB := '[]'::jsonb;
  v_current_medications JSONB := '[]'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_patient_id IS NULL THEN
    RAISE EXCEPTION 'patient_id is required';
  END IF;

  IF NOT public._clinic_user_can_access_patient_medical_passport(p_patient_id, v_user_id, 'view_medical_records') THEN
    RAISE EXCEPTION 'You do not have permission to view this patient passport' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', pa.id,
        'substance', pa.substance,
        'severity', pa.severity,
        'reaction', pa.reaction,
        'notes', pa.notes,
        'recordedAt', pa.recorded_at
      )
      ORDER BY
        CASE pa.severity
          WHEN 'severe' THEN 0
          WHEN 'moderate' THEN 1
          WHEN 'mild' THEN 2
          ELSE 3
        END,
        pa.recorded_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_allergies
  FROM public.patient_allergies pa
  WHERE pa.patient_id = p_patient_id
    AND pa.is_active = true;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', ppl.id,
        'problemName', ppl.problem_name,
        'icd10Code', ppl.icd10_code,
        'notes', ppl.notes,
        'onsetDate', ppl.onset_date,
        'recordedAt', ppl.recorded_at,
        'source', ppl.source
      )
      ORDER BY ppl.recorded_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_active_problems
  FROM public.patient_problem_list ppl
  WHERE ppl.patient_id = p_patient_id
    AND ppl.is_active = true;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', pcm.id,
        'medicationName', pcm.medication_name,
        'dosage', pcm.dosage,
        'route', pcm.route,
        'frequency', pcm.frequency,
        'instructions', pcm.instructions,
        'startedOn', pcm.started_on,
        'expectedEndOn', pcm.expected_end_on,
        'recordedAt', pcm.recorded_at,
        'source', pcm.source
      )
      ORDER BY pcm.recorded_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_current_medications
  FROM public.patient_current_medications pcm
  WHERE pcm.patient_id = p_patient_id
    AND pcm.is_active = true;

  RETURN jsonb_build_object(
    'patientId', p_patient_id,
    'allergies', v_allergies,
    'activeProblems', v_active_problems,
    'currentMedications', v_current_medications,
    'counts', jsonb_build_object(
      'allergies', jsonb_array_length(v_allergies),
      'activeProblems', jsonb_array_length(v_active_problems),
      'currentMedications', jsonb_array_length(v_current_medications)
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_patient_medical_passport(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_patient_medical_passport(UUID) TO authenticated;
