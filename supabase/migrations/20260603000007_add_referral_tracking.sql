-- =====================================================
-- Gap #16: Referral tracking model.
-- Adds patient referral schema, RLS, and permission hooks.
-- =====================================================

-- 1. Referral status enum
DO $$ BEGIN
  CREATE TYPE public.referral_status AS ENUM (
    'pending',
    'accepted',
    'declined',
    'completed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Patient referrals table
CREATE TABLE IF NOT EXISTS public.patient_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  source_staff_id UUID NOT NULL REFERENCES public.clinic_staff(id) ON DELETE CASCADE,
  target_doctor_name TEXT NOT NULL,
  target_specialty TEXT,
  target_clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  target_clinic_name TEXT,
  reason TEXT NOT NULL,
  notes TEXT,
  status public.referral_status NOT NULL DEFAULT 'pending',
  linked_appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  response_notes TEXT,
  responded_at TIMESTAMPTZ,
  responded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_referrals_reason_non_empty CHECK (length(trim(reason)) > 0),
  CONSTRAINT patient_referrals_target_name_non_empty CHECK (length(trim(target_doctor_name)) > 0)
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_patient_referrals_patient
  ON public.patient_referrals(patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_referrals_clinic
  ON public.patient_referrals(clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_referrals_source_staff
  ON public.patient_referrals(source_staff_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_referrals_status
  ON public.patient_referrals(status);

-- 4. Updated-at trigger
CREATE OR REPLACE FUNCTION public._update_patient_referrals_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patient_referrals_updated_at ON public.patient_referrals;
CREATE TRIGGER trg_patient_referrals_updated_at
  BEFORE UPDATE ON public.patient_referrals
  FOR EACH ROW
  EXECUTE FUNCTION public._update_patient_referrals_timestamp();

-- 5. RLS
ALTER TABLE public.patient_referrals ENABLE ROW LEVEL SECURITY;

-- Doctors with view_referrals can see referrals for their patients
DROP POLICY IF EXISTS referral_select_staff ON public.patient_referrals;
CREATE POLICY referral_select_staff
  ON public.patient_referrals FOR SELECT
  USING (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'view_referrals')
  );

-- Doctors with manage_referrals can create referrals
DROP POLICY IF EXISTS referral_insert_staff ON public.patient_referrals;
CREATE POLICY referral_insert_staff
  ON public.patient_referrals FOR INSERT
  WITH CHECK (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_referrals')
  );

-- Doctors with manage_referrals can update (respond to) referrals
DROP POLICY IF EXISTS referral_update_staff ON public.patient_referrals;
CREATE POLICY referral_update_staff
  ON public.patient_referrals FOR UPDATE
  USING (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_referrals')
  )
  WITH CHECK (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_referrals')
  );

-- 6. Update default permissions to include referral permissions
-- This replaces the function with new permission keys
CREATE OR REPLACE FUNCTION public._default_clinic_role_permissions(
  p_base_role TEXT
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_base_role = 'doctor' THEN jsonb_build_object(
      'view_dashboard', true,
      'manage_dashboard', false,
      'view_queue', true,
      'manage_queue', true,
      'view_calendar', true,
      'manage_calendar', true,
      'manage_appointments', true,
      'view_patients', true,
      'view_team', true,
      'manage_team', false,
      'view_clinic_settings', true,
      'manage_clinic_settings', false,
      'manage_roles', false,
      'view_medical_records', true,
      'manage_medical_records', true,
      'view_analytics', false,
      'view_billing', false,
      'manage_billing', false,
      'view_referrals', true,
      'manage_referrals', true
    )
    ELSE jsonb_build_object(
      'view_dashboard', true,
      'manage_dashboard', false,
      'view_queue', true,
      'manage_queue', true,
      'view_calendar', true,
      'manage_calendar', true,
      'manage_appointments', true,
      'view_patients', true,
      'view_team', true,
      'manage_team', false,
      'view_clinic_settings', false,
      'manage_clinic_settings', false,
      'manage_roles', false,
      'view_medical_records', false,
      'manage_medical_records', false,
      'view_analytics', false,
      'view_billing', false,
      'manage_billing', false,
      'view_referrals', false,
      'manage_referrals', false
    )
  END;
$$;

-- 7. Helper RPC: create referral
CREATE OR REPLACE FUNCTION public.create_patient_referral(
  p_patient_id UUID,
  p_clinic_id UUID,
  p_source_staff_id UUID,
  p_target_doctor_name TEXT,
  p_reason TEXT,
  p_target_specialty TEXT DEFAULT NULL,
  p_target_clinic_id UUID DEFAULT NULL,
  p_target_clinic_name TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_linked_appointment_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral_id UUID;
BEGIN
  -- Auth check
  IF NOT public._user_has_clinic_permission(p_clinic_id, auth.uid(), 'manage_referrals') THEN
    RAISE EXCEPTION 'Permission denied: manage_referrals required'
      USING HINT = 'check_permission';
  END IF;

  -- Validate source staff belongs to the calling user
  IF NOT EXISTS (
    SELECT 1 FROM public.clinic_staff cs
    WHERE cs.id = p_source_staff_id
      AND cs.user_id = auth.uid()
      AND cs.is_active = true
  ) THEN
    RAISE EXCEPTION 'Source staff must belong to the authenticated user'
      USING HINT = 'staff_mismatch';
  END IF;

  -- Validate patient has at least one appointment at this clinic
  IF NOT EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.patient_id = p_patient_id AND a.clinic_id = p_clinic_id
  ) THEN
    RAISE EXCEPTION 'Patient has no appointments at this clinic'
      USING HINT = 'patient_clinic_mismatch';
  END IF;

  INSERT INTO public.patient_referrals (
    patient_id, clinic_id, source_staff_id,
    target_doctor_name, target_specialty,
    target_clinic_id, target_clinic_name,
    reason, notes, linked_appointment_id
  ) VALUES (
    p_patient_id, p_clinic_id, p_source_staff_id,
    p_target_doctor_name, p_target_specialty,
    p_target_clinic_id, p_target_clinic_name,
    p_reason, p_notes, p_linked_appointment_id
  )
  RETURNING id INTO v_referral_id;

  RETURN v_referral_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_patient_referral(UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_patient_referral(UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, UUID) TO authenticated;

-- 8. Helper RPC: respond to referral (accept/decline)
CREATE OR REPLACE FUNCTION public.respond_to_referral(
  p_referral_id UUID,
  p_new_status public.referral_status,
  p_response_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id UUID;
  v_current_status public.referral_status;
BEGIN
  -- Only accept or decline are valid response transitions
  IF p_new_status NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'Response status must be accepted or declined'
      USING HINT = 'invalid_status';
  END IF;

  SELECT clinic_id, status INTO v_clinic_id, v_current_status
  FROM public.patient_referrals
  WHERE id = p_referral_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referral not found';
  END IF;

  -- Only pending referrals can be responded to
  IF v_current_status != 'pending' THEN
    RAISE EXCEPTION 'Can only respond to pending referrals'
      USING HINT = 'not_pending';
  END IF;

  -- Auth check on the clinic where referral was made
  IF NOT public._user_has_clinic_permission(v_clinic_id, auth.uid(), 'manage_referrals') THEN
    RAISE EXCEPTION 'Permission denied: manage_referrals required'
      USING HINT = 'check_permission';
  END IF;

  UPDATE public.patient_referrals
  SET
    status = p_new_status,
    response_notes = COALESCE(p_response_notes, response_notes),
    responded_at = NOW(),
    responded_by = auth.uid()
  WHERE id = p_referral_id;

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.respond_to_referral(UUID, public.referral_status, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_referral(UUID, public.referral_status, TEXT) TO authenticated;

-- 9. Helper RPC: cancel referral
CREATE OR REPLACE FUNCTION public.cancel_referral(
  p_referral_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id UUID;
  v_source_staff_id UUID;
  v_current_status public.referral_status;
BEGIN
  SELECT clinic_id, source_staff_id, status
  INTO v_clinic_id, v_source_staff_id, v_current_status
  FROM public.patient_referrals
  WHERE id = p_referral_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referral not found';
  END IF;

  -- Only pending referrals can be cancelled
  IF v_current_status != 'pending' THEN
    RAISE EXCEPTION 'Can only cancel pending referrals'
      USING HINT = 'not_pending';
  END IF;

  -- Auth: must have manage_referrals AND be the source or clinic owner
  IF NOT (
    public._user_has_clinic_permission(v_clinic_id, auth.uid(), 'manage_referrals')
    AND (
      EXISTS (SELECT 1 FROM public.clinic_staff cs WHERE cs.id = v_source_staff_id AND cs.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = v_clinic_id AND c.owner_id = auth.uid())
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to cancel this referral'
      USING HINT = 'auth_denied';
  END IF;

  UPDATE public.patient_referrals
  SET
    status = 'cancelled',
    responded_at = NOW(),
    responded_by = auth.uid()
  WHERE id = p_referral_id;

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_referral(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_referral(UUID) TO authenticated;

-- 10. Helper RPC: get referrals for a patient (with staff info)
CREATE OR REPLACE FUNCTION public.get_patient_referrals(
  p_patient_id UUID,
  p_clinic_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public._user_has_clinic_permission(p_clinic_id, auth.uid(), 'view_referrals') THEN
    RAISE EXCEPTION 'Permission denied: view_referrals required'
      USING HINT = 'check_permission';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'patientId', r.patient_id,
      'clinicId', r.clinic_id,
      'sourceStaffId', r.source_staff_id,
      'sourceDoctorName', COALESCE(pf.full_name, 'Unknown'),
      'targetDoctorName', r.target_doctor_name,
      'targetSpecialty', r.target_specialty,
      'targetClinicId', r.target_clinic_id,
      'targetClinicName', COALESCE(r.target_clinic_name, tc.name),
      'reason', r.reason,
      'notes', r.notes,
      'status', r.status,
      'linkedAppointmentId', r.linked_appointment_id,
      'responseNotes', r.response_notes,
      'respondedAt', r.responded_at,
      'createdAt', r.created_at,
      'updatedAt', r.updated_at
    )
    ORDER BY r.created_at DESC
  )
  INTO v_result
  FROM public.patient_referrals r
  LEFT JOIN public.clinic_staff cs ON cs.id = r.source_staff_id
  LEFT JOIN public.profiles pf ON pf.id = cs.user_id
  LEFT JOIN public.clinics tc ON tc.id = r.target_clinic_id
  WHERE r.patient_id = p_patient_id
    AND r.clinic_id = p_clinic_id;

  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_patient_referrals(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_patient_referrals(UUID, UUID) TO authenticated;
