-- Patient booking flow needs to display doctor names, but the existing
-- "Clinic team can view team profiles" policy only grants SELECT to users
-- whose user_roles entry is clinic_owner / staff / super_admin.
--
-- Anyone viewing an active clinic (already public) should be able to see
-- profile information (full_name, etc.) of that clinic's active staff.
-- Mirror the "active" pattern used by clinics and clinic_staff policies.

DROP POLICY IF EXISTS anyone_can_view_active_staff_profiles ON public.profiles;

CREATE POLICY anyone_can_view_active_staff_profiles
  ON public.profiles
  FOR SELECT
  USING (
    id IN (
      SELECT cs.user_id
      FROM public.clinic_staff cs
      WHERE cs.is_active = true
    )
  );

COMMENT ON POLICY anyone_can_view_active_staff_profiles ON public.profiles
  IS 'Enables patient-facing booking flow to display doctor names.';
