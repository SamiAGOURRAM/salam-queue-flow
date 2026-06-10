-- Rich medical report editor foundation:
-- templates, procedure reports, report images, and storage bucket/policies.

CREATE TABLE IF NOT EXISTS public.medical_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,

  scope TEXT NOT NULL DEFAULT 'personal'
    CHECK (scope IN ('system', 'clinic', 'personal')),

  template_type TEXT NOT NULL
    CHECK (template_type IN ('procedure_report', 'consultation_note', 'prescription_combo', 'report_section')),
  specialty TEXT,

  title TEXT NOT NULL,
  title_ar TEXT,
  description TEXT,
  content JSONB NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',

  usage_count INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT medical_templates_scope_integrity_chk CHECK (
    (scope = 'system' AND clinic_id IS NULL)
    OR (scope = 'personal' AND clinic_id IS NULL AND created_by IS NOT NULL)
    OR (scope = 'clinic' AND clinic_id IS NOT NULL AND created_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_medical_templates_type_specialty
  ON public.medical_templates(template_type, specialty);

CREATE INDEX IF NOT EXISTS idx_medical_templates_search
  ON public.medical_templates USING gin(
    (
      to_tsvector('french'::regconfig, coalesce(title, ''))
      || array_to_tsvector(coalesce(tags, ARRAY[]::text[]))
    )
  );

CREATE INDEX IF NOT EXISTS idx_medical_templates_creator
  ON public.medical_templates(created_by)
  WHERE scope = 'personal';

CREATE INDEX IF NOT EXISTS idx_medical_templates_clinic
  ON public.medical_templates(clinic_id)
  WHERE scope = 'clinic';

CREATE INDEX IF NOT EXISTS idx_medical_templates_usage
  ON public.medical_templates(template_type, usage_count DESC);

DROP TRIGGER IF EXISTS set_updated_at_medical_templates ON public.medical_templates;
CREATE TRIGGER set_updated_at_medical_templates
  BEFORE UPDATE ON public.medical_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE IF NOT EXISTS public.medical_procedure_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  authored_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  title TEXT NOT NULL,
  content JSONB NOT NULL,
  content_plain_text TEXT,

  template_id UUID REFERENCES public.medical_templates(id) ON DELETE SET NULL,

  is_patient_visible BOOLEAN NOT NULL DEFAULT true,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'finalized')),
  finalized_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medical_procedure_reports_appointment
  ON public.medical_procedure_reports(appointment_id);

