-- ZORVI: official online price channels for the Teresina pilot.
-- These are digital offers, not physical branches; keep coordinates null and exclude them from geocoding/map pins.
INSERT INTO public.stores (
  name, category, address, city, state, postal_code, website_url,
  verification_status, source_url, source_label, brand_name, brand_slug, coordinate_source
)
VALUES
(
  'Atacadão Online — Teresina (CEP 64045-840)', 'Mercado',
  'Canal digital oficial; oferta regionalizada para o CEP 64045-840; sem filial física específica',
  'Teresina', 'PI', '64045840', 'https://secure.atacadao.com.br', 'verified',
  'https://secure.atacadao.com.br',
  'Canal online oficial; preços regionalizados por CEP; não representa filial física específica.',
  'Atacadão', 'atacadao', 'online_catalog'
),
(
  'Pague Menos Online — Teresina (CEP 64049-570)', 'Farmácia',
  'Canal digital oficial; oferta regionalizada para o CEP 64049-570; sem filial física específica',
  'Teresina', 'PI', '64049570', 'https://www.paguemenos.com.br', 'verified',
  'https://www.paguemenos.com.br',
  'Canal online oficial; preços regionalizados por CEP; não representa filial física específica.',
  'Farmácias Pague Menos', 'pague-menos', 'online_catalog'
)
ON CONFLICT DO NOTHING;

GRANT INSERT (
  store_id, product_id, price, currency, price_type, source_url, source_label,
  observed_at, availability_status, verification_status, confidence_score, submitted_by
)
ON TABLE public.price_observations TO service_role;

CREATE OR REPLACE FUNCTION private.run_teresina_retail_catalog_sync()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_token text; v_request_id bigint;
BEGIN
  SELECT token INTO v_token FROM private.catalog_import_auth WHERE id = 1 AND enabled IS TRUE;
  IF v_token IS NULL OR length(v_token) < 32 THEN
    RAISE EXCEPTION 'ZORVI catalog import token is not configured or is disabled';
  END IF;
  SELECT net.http_post(
    url := 'https://pmciixclguadvkfhndcf.supabase.co/functions/v1/retail-catalog-sync',
    body := jsonb_build_object('action', 'sync', 'source', 'all'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    timeout_milliseconds := 120000
  ) INTO v_request_id;
  RETURN v_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.run_teresina_retail_catalog_sync() FROM PUBLIC, anon, authenticated, service_role;

DO $schedule$
DECLARE v_job_id bigint;
BEGIN
  FOR v_job_id IN SELECT jobid FROM cron.job WHERE jobname = 'zorvi-teresina-retail-catalog-daily'
  LOOP PERFORM cron.unschedule(v_job_id); END LOOP;
  PERFORM cron.schedule(
    'zorvi-teresina-retail-catalog-daily',
    '30 9 * * *',
    'SELECT private.run_teresina_retail_catalog_sync();'
  );
END;
$schedule$;
