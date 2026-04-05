-- Medical sharing patient-facing audit RPCs.

CREATE OR REPLACE FUNCTION public.get_my_medical_record_access_log(
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_patient_id UUID;
BEGIN
  v_user_id := public._medical_assert_authenticated();

  SELECT p.id INTO v_patient_id
  FROM public.patients p
  WHERE p.user_id = v_user_id
    AND NOT p.is_anonymized
  LIMIT 1;

  IF v_patient_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', al.id,
        'accessed_by', al.accessed_by,
        'accessed_by_name', COALESCE(pr.full_name, 'Staff Member'),
        'clinic_name', c.name,
        'record_type', al.record_type,
        'action', al.action,
        'accessed_at', al.accessed_at
      )
      ORDER BY al.accessed_at DESC
    )
    FROM (
      SELECT l.id,
             l.accessed_by,
             l.clinic_id,
             l.record_type,
             l.action,
             l.accessed_at
      FROM public.medical_record_access_log l
      WHERE l.patient_id = v_patient_id
      ORDER BY l.accessed_at DESC
      LIMIT GREATEST(COALESCE(p_limit, 20), 1)
      OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) al
    LEFT JOIN public.profiles pr ON pr.id = al.accessed_by
    LEFT JOIN public.clinics c ON c.id = al.clinic_id
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_medical_record_access_log(INT, INT) TO authenticated;
