-- queue_overrides had RLS ENABLED but NO policies → deny-all, so the queue
-- action audit insert (createQueueOverride during call-next) failed with 403,
-- aborting call-next even though the patient had already been transitioned.
--
-- Allow clinic queue managers to read/record/update overrides for their clinic,
-- mirroring the permission used by the call-next RPC (manage_queue).

ALTER TABLE public.queue_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS queue_overrides_select ON public.queue_overrides;
DROP POLICY IF EXISTS queue_overrides_insert ON public.queue_overrides;
DROP POLICY IF EXISTS queue_overrides_update ON public.queue_overrides;

CREATE POLICY queue_overrides_select ON public.queue_overrides
  FOR SELECT TO authenticated
  USING (public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_queue'));

CREATE POLICY queue_overrides_insert ON public.queue_overrides
  FOR INSERT TO authenticated
  WITH CHECK (public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_queue'));

CREATE POLICY queue_overrides_update ON public.queue_overrides
  FOR UPDATE TO authenticated
  USING (public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_queue'))
  WITH CHECK (public._user_has_clinic_permission(clinic_id, auth.uid(), 'manage_queue'));
