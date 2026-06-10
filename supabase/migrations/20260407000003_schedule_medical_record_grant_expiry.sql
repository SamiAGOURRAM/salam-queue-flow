-- Schedules periodic expiry cleanup for medical record access grants.
-- This job runs every minute and executes with a service_role JWT claim.

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT j.jobid INTO v_job_id
  FROM cron.job j
  WHERE j.jobname = 'expire-stale-medical-record-grants'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'expire-stale-medical-record-grants',
    '* * * * *',
    'SELECT set_config(''request.jwt.claim.role'', ''service_role'', true); SELECT public.expire_stale_medical_record_grants();'
  );
END;
$$;
