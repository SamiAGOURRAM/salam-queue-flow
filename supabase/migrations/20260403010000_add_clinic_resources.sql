-- P1 Clinic resources foundation.
-- Adds a clinic-scoped resource registry (rooms/equipment) for scheduling operations.

CREATE TABLE IF NOT EXISTS public.clinic_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT 'room',
  capacity INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT clinic_resources_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT clinic_resources_capacity_positive CHECK (capacity > 0),
  CONSTRAINT clinic_resources_resource_type_valid CHECK (resource_type IN ('room', 'equipment', 'station', 'other'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_resources_unique_name_per_clinic
  ON public.clinic_resources (clinic_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_clinic_resources_clinic_id
  ON public.clinic_resources (clinic_id);

CREATE INDEX IF NOT EXISTS idx_clinic_resources_active
  ON public.clinic_resources (clinic_id, is_active);

DROP TRIGGER IF EXISTS update_clinic_resources_updated_at ON public.clinic_resources;
CREATE TRIGGER update_clinic_resources_updated_at
  BEFORE UPDATE ON public.clinic_resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.clinic_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_resources_select_staff ON public.clinic_resources;
CREATE POLICY clinic_resources_select_staff
  ON public.clinic_resources FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (
          ur.role = 'super_admin'
          OR (
            ur.clinic_id = clinic_resources.clinic_id
            AND ur.role IN ('clinic_owner', 'staff')
          )
        )
    )
  );

DROP POLICY IF EXISTS clinic_resources_insert_staff ON public.clinic_resources;
CREATE POLICY clinic_resources_insert_staff
  ON public.clinic_resources FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (
          ur.role = 'super_admin'
          OR (
            ur.clinic_id = clinic_resources.clinic_id
            AND ur.role IN ('clinic_owner', 'staff')
          )
        )
    )
  );

DROP POLICY IF EXISTS clinic_resources_update_staff ON public.clinic_resources;
CREATE POLICY clinic_resources_update_staff
  ON public.clinic_resources FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (
          ur.role = 'super_admin'
          OR (
            ur.clinic_id = clinic_resources.clinic_id
            AND ur.role IN ('clinic_owner', 'staff')
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (
          ur.role = 'super_admin'
          OR (
            ur.clinic_id = clinic_resources.clinic_id
            AND ur.role IN ('clinic_owner', 'staff')
          )
        )
    )
  );

DROP POLICY IF EXISTS clinic_resources_delete_staff ON public.clinic_resources;
CREATE POLICY clinic_resources_delete_staff
  ON public.clinic_resources FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (
          ur.role = 'super_admin'
          OR (
            ur.clinic_id = clinic_resources.clinic_id
            AND ur.role IN ('clinic_owner', 'staff')
          )
        )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clinic_resources TO authenticated;
