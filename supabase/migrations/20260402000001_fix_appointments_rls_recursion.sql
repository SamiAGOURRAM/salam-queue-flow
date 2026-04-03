-- Resolve policy recursion between public.patients and public.appointments.
-- Uses a SECURITY DEFINER helper for ownership checks inside appointments policies.

CREATE OR REPLACE FUNCTION public._appointment_belongs_to_auth_user(
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

DROP POLICY IF EXISTS "Patients can view own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Patients can create appointments" ON public.appointments;
DROP POLICY IF EXISTS "Patients can update own appointments" ON public.appointments;

CREATE POLICY "Patients can view own appointments"
  ON public.appointments FOR SELECT
  USING (public._appointment_belongs_to_auth_user(patient_id));

CREATE POLICY "Patients can create appointments"
  ON public.appointments FOR INSERT
  WITH CHECK (public._appointment_belongs_to_auth_user(patient_id));

CREATE POLICY "Patients can update own appointments"
  ON public.appointments FOR UPDATE
  USING (public._appointment_belongs_to_auth_user(patient_id));

GRANT EXECUTE ON FUNCTION public._appointment_belongs_to_auth_user(UUID, UUID) TO authenticated;
