
CREATE TABLE IF NOT EXISTS public.zorvi_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.zorvi_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zorvi_admins FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zorvi_admins TO service_role;

INSERT INTO public.zorvi_admins (user_id, is_active)
VALUES ('ca56f926-2e1c-4567-9e0f-cce99bbcf69e'::uuid, true)
ON CONFLICT (user_id) DO UPDATE SET is_active = true;

CREATE TABLE IF NOT EXISTS public.retail_catalog_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'failed')),
  trigger_source text NOT NULL DEFAULT 'manual' CHECK (trigger_source IN ('manual', 'scheduled')),
  requested_source text NOT NULL DEFAULT 'all',
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.retail_catalog_sync_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retail_catalog_sync_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.retail_catalog_sync_runs TO service_role;

CREATE INDEX IF NOT EXISTS retail_catalog_sync_runs_started_at_idx
ON public.retail_catalog_sync_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS retail_catalog_sync_runs_status_started_at_idx
ON public.retail_catalog_sync_runs(status, started_at DESC);

CREATE OR REPLACE FUNCTION private.run_teresina_retail_catalog_sync()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_token text;
  v_request_id bigint;
BEGIN
  SELECT token INTO v_token
  FROM private.catalog_import_auth
  WHERE id = 1 AND enabled IS TRUE;

  IF v_token IS NULL OR length(v_token) < 32 THEN
    RAISE EXCEPTION 'ZORVI catalog import token is not configured or is disabled';
  END IF;

  SELECT net.http_post(
    url := 'https://pmciixclguadvkfhndcf.supabase.co/functions/v1/retail-catalog-sync',
    body := jsonb_build_object('action', 'sync', 'source', 'all', 'trigger_source', 'scheduled'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    timeout_milliseconds := 120000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$function$;
