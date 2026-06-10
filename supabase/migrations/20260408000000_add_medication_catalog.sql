-- Persistent clinic medication catalog for ordonnance quick-pick and maintenance.

CREATE TABLE IF NOT EXISTS public.medical_medication_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  canonical_name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  usage_count INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT medical_medication_catalog_name_not_blank_chk CHECK (btrim(canonical_name) <> ''),
  CONSTRAINT medical_medication_catalog_key_not_blank_chk CHECK (btrim(name_key) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_medication_catalog_unique_clinic_key
  ON public.medical_medication_catalog(clinic_id, name_key);

CREATE INDEX IF NOT EXISTS idx_medication_catalog_clinic_active
  ON public.medical_medication_catalog(clinic_id, is_active, last_used_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_medication_catalog_aliases
  ON public.medical_medication_catalog USING gin(aliases);

DROP TRIGGER IF EXISTS set_updated_at_medical_medication_catalog ON public.medical_medication_catalog;
CREATE TRIGGER set_updated_at_medical_medication_catalog
  BEFORE UPDATE ON public.medical_medication_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.medical_medication_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_select_medication_catalog ON public.medical_medication_catalog;
CREATE POLICY staff_select_medication_catalog
  ON public.medical_medication_catalog FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_medication_catalog.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

DROP POLICY IF EXISTS staff_insert_medication_catalog ON public.medical_medication_catalog;
CREATE POLICY staff_insert_medication_catalog
  ON public.medical_medication_catalog FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_medication_catalog.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

DROP POLICY IF EXISTS staff_update_medication_catalog ON public.medical_medication_catalog;
CREATE POLICY staff_update_medication_catalog
  ON public.medical_medication_catalog FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_medication_catalog.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_medication_catalog.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

DROP POLICY IF EXISTS staff_delete_medication_catalog ON public.medical_medication_catalog;
CREATE POLICY staff_delete_medication_catalog
  ON public.medical_medication_catalog FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.clinic_id = medical_medication_catalog.clinic_id
        AND ur.role IN ('super_admin', 'clinic_owner', 'staff')
    )
  );

WITH normalized AS (
  SELECT
    p.clinic_id,
    trim(regexp_replace(p.medication_name, '\\s+', ' ', 'g')) AS canonical_name,
    lower(trim(regexp_replace(p.medication_name, '\\s+', ' ', 'g'))) AS name_key,
    COALESCE(p.updated_at, p.created_at) AS used_at
  FROM public.medical_record_prescriptions p
  WHERE p.medication_name IS NOT NULL
    AND btrim(p.medication_name) <> ''
),
ranked AS (
  SELECT
    n.clinic_id,
    n.canonical_name,
    n.name_key,
    n.used_at,
    COUNT(*) OVER (PARTITION BY n.clinic_id, n.name_key) AS usage_count,
    MAX(n.used_at) OVER (PARTITION BY n.clinic_id, n.name_key) AS last_used_at,
    ROW_NUMBER() OVER (
      PARTITION BY n.clinic_id, n.name_key
      ORDER BY n.used_at DESC, n.canonical_name DESC
    ) AS rn
  FROM normalized n
)
INSERT INTO public.medical_medication_catalog (
  clinic_id,
  canonical_name,
  name_key,
  aliases,
  usage_count,
  last_used_at,
  is_active,
  created_at,
  updated_at
)
SELECT
  r.clinic_id,
  r.canonical_name,
  r.name_key,
  ARRAY[]::TEXT[],
  r.usage_count,
  r.last_used_at,
  true,
  COALESCE(r.last_used_at, NOW()),
  COALESCE(r.last_used_at, NOW())
FROM ranked r
WHERE r.rn = 1
ON CONFLICT (clinic_id, name_key) DO UPDATE
SET
  canonical_name = EXCLUDED.canonical_name,
  usage_count = GREATEST(public.medical_medication_catalog.usage_count, EXCLUDED.usage_count),
  last_used_at = GREATEST(public.medical_medication_catalog.last_used_at, EXCLUDED.last_used_at),
  updated_at = NOW();
