-- Public / patient booking flow cannot see clinic staff because the existing
-- SELECT policy ("Staff can view own clinic staff") requires a user_roles entry
-- with a matching clinic_id, which patients and anon users don't have.
--
-- Mirror the "Anyone can view active clinics" pattern used on public.clinics:
-- allow SELECT on active staff rows.  The existing staff policy remains in
-- place so staff users can still see inactive staff at their own clinic too.

DROP POLICY IF EXISTS anyone_can_view_active_clinic_staff ON public.clinic_staff;

CREATE POLICY anyone_can_view_active_clinic_staff
  ON public.clinic_staff
  FOR SELECT
  USING (is_active = true);

COMMENT ON POLICY anyone_can_view_active_clinic_staff ON public.clinic_staff
  IS 'Enables patient-facing booking flow to list available doctors. Mirrors the clinics is_active policy.';
