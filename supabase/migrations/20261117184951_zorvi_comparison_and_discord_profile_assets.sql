
-- ZORVI comparison views: one latest verified price per product/store.
CREATE INDEX IF NOT EXISTS price_observations_verified_product_store_latest_idx
ON public.price_observations (product_id, store_id, observed_at DESC, created_at DESC, id DESC)
WHERE verification_status = 'verified';

CREATE OR REPLACE VIEW public.product_price_comparison
WITH (security_invoker = true)
AS
WITH ranked AS (
  SELECT
    po.id,
    po.product_id,
    po.store_id,
    po.price,
    po.currency,
    po.price_type,
    po.source_url,
    po.source_label,
    po.observed_at,
    po.availability_status,
    s.name AS store_name,
    s.category AS store_category,
    s.address AS store_address,
    s.city AS store_city,
    s.state AS store_state,
    s.latitude AS store_latitude,
    s.longitude AS store_longitude,
    s.website_url AS store_website_url,
    s.brand_name AS store_brand_name,
    s.brand_slug AS store_brand_slug,
    s.brand_logo_url AS store_brand_logo_url,
    s.coordinate_precision AS store_coordinate_precision,
    s.coordinate_source AS store_coordinate_source,
    s.geocoded_at AS store_geocoded_at,
    s.geocode_attempted_at AS store_geocode_attempted_at,
    s.google_place_id AS store_google_place_id,
    s.google_match_status AS store_google_match_status,
    s.google_checked_at AS store_google_checked_at,
    s.google_verified_at AS store_google_verified_at,
    row_number() OVER (
      PARTITION BY po.product_id, po.store_id
      ORDER BY po.observed_at DESC, po.created_at DESC, po.id DESC
    ) AS latest_rank
  FROM public.price_observations po
  JOIN public.products p ON p.id = po.product_id
  JOIN public.stores s ON s.id = po.store_id
  WHERE po.verification_status = 'verified'
    AND po.price > 0
    AND p.is_active = true
    AND s.verification_status = 'verified'
)
SELECT
  id, product_id, store_id, price, currency, price_type, source_url, source_label,
  observed_at, availability_status,
  store_name, store_category, store_address, store_city, store_state,
  store_latitude, store_longitude, store_website_url, store_brand_name, store_brand_slug,
  store_brand_logo_url, store_coordinate_precision, store_coordinate_source,
  store_geocoded_at, store_geocode_attempted_at, store_google_place_id,
  store_google_match_status, store_google_checked_at, store_google_verified_at,
  (store_coordinate_source = 'online_catalog') AS is_online,
  (observed_at < now() - interval '7 days') AS is_stale,
  round((extract(epoch FROM (now() - observed_at)) / 3600.0)::numeric, 1) AS age_hours
FROM ranked
WHERE latest_rank = 1
  AND availability_status <> 'unavailable';

CREATE OR REPLACE VIEW public.product_price_comparison_summary
WITH (security_invoker = true)
AS
SELECT
  product_id,
  count(*) FILTER (WHERE NOT is_stale)::integer AS fresh_store_count,
  count(*)::integer AS tracked_store_count,
  min(price) FILTER (WHERE NOT is_stale) AS lowest_price,
  max(price) FILTER (WHERE NOT is_stale) AS highest_price,
  round(
    (max(price) FILTER (WHERE NOT is_stale)) -
    (min(price) FILTER (WHERE NOT is_stale)), 2
  ) AS savings_amount,
  round(
    (
      (max(price) FILTER (WHERE NOT is_stale)) -
      (min(price) FILTER (WHERE NOT is_stale))
    ) / nullif(max(price) FILTER (WHERE NOT is_stale), 0) * 100,
    2
  ) AS savings_percentage,
  max(observed_at) AS last_updated
FROM public.product_price_comparison
GROUP BY product_id;

CREATE OR REPLACE VIEW public.product_price_history
WITH (security_invoker = true)
AS
SELECT
  po.id,
  po.product_id,
  po.store_id,
  po.price,
  po.currency,
  po.price_type,
  po.source_url,
  po.source_label,
  po.observed_at,
  po.availability_status,
  s.name AS store_name,
  s.city AS store_city,
  s.state AS store_state,
  s.coordinate_source AS store_coordinate_source,
  (s.coordinate_source = 'online_catalog') AS is_online
FROM public.price_observations po
JOIN public.products p ON p.id = po.product_id
JOIN public.stores s ON s.id = po.store_id
WHERE po.verification_status = 'verified'
  AND po.availability_status <> 'unavailable'
  AND p.is_active = true
  AND s.verification_status = 'verified';

