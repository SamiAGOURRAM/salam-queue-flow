-- Fix RLS permissions for clinic owners and staff
-- Allows proper access to appointments and queue data

-- Drop ALL existing appointment policies
DROP POLICY IF EXISTS "Patients can view own appointments" ON appointments;
DROP POLICY IF EXISTS "Staff can view clinic appointments" ON appointments;
DROP POLICY IF EXISTS "Patients can create own appointments" ON appointments;
DROP POLICY IF EXISTS "Staff can create appointments" ON appointments;
DROP POLICY IF EXISTS "Staff can update clinic appointments" ON appointments;
DROP POLICY IF EXISTS "Clinic owners can view their clinic appointments" ON appointments;
DROP POLICY IF EXISTS "Staff can view their clinic appointments" ON appointments;
DROP POLICY IF EXISTS "Clinic owners can create appointments" ON appointments;
DROP POLICY IF EXISTS "Clinic owners can update appointments" ON appointments;
DROP POLICY IF EXISTS "Staff can update appointments" ON appointments;

-- Recreate with better logic that works for both owners and staff
CREATE POLICY "Patients can view own appointments" ON appointments FOR SELECT 
  USING (auth.uid() = patient_id);

CREATE POLICY "Clinic owners can view their clinic appointments" ON appointments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.clinics
    WHERE id = appointments.clinic_id 
      AND owner_id = auth.uid()
  ));

CREATE POLICY "Staff can view their clinic appointments" ON appointments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.clinic_staff
    WHERE user_id = auth.uid()
      AND clinic_id = appointments.clinic_id
      AND is_active = true
  ));

CREATE POLICY "Patients can create own appointments" ON appointments FOR INSERT
  WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "Clinic owners can create appointments" ON appointments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clinics
    WHERE id = appointments.clinic_id 
      AND owner_id = auth.uid()
  ));

CREATE POLICY "Staff can create appointments" ON appointments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clinic_staff
    WHERE user_id = auth.uid()
      AND clinic_id = appointments.clinic_id
      AND is_active = true
  ));

CREATE POLICY "Clinic owners can update appointments" ON appointments FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.clinics
    WHERE id = appointments.clinic_id 
      AND owner_id = auth.uid()
  ));

CREATE POLICY "Staff can update appointments" ON appointments FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.clinic_staff
    WHERE user_id = auth.uid()
      AND clinic_id = appointments.clinic_id
      AND is_active = true
  ));

-- Also fix clinic_staff policies if needed
DROP POLICY IF EXISTS "Staff can view clinic info" ON clinic_staff;
DROP POLICY IF EXISTS "Owners can manage clinic staff" ON clinic_staff;
DROP POLICY IF EXISTS "Staff can view own clinic info" ON clinic_staff;
DROP POLICY IF EXISTS "Clinic owners can view their staff" ON clinic_staff;
DROP POLICY IF EXISTS "Clinic owners can manage staff" ON clinic_staff;

CREATE POLICY "Staff can view own clinic info" ON clinic_staff FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Clinic owners can view their staff" ON clinic_staff FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.clinics
    WHERE id = clinic_staff.clinic_id 
      AND owner_id = auth.uid()
  ));

CREATE POLICY "Clinic owners can manage staff" ON clinic_staff FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.clinics
    WHERE id = clinic_staff.clinic_id 
      AND owner_id = auth.uid()
  ));

-- Success
DO $$
BEGIN
  RAISE NOTICE 'RLS permissions fixed successfully. Clinic owners and staff can now access appointments.';
END $$;