CREATE INDEX IF NOT EXISTS idx_medical_procedure_reports_patient
  ON public.medical_procedure_reports(patient_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at_medical_procedure_reports ON public.medical_procedure_reports;
CREATE TRIGGER set_updated_at_medical_procedure_reports
  BEFORE UPDATE ON public.medical_procedure_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE IF NOT EXISTS public.medical_report_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  report_id UUID NOT NULL REFERENCES public.medical_procedure_reports(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,

  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INT NOT NULL,
  mime_type TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medical_report_images_report
  ON public.medical_report_images(report_id);


ALTER TABLE public.medical_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_procedure_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_report_images ENABLE ROW LEVEL SECURITY;

-- Templates
DROP POLICY IF EXISTS users_view_own_templates ON public.medical_templates;
CREATE POLICY users_view_own_templates
  ON public.medical_templates FOR SELECT
  USING (scope = 'personal' AND created_by = auth.uid());

DROP POLICY IF EXISTS staff_view_clinic_templates ON public.medical_templates;
CREATE POLICY staff_view_clinic_templates
  ON public.medical_templates FOR SELECT
  USING (
    scope = 'clinic'
    AND clinic_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_templates.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

DROP POLICY IF EXISTS users_view_system_templates ON public.medical_templates;
CREATE POLICY users_view_system_templates
  ON public.medical_templates FOR SELECT
  USING (scope = 'system' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS users_insert_own_templates ON public.medical_templates;
CREATE POLICY users_insert_own_templates
  ON public.medical_templates FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND scope IN ('personal', 'clinic')
    AND (
      scope = 'personal'
      OR (
        scope = 'clinic'
        AND clinic_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.clinic_id = medical_templates.clinic_id
            AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
        )
      )
    )
  );

DROP POLICY IF EXISTS users_update_own_templates ON public.medical_templates;
CREATE POLICY users_update_own_templates
  ON public.medical_templates FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS users_delete_own_templates ON public.medical_templates;
CREATE POLICY users_delete_own_templates
  ON public.medical_templates FOR DELETE
  USING (created_by = auth.uid());

-- Procedure reports
DROP POLICY IF EXISTS staff_select_procedure_reports ON public.medical_procedure_reports;
CREATE POLICY staff_select_procedure_reports
  ON public.medical_procedure_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_procedure_reports.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

DROP POLICY IF EXISTS patient_select_visible_reports ON public.medical_procedure_reports;
CREATE POLICY patient_select_visible_reports
  ON public.medical_procedure_reports FOR SELECT
  USING (
    is_patient_visible
    AND patient_id IN (
      SELECT p.id
      FROM public.patients p
      WHERE p.user_id = auth.uid()
        AND NOT p.is_anonymized
    )
  );

DROP POLICY IF EXISTS staff_insert_procedure_reports ON public.medical_procedure_reports;
CREATE POLICY staff_insert_procedure_reports
  ON public.medical_procedure_reports FOR INSERT
  WITH CHECK (
    authored_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_procedure_reports.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

DROP POLICY IF EXISTS staff_update_procedure_reports ON public.medical_procedure_reports;
CREATE POLICY staff_update_procedure_reports
  ON public.medical_procedure_reports FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_procedure_reports.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_procedure_reports.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

-- Report images
DROP POLICY IF EXISTS staff_manage_report_images_select ON public.medical_report_images;
CREATE POLICY staff_manage_report_images_select
  ON public.medical_report_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_report_images.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

DROP POLICY IF EXISTS staff_manage_report_images_insert ON public.medical_report_images;
CREATE POLICY staff_manage_report_images_insert
  ON public.medical_report_images FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_report_images.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

DROP POLICY IF EXISTS staff_manage_report_images_update ON public.medical_report_images;
CREATE POLICY staff_manage_report_images_update
  ON public.medical_report_images FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_report_images.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_report_images.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

DROP POLICY IF EXISTS staff_manage_report_images_delete ON public.medical_report_images;
CREATE POLICY staff_manage_report_images_delete
  ON public.medical_report_images FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_report_images.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );


INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'medical-report-images',
  'medical-report-images',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS clinic_staff_upload_images ON storage.objects;
CREATE POLICY clinic_staff_upload_images
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'medical-report-images'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id::text = split_part(name, '/', 1)
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

DROP POLICY IF EXISTS clinic_staff_read_images ON storage.objects;
CREATE POLICY clinic_staff_read_images
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'medical-report-images'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id::text = split_part(name, '/', 1)
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

DROP POLICY IF EXISTS clinic_staff_delete_images ON storage.objects;
CREATE POLICY clinic_staff_delete_images
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'medical-report-images'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id::text = split_part(name, '/', 1)
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

-- Seed a minimal set of system templates.
INSERT INTO public.medical_templates (
  scope,
  template_type,
  specialty,
  title,
  description,
  content,
  tags,
  is_active
)
VALUES
  (
    'system',
    'procedure_report',
    'generaliste',
    'Infiltration articulaire standard',
    'Compte-rendu type pour infiltration avec variables patient/date.',
    '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Compte-rendu d''infiltration"}]},{"type":"paragraph","content":[{"type":"text","text":"Patient: {{patient_name}}"}]},{"type":"paragraph","content":[{"type":"text","text":"Date: {{date}}"}]},{"type":"paragraph","content":[{"type":"text","text":"Indication: "}]},{"type":"paragraph","content":[{"type":"text","text":"Technique: "}]},{"type":"paragraph","content":[{"type":"text","text":"Tolérance: "}]}]}'::jsonb,
    ARRAY['orthopedie', 'infiltration'],
    true
  ),
  (
    'system',
    'consultation_note',
    'generaliste',
    'Examen clinique standard',
    'Structure type pour consultation generale.',
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Motif: "}]},{"type":"paragraph","content":[{"type":"text","text":"ATCD: "}]},{"type":"paragraph","content":[{"type":"text","text":"Examen clinique: "}]},{"type":"paragraph","content":[{"type":"text","text":"Conduite a tenir: "}]}]}'::jsonb,
    ARRAY['generaliste', 'consultation'],
    true
  ),
  (
    'system',
    'prescription_combo',
    'generaliste',
    'Post-op douleur standard',
    'Combo antalgique post-operatoire',
    '[{"medicationName":"Paracetamol","dosage":"1 g","route":"orale","frequency":"3 fois/jour","durationDays":5,"instructions":"Apres repas","isPatientVisible":true},{"medicationName":"Tramadol","dosage":"50 mg","route":"orale","frequency":"Si douleur","durationDays":3,"instructions":"Maximum 3 prises/jour","isPatientVisible":true},{"medicationName":"Omeprazole","dosage":"20 mg","route":"orale","frequency":"1 fois/jour","durationDays":7,"instructions":"Le matin a jeun","isPatientVisible":true}]'::jsonb,
    ARRAY['post-op', 'douleur'],
    true
  )
ON CONFLICT DO NOTHING;