REVOKE ALL ON public.product_price_comparison FROM PUBLIC, anon;
REVOKE ALL ON public.product_price_comparison_summary FROM PUBLIC, anon;
REVOKE ALL ON public.product_price_history FROM PUBLIC, anon;
GRANT SELECT ON public.product_price_comparison TO authenticated;
GRANT SELECT ON public.product_price_comparison_summary TO authenticated;
GRANT SELECT ON public.product_price_history TO authenticated;

-- Discord-inspired profile asset catalog and per-user inventory.
CREATE TABLE IF NOT EXISTS public.profile_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  asset_type text NOT NULL CHECK (asset_type IN ('avatar', 'avatar_decoration', 'banner', 'badge')),
  asset_url text NOT NULL,
  rarity text NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  description text NOT NULL DEFAULT '',
  is_free boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_profile_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.profile_assets(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, asset_id)
);

CREATE TABLE IF NOT EXISTS public.user_profile_equipped (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  avatar_asset_id uuid REFERENCES public.profile_assets(id) ON DELETE SET NULL,
  decoration_asset_id uuid REFERENCES public.profile_assets(id) ON DELETE SET NULL,
  banner_asset_id uuid REFERENCES public.profile_assets(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_profile_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.profile_assets(id) ON DELETE CASCADE,
  is_featured boolean NOT NULL DEFAULT false,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, asset_id)
);

ALTER TABLE public.profile_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profile_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profile_equipped ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profile_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active profile assets are public" ON public.profile_assets;
CREATE POLICY "Active profile assets are public"
ON public.profile_assets FOR SELECT TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Users can read their own profile inventory" ON public.user_profile_inventory;
CREATE POLICY "Users can read their own profile inventory"
ON public.user_profile_inventory FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Equipped profile items are public" ON public.user_profile_equipped;
CREATE POLICY "Equipped profile items are public"
ON public.user_profile_equipped FOR SELECT TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Users can equip owned profile assets" ON public.user_profile_equipped;
CREATE POLICY "Users can equip owned profile assets"
ON public.user_profile_equipped FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND (avatar_asset_id IS NULL OR EXISTS (
    SELECT 1 FROM public.user_profile_inventory i
    JOIN public.profile_assets a ON a.id = i.asset_id
    WHERE i.user_id = (SELECT auth.uid()) AND i.asset_id = avatar_asset_id AND a.asset_type = 'avatar'
  ))
  AND (decoration_asset_id IS NULL OR EXISTS (
    SELECT 1 FROM public.user_profile_inventory i
    JOIN public.profile_assets a ON a.id = i.asset_id
    WHERE i.user_id = (SELECT auth.uid()) AND i.asset_id = decoration_asset_id AND a.asset_type = 'avatar_decoration'
  ))
  AND (banner_asset_id IS NULL OR EXISTS (
    SELECT 1 FROM public.user_profile_inventory i
    JOIN public.profile_assets a ON a.id = i.asset_id
    WHERE i.user_id = (SELECT auth.uid()) AND i.asset_id = banner_asset_id AND a.asset_type = 'banner'
  ))
);

DROP POLICY IF EXISTS "Users can update their equipped profile assets" ON public.user_profile_equipped;
CREATE POLICY "Users can update their equipped profile assets"
ON public.user_profile_equipped FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND (avatar_asset_id IS NULL OR EXISTS (
    SELECT 1 FROM public.user_profile_inventory i
    JOIN public.profile_assets a ON a.id = i.asset_id
    WHERE i.user_id = (SELECT auth.uid()) AND i.asset_id = avatar_asset_id AND a.asset_type = 'avatar'
  ))
  AND (decoration_asset_id IS NULL OR EXISTS (
    SELECT 1 FROM public.user_profile_inventory i
    JOIN public.profile_assets a ON a.id = i.asset_id
    WHERE i.user_id = (SELECT auth.uid()) AND i.asset_id = decoration_asset_id AND a.asset_type = 'avatar_decoration'
  ))
  AND (banner_asset_id IS NULL OR EXISTS (
    SELECT 1 FROM public.user_profile_inventory i
    JOIN public.profile_assets a ON a.id = i.asset_id
    WHERE i.user_id = (SELECT auth.uid()) AND i.asset_id = banner_asset_id AND a.asset_type = 'banner'
  ))
);

DROP POLICY IF EXISTS "Profile badges are public" ON public.user_profile_badges;
CREATE POLICY "Profile badges are public"
ON public.user_profile_badges FOR SELECT TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Users can feature their own unlocked badges" ON public.user_profile_badges;
CREATE POLICY "Users can feature their own unlocked badges"
ON public.user_profile_badges FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND EXISTS (
    SELECT 1 FROM public.user_profile_inventory i
    JOIN public.profile_assets a ON a.id = i.asset_id
    WHERE i.user_id = (SELECT auth.uid())
      AND i.asset_id = asset_id
      AND a.asset_type = 'badge'
  )
);

