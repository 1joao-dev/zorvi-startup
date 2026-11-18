
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS map_visibility boolean NOT NULL DEFAULT false;

UPDATE public.stores
SET map_visibility = (coordinate_source IS DISTINCT FROM 'online_catalog')
WHERE city = 'Teresina' AND state = 'PI';

CREATE INDEX IF NOT EXISTS stores_map_directory_idx
  ON public.stores (city, state, category, name)
  WHERE map_visibility IS TRUE;

COMMENT ON COLUMN public.stores.map_visibility IS
  'Controls inclusion in the public ZORVI map directory. Only curated, known establishments should be true.';
