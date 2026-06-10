-- =====================================================
-- Patient Allergies
-- =====================================================
-- Safety-first clinical data. Surfaced at the top of the doctor's
-- consultation view as a red banner. Patients can also self-declare.
--
-- Visibility rule: any clinic staff member whose clinic has ever
-- had (or has scheduled) an appointment for the patient can read and
-- manage allergies. Allergies are life-safety information and do NOT
-- require per-visit consent gating.
-- =====================================================

DO $$ BEGIN
  CREATE TYPE public.patient_allergy_severity AS ENUM ('mild', 'moderate', 'severe', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.patient_allergy_source AS ENUM ('patient', 'clinician');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.patient_allergies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  substance TEXT NOT NULL,
  severity public.patient_allergy_severity NOT NULL DEFAULT 'unknown',
  reaction TEXT,
  notes TEXT,
  source public.patient_allergy_source NOT NULL DEFAULT 'clinician',
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  deactivated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deactivation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_allergies_substance_non_empty CHECK (length(trim(substance)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_allergies_active_substance
  ON public.patient_allergies (patient_id, lower(substance))
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_patient_allergies_patient
  ON public.patient_allergies (patient_id, is_active);

CREATE INDEX IF NOT EXISTS idx_patient_allergies_patient_severity
  ON public.patient_allergies (patient_id, severity)
  WHERE is_active;

-- updated_at trigger (reuse existing helper if present, otherwise inline)
CREATE OR REPLACE FUNCTION public._patient_allergies_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patient_allergies_touch_updated_at ON public.patient_allergies;
CREATE TRIGGER patient_allergies_touch_updated_at
  BEFORE UPDATE ON public.patient_allergies
  FOR EACH ROW
  EXECUTE FUNCTION public._patient_allergies_touch_updated_at();

-- =====================================================
-- Helper: clinic staff can access patient allergies when
-- the patient has any appointment at one of their clinics.
-- =====================================================
CREATE OR REPLACE FUNCTION public._clinic_staff_can_access_patient_allergies(
  p_patient_id UUID,
  p_user_id UUID DEFAULT auth.uid()
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
  IF p_user_id IS NULL OR p_patient_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.appointments a
    JOIN public.patients pat ON pat.user_id = a.patient_id
    JOIN public.user_roles ur
      ON ur.clinic_id = a.clinic_id
     AND ur.user_id = p_user_id
     AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    WHERE pat.id = p_patient_id
  )
  INTO v_allowed;

  RETURN v_allowed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._clinic_staff_can_access_patient_allergies(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._clinic_staff_can_access_patient_allergies(UUID, UUID) TO authenticated;

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE public.patient_allergies ENABLE ROW LEVEL SECURITY;

-- Patient: full self-management
DROP POLICY IF EXISTS patient_select_own_allergies ON public.patient_allergies;
CREATE POLICY patient_select_own_allergies
  ON public.patient_allergies FOR SELECT
  USING (
    patient_id IN (
      SELECT p.id FROM public.patients p
      WHERE p.user_id = auth.uid() AND NOT p.is_anonymized
    )
  );

DROP POLICY IF EXISTS patient_insert_own_allergies ON public.patient_allergies;
CREATE POLICY patient_insert_own_allergies
  ON public.patient_allergies FOR INSERT
  WITH CHECK (
    patient_id IN (
      SELECT p.id FROM public.patients p
      WHERE p.user_id = auth.uid() AND NOT p.is_anonymized
    )
    AND source = 'patient'
    AND recorded_by = auth.uid()
  );

DROP POLICY IF EXISTS patient_update_own_allergies ON public.patient_allergies;
CREATE POLICY patient_update_own_allergies
  ON public.patient_allergies FOR UPDATE
  USING (
    patient_id IN (
      SELECT p.id FROM public.patients p
      WHERE p.user_id = auth.uid() AND NOT p.is_anonymized
    )
  )
  WITH CHECK (
    patient_id IN (
      SELECT p.id FROM public.patients p
      WHERE p.user_id = auth.uid() AND NOT p.is_anonymized
    )
  );

-- Clinic staff: read + write for patients connected to their clinic(s)
DROP POLICY IF EXISTS clinic_staff_select_patient_allergies ON public.patient_allergies;
CREATE POLICY clinic_staff_select_patient_allergies
  ON public.patient_allergies FOR SELECT
  USING (public._clinic_staff_can_access_patient_allergies(patient_id, auth.uid()));

DROP POLICY IF EXISTS clinic_staff_insert_patient_allergies ON public.patient_allergies;
CREATE POLICY clinic_staff_insert_patient_allergies
  ON public.patient_allergies FOR INSERT
  WITH CHECK (
    public._clinic_staff_can_access_patient_allergies(patient_id, auth.uid())
    AND recorded_by = auth.uid()
    AND source = 'clinician'
  );

DROP POLICY IF EXISTS clinic_staff_update_patient_allergies ON public.patient_allergies;
CREATE POLICY clinic_staff_update_patient_allergies
  ON public.patient_allergies FOR UPDATE
  USING (public._clinic_staff_can_access_patient_allergies(patient_id, auth.uid()))
  WITH CHECK (public._clinic_staff_can_access_patient_allergies(patient_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.patient_allergies TO authenticated;