REVOKE ALL ON public.profile_assets, public.user_profile_inventory, public.user_profile_equipped, public.user_profile_badges FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profile_assets TO anon, authenticated;
GRANT SELECT ON public.user_profile_equipped, public.user_profile_badges TO anon, authenticated;
GRANT SELECT ON public.user_profile_inventory TO authenticated;
GRANT INSERT, UPDATE ON public.user_profile_equipped TO authenticated;
GRANT UPDATE (is_featured) ON public.user_profile_badges TO authenticated;
GRANT ALL ON public.profile_assets, public.user_profile_inventory, public.user_profile_equipped, public.user_profile_badges TO service_role;

INSERT INTO public.profile_assets
  (slug, name, asset_type, asset_url, rarity, description, is_free, is_active, sort_order)
VALUES
  ('avatar-fox', 'Raposa ZORVI', 'avatar', '/profile-assets/avatars/fox.svg', 'common', 'Mascote raposa em degradê violeta e coral.', true, true, 10),
  ('avatar-cat', 'Gato Neon', 'avatar', '/profile-assets/avatars/cat.svg', 'common', 'Mascote felino em tons de violeta.', true, true, 20),
  ('avatar-owl', 'Coruja Tech', 'avatar', '/profile-assets/avatars/owl.svg', 'common', 'Mascote coruja em azul profundo.', true, true, 30),
  ('avatar-robot', 'Robô Z', 'avatar', '/profile-assets/avatars/robot.svg', 'rare', 'Mascote robô em turquesa.', true, true, 40),
  ('avatar-frog', 'Sapo Pixel', 'avatar', '/profile-assets/avatars/frog.svg', 'common', 'Mascote verde vibrante.', true, true, 50),
  ('avatar-panda', 'Panda Lunar', 'avatar', '/profile-assets/avatars/panda.svg', 'rare', 'Mascote panda em lavanda.', true, true, 60),
  ('avatar-wolf', 'Lobo Noturno', 'avatar', '/profile-assets/avatars/wolf.svg', 'epic', 'Mascote lobo em tons de ardósia.', true, true, 70),
  ('avatar-crystal', 'Cristal', 'avatar', '/profile-assets/avatars/crystal.svg', 'epic', 'Cristal azul iridescente.', true, true, 80),
  ('decoration-orbit', 'Órbita', 'avatar_decoration', '/profile-assets/decorations/orbit.svg', 'common', 'Anel orbital violeta e rosa.', true, true, 10),
  ('decoration-halo', 'Halo Neon', 'avatar_decoration', '/profile-assets/decorations/halo.svg', 'rare', 'Halo ciano luminoso.', true, true, 20),
  ('decoration-crown', 'Coroa', 'avatar_decoration', '/profile-assets/decorations/crown.svg', 'epic', 'Coroa dourada.', true, true, 30),
  ('decoration-laurel', 'Loureiro', 'avatar_decoration', '/profile-assets/decorations/laurel.svg', 'epic', 'Ramos verdes ao redor do avatar.', true, true, 40),
  ('banner-nebula', 'Nebulosa', 'banner', '/profile-assets/banners/nebula.svg', 'common', 'Nebulosa violeta.', true, true, 10),
  ('banner-aurora', 'Aurora', 'banner', '/profile-assets/banners/aurora.svg', 'rare', 'Aurora em tons de verde e azul.', true, true, 20),
  ('banner-grid', 'Cyber Grid', 'banner', '/profile-assets/banners/grid.svg', 'rare', 'Grade digital azul e violeta.', true, true, 30),
  ('banner-sunset', 'Pôr do Sol', 'banner', '/profile-assets/banners/sunset.svg', 'epic', 'Degradê quente com horizonte abstrato.', true, true, 40),
  ('badge-explorer', 'Explorador', 'badge', '/profile-assets/badges/explorer.svg', 'common', 'Primeira insígnia da comunidade ZORVI.', true, true, 10),
  ('badge-founder', 'Fundador', 'badge', '/profile-assets/badges/founder.svg', 'legendary', 'Insígnia reservada à equipe fundadora.', false, true, 20),
  ('badge-deal-hunter', 'Caçador de Ofertas', 'badge', '/profile-assets/badges/deal-hunter.svg', 'rare', 'Conquistada ao encontrar boas ofertas.', false, true, 30),
  ('badge-contributor', 'Colaborador', 'badge', '/profile-assets/badges/contributor.svg', 'rare', 'Conquistada ao contribuir com preços.', false, true, 40),
  ('badge-verifier', 'Verificador', 'badge', '/profile-assets/badges/verifier.svg', 'epic', 'Conquistada ao validar informações.', false, true, 50),
  ('badge-early-access', 'Acesso Antecipado', 'badge', '/profile-assets/badges/early-access.svg', 'epic', 'Insígnia de participantes do acesso antecipado.', false, true, 60)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  asset_type = EXCLUDED.asset_type,
  asset_url = EXCLUDED.asset_url,
  rarity = EXCLUDED.rarity,
  description = EXCLUDED.description,
  is_free = EXCLUDED.is_free,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;

