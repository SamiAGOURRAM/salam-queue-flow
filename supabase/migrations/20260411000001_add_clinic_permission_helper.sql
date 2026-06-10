-- =====================================================
-- Server-side permission enforcement helper.
-- =====================================================
-- Until now, `_user_can_manage_clinic` has gated RLS on clinical
-- tables. That function returns true for ANY staff role in the clinic,
-- ignoring the per-role `permissions` object in `clinics.settings`.
-- The UI has always respected those permissions, but the database
-- did not -- meaning a custom role with `manage_medical_records: false`
-- could still write prescriptions via direct SDK calls.
--
-- `_user_has_clinic_permission` mirrors the frontend logic:
--   - clinic_owner / super_admin -> always true
--   - look up the user's role in clinic_staff
--   - look up the role's permission map in clinics.settings.role_definitions
--   - fall back to the hardcoded defaults for system roles
-- =====================================================

-- Defaults matching apps/web/src/lib/clinicRolePermissions.ts
-- Kept inline so the DB is authoritative without requiring application reads.
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
      'view_analytics', false
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
      'view_analytics', false
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public._user_has_clinic_permission(
  p_clinic_id UUID,
  p_user_id UUID,
  p_permission_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner BOOLEAN := false;
  v_is_super_admin BOOLEAN := false;
  v_role_key TEXT;
  v_base_role TEXT;
  v_role_definitions JSONB;
  v_role_entry JSONB;
  v_permissions JSONB;
  v_value BOOLEAN;
BEGIN
  IF p_user_id IS NULL OR p_clinic_id IS NULL OR p_permission_key IS NULL THEN
    RETURN false;
  END IF;

  -- Owner short-circuit
  SELECT EXISTS (
    SELECT 1 FROM public.clinics c
    WHERE c.id = p_clinic_id AND c.owner_id = p_user_id
  ) INTO v_is_owner;

  IF v_is_owner THEN
    RETURN true;
  END IF;

  -- Super admin short-circuit
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.clinic_id = p_clinic_id
      AND ur.role = 'super_admin'
  ) INTO v_is_super_admin;

  IF v_is_super_admin THEN
    RETURN true;
  END IF;

  -- Staff path: look up role, then resolve permissions from clinic settings.
  SELECT LOWER(COALESCE(cs.role, 'staff'))
  INTO v_role_key
  FROM public.clinic_staff cs
  WHERE cs.clinic_id = p_clinic_id
    AND cs.user_id = p_user_id
    AND COALESCE(cs.is_active, true) = true
  LIMIT 1;

  IF v_role_key IS NULL THEN
    RETURN false;
  END IF;

  SELECT c.settings -> 'role_definitions'
  INTO v_role_definitions
  FROM public.clinics c
  WHERE c.id = p_clinic_id;

  v_base_role := CASE WHEN v_role_key = 'doctor' THEN 'doctor' ELSE 'staff' END;

  IF jsonb_typeof(v_role_definitions) = 'array' THEN
    SELECT elem
    INTO v_role_entry
    FROM jsonb_array_elements(v_role_definitions) elem
    WHERE LOWER(COALESCE(elem ->> 'key', elem ->> 'role_key', '')) = v_role_key
    LIMIT 1;

    IF v_role_entry IS NOT NULL THEN
      v_base_role := CASE
        WHEN LOWER(COALESCE(v_role_entry ->> 'base_role', v_role_entry ->> 'baseRole', '')) = 'doctor'
          THEN 'doctor'
        ELSE v_base_role
      END;

      IF jsonb_typeof(v_role_entry -> 'permissions') = 'object' THEN
        v_permissions := v_role_entry -> 'permissions';
      END IF;
    END IF;
  END IF;

  IF v_permissions IS NULL THEN
    v_permissions := public._default_clinic_role_permissions(v_base_role);
  END IF;

  -- Explicit value if present
  IF v_permissions ? p_permission_key THEN
    v_value := (v_permissions ->> p_permission_key)::BOOLEAN;
    IF v_value IS NOT NULL THEN
      RETURN v_value;
    END IF;
  END IF;

  -- Permission missing from custom role -> fall back to base-role default
  v_value := (public._default_clinic_role_permissions(v_base_role) ->> p_permission_key)::BOOLEAN;
  RETURN COALESCE(v_value, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._user_has_clinic_permission(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._user_has_clinic_permission(UUID, UUID, TEXT) TO authenticated;

-- =====================================================
-- Apply the permission helper to medical record RLS.
-- Previously: gated by `_user_can_manage_clinic` (any staff).
-- Now: gated by `view_medical_records` / `manage_medical_records`.
-- =====================================================

-- Diagnoses
DROP POLICY IF EXISTS staff_select_med_diagnoses ON public.medical_record_diagnoses;
CREATE POLICY staff_select_med_diagnoses
  ON public.medical_record_diagnoses FOR SELECT
  USING (public._user_has_clinic_permission(clinic_id, auth.uid(), 'view_medical_records'));

DROP POLICY IF EXISTS staff_insert_med_diagnoses ON public.medical_record_diagnoses;
CREATE POLICY staff_insert_med_diagnoses
  ON public.medical_record_diagnoses FOR INSERT
  WITH CHECK (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records')
    AND diagnosed_by = auth.uid()
  );

DROP POLICY IF EXISTS staff_update_med_diagnoses ON public.medical_record_diagnoses;
CREATE POLICY staff_update_med_diagnoses
  ON public.medical_record_diagnoses FOR UPDATE
  USING (public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records'))
  WITH CHECK (public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records'));

-- Prescriptions
DROP POLICY IF EXISTS staff_select_med_prescriptions ON public.medical_record_prescriptions;
CREATE POLICY staff_select_med_prescriptions
  ON public.medical_record_prescriptions FOR SELECT
  USING (public._user_has_clinic_permission(clinic_id, auth.uid(), 'view_medical_records'));

DROP POLICY IF EXISTS staff_insert_med_prescriptions ON public.medical_record_prescriptions;
CREATE POLICY staff_insert_med_prescriptions
  ON public.medical_record_prescriptions FOR INSERT
  WITH CHECK (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records')
    AND prescribed_by = auth.uid()
  );

DROP POLICY IF EXISTS staff_update_med_prescriptions ON public.medical_record_prescriptions;
CREATE POLICY staff_update_med_prescriptions
  ON public.medical_record_prescriptions FOR UPDATE
  USING (public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records'))
  WITH CHECK (public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records'));

-- Lab results
DROP POLICY IF EXISTS staff_select_med_lab_results ON public.medical_record_lab_results;
CREATE POLICY staff_select_med_lab_results
  ON public.medical_record_lab_results FOR SELECT
  USING (public._user_has_clinic_permission(clinic_id, auth.uid(), 'view_medical_records'));

DROP POLICY IF EXISTS staff_insert_med_lab_results ON public.medical_record_lab_results;
CREATE POLICY staff_insert_med_lab_results
  ON public.medical_record_lab_results FOR INSERT
  WITH CHECK (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records')
    AND recorded_by = auth.uid()
  );

DROP POLICY IF EXISTS staff_update_med_lab_results ON public.medical_record_lab_results;
CREATE POLICY staff_update_med_lab_results
  ON public.medical_record_lab_results FOR UPDATE
  USING (public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records'))
  WITH CHECK (public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records'));

-- Procedure reports
DROP POLICY IF EXISTS staff_select_procedure_reports ON public.medical_procedure_reports;
CREATE POLICY staff_select_procedure_reports
  ON public.medical_procedure_reports FOR SELECT
  USING (public._user_has_clinic_permission(clinic_id, auth.uid(), 'view_medical_records'));

DROP POLICY IF EXISTS staff_insert_procedure_reports ON public.medical_procedure_reports;
CREATE POLICY staff_insert_procedure_reports
  ON public.medical_procedure_reports FOR INSERT
  WITH CHECK (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records')
    AND authored_by = auth.uid()
  );

DROP POLICY IF EXISTS staff_update_procedure_reports ON public.medical_procedure_reports;
CREATE POLICY staff_update_procedure_reports
  ON public.medical_procedure_reports FOR UPDATE
  USING (public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records'))
  WITH CHECK (public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records'));

-- Report images
DROP POLICY IF EXISTS staff_manage_report_images_select ON public.medical_report_images;
CREATE POLICY staff_manage_report_images_select
  ON public.medical_report_images FOR SELECT
  USING (public._user_has_clinic_permission(clinic_id, auth.uid(), 'view_medical_records'));

DROP POLICY IF EXISTS staff_manage_report_images_insert ON public.medical_report_images;
CREATE POLICY staff_manage_report_images_insert
  ON public.medical_report_images FOR INSERT
  WITH CHECK (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records')
    AND uploaded_by = auth.uid()
  );

DROP POLICY IF EXISTS staff_manage_report_images_update ON public.medical_report_images;
CREATE POLICY staff_manage_report_images_update
  ON public.medical_report_images FOR UPDATE
  USING (public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records'))
  WITH CHECK (public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records'));

DROP POLICY IF EXISTS staff_manage_report_images_delete ON public.medical_report_images;
CREATE POLICY staff_manage_report_images_delete
  ON public.medical_report_images FOR DELETE
  USING (public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records'));
