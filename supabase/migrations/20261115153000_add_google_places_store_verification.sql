-- Guarda a correspondência verificada do Google Places e a precisão do Geocoding v4.
alter table public.stores
  add column if not exists google_place_id text,
  add column if not exists google_maps_uri text,
  add column if not exists google_formatted_address text,
  add column if not exists google_business_status text,
  add column if not exists google_granularity text,
  add column if not exists google_match_status text,
  add column if not exists google_match_confidence numeric(5,4),
  add column if not exists google_checked_at timestamptz,
  add column if not exists google_verified_at timestamptz;

alter table public.stores
  drop constraint if exists stores_google_match_status_check;

alter table public.stores
  add constraint stores_google_match_status_check
  check (
    google_match_status is null
    or google_match_status = any (array['verified'::text, 'needs_review'::text, 'not_found'::text, 'api_error'::text])
  );

alter table public.stores
  drop constraint if exists stores_google_match_confidence_check;

alter table public.stores
  add constraint stores_google_match_confidence_check
  check (
    google_match_confidence is null
    or (google_match_confidence >= 0 and google_match_confidence <= 1)
  );

create index if not exists stores_google_place_id_idx
  on public.stores (google_place_id)
  where google_place_id is not null;

create index if not exists stores_google_match_status_idx
  on public.stores (google_match_status)
  where google_match_status is not null;