CREATE OR REPLACE FUNCTION public.grant_default_profile_assets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_profile_inventory (user_id, asset_id)
  SELECT NEW.id, a.id FROM public.profile_assets a
  WHERE a.is_active = true AND a.is_free = true
  ON CONFLICT (user_id, asset_id) DO NOTHING;

  INSERT INTO public.user_profile_equipped (user_id, avatar_asset_id, decoration_asset_id, banner_asset_id)
  VALUES (
    NEW.id,
    (SELECT id FROM public.profile_assets WHERE slug = 'avatar-fox'),
    (SELECT id FROM public.profile_assets WHERE slug = 'decoration-orbit'),
    (SELECT id FROM public.profile_assets WHERE slug = 'banner-nebula')
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_profile_badges (user_id, asset_id, is_featured)
  SELECT NEW.id, a.id, true
  FROM public.profile_assets a
  WHERE a.slug = 'badge-explorer'
  ON CONFLICT (user_id, asset_id) DO NOTHING;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.grant_default_profile_assets() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS profiles_grant_default_assets ON public.profiles;
CREATE TRIGGER profiles_grant_default_assets
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.grant_default_profile_assets();

-- Backfill the starter gallery and default look for existing profiles.
INSERT INTO public.user_profile_inventory (user_id, asset_id)
SELECT p.id, a.id FROM public.profiles p CROSS JOIN public.profile_assets a
WHERE a.is_active = true AND a.is_free = true
ON CONFLICT (user_id, asset_id) DO NOTHING;

INSERT INTO public.user_profile_equipped (user_id, avatar_asset_id, decoration_asset_id, banner_asset_id)
SELECT
  p.id,
  (SELECT id FROM public.profile_assets WHERE slug = 'avatar-fox'),
  (SELECT id FROM public.profile_assets WHERE slug = 'decoration-orbit'),
  (SELECT id FROM public.profile_assets WHERE slug = 'banner-nebula')
FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_profile_badges (user_id, asset_id, is_featured)
SELECT p.id, a.id, true
FROM public.profiles p
CROSS JOIN public.profile_assets a
WHERE a.slug = 'badge-explorer'
ON CONFLICT (user_id, asset_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.save_profile_customization(
  p_display_name text,
  p_username text,
  p_bio text,
  p_avatar_url text,
  p_avatar_asset_id uuid,
  p_decoration_asset_id uuid,
  p_banner_asset_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF length(btrim(coalesce(p_display_name, ''))) < 2 OR length(p_display_name) > 60 THEN
    RAISE EXCEPTION 'Invalid display name';
  END IF;
  IF p_username IS NULL OR p_username !~ '^[a-z0-9_]{3,24}$' THEN
    RAISE EXCEPTION 'Invalid username';
  END IF;
  IF length(coalesce(p_bio, '')) > 160 THEN
    RAISE EXCEPTION 'Bio is too long';
  END IF;

  UPDATE public.profiles
  SET display_name = btrim(p_display_name),
      username = p_username,
      bio = coalesce(p_bio, ''),
      avatar_url = p_avatar_url,
      updated_at = now()
  WHERE id = current_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  INSERT INTO public.user_profile_equipped (
    user_id, avatar_asset_id, decoration_asset_id, banner_asset_id, updated_at
  )
  VALUES (
    current_user_id, p_avatar_asset_id, p_decoration_asset_id, p_banner_asset_id, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    avatar_asset_id = EXCLUDED.avatar_asset_id,
    decoration_asset_id = EXCLUDED.decoration_asset_id,
    banner_asset_id = EXCLUDED.banner_asset_id,
    updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.save_profile_customization(text, text, text, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_profile_customization(text, text, text, text, uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_profile_badge_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  featured_count integer;
BEGIN
  IF NEW.is_featured THEN
    PERFORM 1 FROM public.profiles WHERE id = NEW.user_id FOR UPDATE;
    SELECT count(*) INTO featured_count
    FROM public.user_profile_badges b
    WHERE b.user_id = NEW.user_id
      AND b.is_featured = true
      AND b.id <> NEW.id;
    IF featured_count >= 3 THEN
      RAISE EXCEPTION 'You can feature up to three profile badges.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_profile_badge_limit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS user_profile_badges_limit_featured ON public.user_profile_badges;
CREATE TRIGGER user_profile_badges_limit_featured
BEFORE INSERT OR UPDATE OF is_featured ON public.user_profile_badges
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_badge_limit();
