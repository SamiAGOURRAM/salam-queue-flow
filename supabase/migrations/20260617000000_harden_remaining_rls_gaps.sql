-- =====================================================
-- Gap #17 (final): Harden remaining RLS policies to use
-- granular _user_has_clinic_permission instead of broad
-- user_roles.role checks.
--
-- Tables fixed:
--   appointments        — SELECT (was: role IN ('clinic_owner','staff'))
--   medical_medication_catalog — all 4 CRUD (was: role IN ('super_admin','clinic_owner','staff'))
--   clinic_resources    — all 4 CRUD (was: role IN ('super_admin','clinic_owner','staff'))
--   waitlist            — SELECT + ALL (was: clinic_staff lookup by user_id)
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. appointments — Staff SELECT
--    Previously: user_roles.role IN ('clinic_owner', 'staff')
--    Now:       granular permission checks matching all
--               frontend routes that read appointments
-- ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Staff can view clinic appointments" ON public.appointments;
CREATE POLICY "Staff can view clinic appointments"
  ON public.appointments FOR SELECT
  USING (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_queue')
    OR public._user_has_clinic_permission(clinic_id, auth.uid(), 'view_queue')
    OR public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_calendar')
    OR public._user_has_clinic_permission(clinic_id, auth.uid(), 'view_calendar')
    OR public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_appointments')
    OR public._user_has_clinic_permission(clinic_id, auth.uid(), 'view_dashboard')
    OR public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_dashboard')
    OR public._user_has_clinic_permission(clinic_id, auth.uid(), 'view_analytics')
    OR public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records')
    OR public._user_has_clinic_permission(clinic_id, auth.uid(), 'view_medical_records')
  );

-- ─────────────────────────────────────────────────────
-- 2. medical_medication_catalog — all 4 CRUD
--    Previously: user_roles.role IN ('super_admin','clinic_owner','staff')
--    Now:       manage_medical_records / view_medical_records
-- ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "staff_select_medication_catalog" ON public.medical_medication_catalog;
CREATE POLICY "staff_select_medication_catalog"
  ON public.medical_medication_catalog FOR SELECT
  USING (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records')
    OR public._user_has_clinic_permission(clinic_id, auth.uid(), 'view_medical_records')
  );

DROP POLICY IF EXISTS "staff_insert_medication_catalog" ON public.medical_medication_catalog;
CREATE POLICY "staff_insert_medication_catalog"
  ON public.medical_medication_catalog FOR INSERT
  WITH CHECK (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records')
  );

DROP POLICY IF EXISTS "staff_update_medication_catalog" ON public.medical_medication_catalog;
CREATE POLICY "staff_update_medication_catalog"
  ON public.medical_medication_catalog FOR UPDATE
  USING (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records')
  )
  WITH CHECK (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records')
  );

DROP POLICY IF EXISTS "staff_delete_medication_catalog" ON public.medical_medication_catalog;
CREATE POLICY "staff_delete_medication_catalog"
  ON public.medical_medication_catalog FOR DELETE
  USING (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_medical_records')
  );

-- ─────────────────────────────────────────────────────
-- 3. clinic_resources — all 4 CRUD
--    Previously: user_roles.role IN ('super_admin','clinic_owner','staff')
--    Now:       view_clinic_settings / manage_clinic_settings
-- ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "clinic_resources_select_staff" ON public.clinic_resources;
CREATE POLICY "clinic_resources_select_staff"
  ON public.clinic_resources FOR SELECT
  USING (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'view_clinic_settings')
    OR public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_clinic_settings')
  );

DROP POLICY IF EXISTS "clinic_resources_insert_staff" ON public.clinic_resources;
CREATE POLICY "clinic_resources_insert_staff"
  ON public.clinic_resources FOR INSERT
  WITH CHECK (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_clinic_settings')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "clinic_resources_update_staff" ON public.clinic_resources;
CREATE POLICY "clinic_resources_update_staff"
  ON public.clinic_resources FOR UPDATE
  USING (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_clinic_settings')
  )
  WITH CHECK (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_clinic_settings')
  );

DROP POLICY IF EXISTS "clinic_resources_delete_staff" ON public.clinic_resources;
CREATE POLICY "clinic_resources_delete_staff"
  ON public.clinic_resources FOR DELETE
  USING (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_clinic_settings')
  );

-- ─────────────────────────────────────────────────────
-- 4. waitlist — SELECT + ALL
--    Previously: clinic_staff.user_id = auth.uid() (any staff)
--    Now:       manage_queue / view_queue
-- ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Clinic staff can manage waitlist" ON public.waitlist;
CREATE POLICY "Clinic staff can manage waitlist"
  ON public.waitlist FOR ALL
  USING (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_queue')
  )
  WITH CHECK (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_queue')
  );

DROP POLICY IF EXISTS "Clinic staff can view waitlist" ON public.waitlist;
CREATE POLICY "Clinic staff can view waitlist"
  ON public.waitlist FOR SELECT
  USING (
    public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_queue')
    OR public._user_has_clinic_permission(clinic_id, auth.uid(), 'view_queue')
  );
