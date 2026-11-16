-- ZORVI: schedule evidence-backed Open Prices collection for the Teresina pilot.
-- Runs daily at 06:00 in Teresina (09:00 UTC). No service-role key is stored in cron.
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION private.run_teresina_open_prices_import()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_token text;
  v_request_id bigint;
BEGIN
  SELECT token
    INTO v_token
    FROM private.catalog_import_auth
   WHERE id = 1
     AND enabled IS TRUE;

  IF v_token IS NULL OR length(v_token) < 32 THEN
    RAISE EXCEPTION 'ZORVI catalog import token is not configured or is disabled';
  END IF;

  SELECT net.http_post(
    url := 'https://pmciixclguadvkfhndcf.supabase.co/functions/v1/catalog-import',
    body := jsonb_build_object('source', 'open_prices'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    timeout_milliseconds := 30000
  )
  INTO v_request_id;

  RETURN v_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.run_teresina_open_prices_import() FROM PUBLIC, anon, authenticated, service_role;

DO $schedule$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
      FROM cron.job
     WHERE jobname = 'zorvi-teresina-open-prices-daily'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'zorvi-teresina-open-prices-daily',
    '0 9 * * *',
    'SELECT private.run_teresina_open_prices_import();'
  );
END;
$schedule$;
