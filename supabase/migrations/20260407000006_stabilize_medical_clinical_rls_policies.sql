-- Replace staff policy predicates on medical clinical tables with inline EXISTS checks.
-- This preserves access semantics while avoiding helper-function evaluation issues
-- observed under authenticated inserts on local PG17.

-- Diagnoses
DROP POLICY IF EXISTS staff_select_med_diagnoses ON public.medical_record_diagnoses;
CREATE POLICY staff_select_med_diagnoses
  ON public.medical_record_diagnoses FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_record_diagnoses.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

DROP POLICY IF EXISTS staff_insert_med_diagnoses ON public.medical_record_diagnoses;
CREATE POLICY staff_insert_med_diagnoses
  ON public.medical_record_diagnoses FOR INSERT
  WITH CHECK (
    diagnosed_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_record_diagnoses.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

DROP POLICY IF EXISTS staff_update_med_diagnoses ON public.medical_record_diagnoses;
CREATE POLICY staff_update_med_diagnoses
  ON public.medical_record_diagnoses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_record_diagnoses.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_record_diagnoses.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );


-- Prescriptions
DROP POLICY IF EXISTS staff_select_med_prescriptions ON public.medical_record_prescriptions;
CREATE POLICY staff_select_med_prescriptions
  ON public.medical_record_prescriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_record_prescriptions.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

DROP POLICY IF EXISTS staff_insert_med_prescriptions ON public.medical_record_prescriptions;
CREATE POLICY staff_insert_med_prescriptions
  ON public.medical_record_prescriptions FOR INSERT
  WITH CHECK (
    prescribed_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_record_prescriptions.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

DROP POLICY IF EXISTS staff_update_med_prescriptions ON public.medical_record_prescriptions;
CREATE POLICY staff_update_med_prescriptions
  ON public.medical_record_prescriptions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_record_prescriptions.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_record_prescriptions.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );


-- Lab results
DROP POLICY IF EXISTS staff_select_med_lab_results ON public.medical_record_lab_results;
CREATE POLICY staff_select_med_lab_results
  ON public.medical_record_lab_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_record_lab_results.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

DROP POLICY IF EXISTS staff_insert_med_lab_results ON public.medical_record_lab_results;
CREATE POLICY staff_insert_med_lab_results
  ON public.medical_record_lab_results FOR INSERT
  WITH CHECK (
    recorded_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_record_lab_results.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

DROP POLICY IF EXISTS staff_update_med_lab_results ON public.medical_record_lab_results;
CREATE POLICY staff_update_med_lab_results
  ON public.medical_record_lab_results FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_record_lab_results.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_record_lab_results.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );
