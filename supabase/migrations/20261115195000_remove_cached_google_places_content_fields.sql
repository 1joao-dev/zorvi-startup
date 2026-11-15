-- Remove campos que armazenariam conteúdo do Google além do place_id.
-- O ZORVI mantém os marcadores do MapLibre baseados em OpenStreetMap.
alter table public.stores
  drop column if exists google_maps_uri,
  drop column if exists google_formatted_address,
  drop column if exists google_business_status,
  drop column if exists google_granularity,
  drop column if exists google_match_confidence;
