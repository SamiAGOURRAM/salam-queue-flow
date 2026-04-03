-- Fix appointments RLS policies after patient_id switched to public.patients(id)
-- Ensures authenticated patients can read/update their own appointments by user linkage.

DROP POLICY IF EXISTS "Patients can view own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Patients can create appointments" ON public.appointments;
DROP POLICY IF EXISTS "Patients can update own appointments" ON public.appointments;

CREATE POLICY "Patients can view own appointments"
  ON public.appointments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_id
        AND p.user_id = auth.uid()
        AND NOT p.is_anonymized
    )
  );

CREATE POLICY "Patients can create appointments"
  ON public.appointments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_id
        AND p.user_id = auth.uid()
        AND NOT p.is_anonymized
    )
  );

CREATE POLICY "Patients can update own appointments"
  ON public.appointments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_id
        AND p.user_id = auth.uid()
        AND NOT p.is_anonymized
    )
  );
