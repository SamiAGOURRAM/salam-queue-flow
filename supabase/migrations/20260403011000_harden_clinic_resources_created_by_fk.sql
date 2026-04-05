-- P1 hardening: enforce creator FK and preserve canonical resource type values.

UPDATE public.clinic_resources
SET resource_type = 'other'
WHERE resource_type IS NULL
   OR resource_type NOT IN ('room', 'equipment', 'station', 'other');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.clinic_resources'::regclass
      AND conname = 'clinic_resources_resource_type_valid'
  ) THEN
    ALTER TABLE public.clinic_resources
      ADD CONSTRAINT clinic_resources_resource_type_valid
      CHECK (resource_type IN ('room', 'equipment', 'station', 'other'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.clinic_resources'::regclass
      AND conname = 'clinic_resources_created_by_fkey'
  ) THEN
    ALTER TABLE public.clinic_resources
      ADD CONSTRAINT clinic_resources_created_by_fkey
      FOREIGN KEY (created_by)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_clinic_resources_created_by
  ON public.clinic_resources (created_by);
