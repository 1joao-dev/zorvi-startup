ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS osm_type text,
  ADD COLUMN IF NOT EXISTS osm_id bigint,
  ADD COLUMN IF NOT EXISTS osm_last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS osm_tags jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_coordinate_precision_check;
ALTER TABLE public.stores
  ADD CONSTRAINT stores_coordinate_precision_check
  CHECK (coordinate_precision IS NULL OR coordinate_precision = ANY (ARRAY['address'::text,'street'::text,'poi'::text]));

ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_osm_type_check;
ALTER TABLE public.stores
  ADD CONSTRAINT stores_osm_type_check
  CHECK (osm_type IS NULL OR osm_type = ANY (ARRAY['node'::text,'way'::text,'relation'::text]));

ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_osm_id_check;
ALTER TABLE public.stores
  ADD CONSTRAINT stores_osm_id_check
  CHECK (osm_id IS NULL OR osm_id > 0);

ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_osm_tags_object_check;
ALTER TABLE public.stores
  ADD CONSTRAINT stores_osm_tags_object_check
  CHECK (jsonb_typeof(osm_tags) = 'object');

CREATE UNIQUE INDEX IF NOT EXISTS stores_osm_identity_unique_idx
  ON public.stores (osm_type, osm_id);

CREATE INDEX IF NOT EXISTS stores_city_state_category_idx
  ON public.stores (city, state, category);

COMMENT ON COLUMN public.stores.osm_type IS 'OpenStreetMap element type: node, way or relation.';
COMMENT ON COLUMN public.stores.osm_id IS 'OpenStreetMap element ID; paired with osm_type for stable deduplication.';
COMMENT ON COLUMN public.stores.osm_last_seen_at IS 'Last successful directory import that observed this OSM element.';
COMMENT ON COLUMN public.stores.osm_tags IS 'Whitelisted public OSM tags retained for source traceability; ODbL attribution applies.';
