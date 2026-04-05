-- P1 hardening: prevent display_order race conditions for clinic resource creation.
-- Serializes inserts per clinic and assigns display_order in the database.

CREATE OR REPLACE FUNCTION public.create_clinic_resource(
  p_clinic_id UUID,
  p_name TEXT,
  p_resource_type TEXT DEFAULT 'room',
  p_capacity INTEGER DEFAULT 1,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS public.clinic_resources
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_display_order INTEGER;
  v_inserted public.clinic_resources;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_clinic_id::text, 17));

  SELECT COALESCE(MAX(display_order), -1) + 1
  INTO v_display_order
  FROM public.clinic_resources
  WHERE clinic_id = p_clinic_id;

  INSERT INTO public.clinic_resources (
    clinic_id,
    name,
    resource_type,
    capacity,
    notes,
    created_by,
    display_order
  )
  VALUES (
    p_clinic_id,
    trim(p_name),
    COALESCE(NULLIF(trim(p_resource_type), ''), 'other'),
    GREATEST(1, p_capacity),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    p_created_by,
    v_display_order
  )
  RETURNING * INTO v_inserted;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_clinic_resource(UUID, TEXT, TEXT, INTEGER, TEXT, UUID) TO authenticated;
