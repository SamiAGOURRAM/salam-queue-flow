-- Allow clinic teammates to view each other's profile rows for team-management UX.
-- This keeps self-view intact and grants same-clinic visibility only when
-- the requester and target both belong to the same clinic team.

DROP POLICY IF EXISTS "Clinic team can view team profiles" ON public.profiles;

CREATE POLICY "Clinic team can view team profiles"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM public.clinic_staff target_staff
      JOIN public.user_roles requester_role
        ON requester_role.clinic_id = target_staff.clinic_id
       AND requester_role.user_id = auth.uid()
       AND requester_role.role IN ('super_admin', 'clinic_owner', 'staff')
      WHERE target_staff.user_id = profiles.id
    )
  );
