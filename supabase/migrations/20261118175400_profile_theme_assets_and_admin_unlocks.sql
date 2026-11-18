
INSERT INTO public.profile_assets
  (slug, name, asset_type, asset_url, rarity, description, is_free, is_active, sort_order, animation_type, fit_config)
VALUES
  ('avatar-barrel-buddy', 'Mascote do Barril', 'avatar', '/profile-assets/avatars/barrel-mascot.svg', 'epic', 'Mascote original de madeira, inspirado no clima divertido da vila.', false, true, 170, 'bob', '{}'::jsonb),
  ('avatar-scarlet-speedster', 'Velocista Escarlate', 'avatar', '/profile-assets/avatars/scarlet-speedster.svg', 'legendary', 'Herói original de velocidade com energia vermelha e dourada.', false, true, 180, 'pulse', '{}'::jsonb),
  ('avatar-village-explorer', 'Aventureiro da Vila', 'avatar', '/profile-assets/avatars/village-explorer.svg', 'rare', 'Personagem original e divertido para a coleção da vila.', false, true, 190, 'float', '{}'::jsonb),
  ('decoration-barrel-frame', 'Moldura do Barril', 'avatar_decoration', '/profile-assets/decorations/barrel-village.svg', 'epic', 'Aro de madeira, ferragens e estrelinhas em homenagem à vila.', false, true, 130, 'float', '{"top":"-19%","left":"-19%","width":"138%","height":"138%","objectFit":"contain"}'::jsonb),
  ('decoration-scarlet-lightning', 'Raios Escarlates', 'avatar_decoration', '/profile-assets/decorations/scarlet-speed.svg', 'legendary', 'Raios vermelhos e dourados com energia de supervelocidade.', false, true, 140, 'flicker', '{"top":"-20%","left":"-20%","width":"140%","height":"140%","objectFit":"contain"}'::jsonb),
  ('decoration-biionic-hammer', 'Martelo Biônico', 'avatar_decoration', '/profile-assets/decorations/bionic-hammer.svg', 'epic', 'Moldura com um martelo cômico e faíscas douradas.', false, true, 150, 'shimmer', '{"top":"-22%","left":"-20%","width":"140%","height":"140%","objectFit":"contain"}'::jsonb),
  ('decoration-village-garland', 'Festa na Vila', 'avatar_decoration', '/profile-assets/decorations/village-garland.svg', 'rare', 'Bandeirinhas coloridas e detalhes alegres ao redor do avatar.', false, true, 160, 'twinkle', '{"top":"-18%","left":"-18%","width":"136%","height":"136%","objectFit":"contain"}'::jsonb),
  ('banner-village-courtyard', 'Pátio da Vila', 'banner', '/profile-assets/banners/village-yard.svg', 'epic', 'Pátio colorido com casinhas, plantas e um barril central.', false, true, 110, 'drift', '{}'::jsonb),
  ('banner-scarlet-sprint', 'Corrida Escarlate', 'banner', '/profile-assets/banners/scarlet-speed.svg', 'legendary', 'Rastro de velocidade vermelho, laranja e dourado.', false, true, 120, 'flicker', '{}'::jsonb),
  ('banner-sandwich-party', 'Festa do Sanduíche', 'banner', '/profile-assets/banners/sandwich-party.svg', 'rare', 'Coleção divertida de sanduíches, estrelas e cores quentes.', false, true, 130, 'float', '{}'::jsonb),
  ('banner-village-night', 'Vila ao Anoitecer', 'banner', '/profile-assets/banners/village-night.svg', 'epic', 'Casinhas iluminadas e céu azul de fim de tarde.', false, true, 140, 'twinkle', '{}'::jsonb),
  ('badge-barrel-club', 'Clube do Barril', 'badge', '/profile-assets/badges/barrel-club.svg', 'rare', 'Insígnia especial da coleção Vila & Velocidade.', false, true, 70, 'none', '{}'::jsonb),
  ('badge-scarlet-runner', 'Velocista Escarlate', 'badge', '/profile-assets/badges/scarlet-runner.svg', 'legendary', 'Insígnia de energia e velocidade.', false, true, 80, 'none', '{}'::jsonb),
  ('badge-biionic-hammer', 'Martelo Biônico', 'badge', '/profile-assets/badges/bionic-hammer.svg', 'epic', 'Insígnia inspirada em um herói atrapalhado e corajoso.', false, true, 90, 'none', '{}'::jsonb),
  ('badge-presunto-fan', 'Fã do Presunto', 'badge', '/profile-assets/badges/presunto-fan.svg', 'rare', 'Para quem não dispensa um bom sanduíche.', false, true, 100, 'none', '{}'::jsonb),
  ('badge-village-friend', 'Amigo da Vila', 'badge', '/profile-assets/badges/village-friend.svg', 'epic', 'Insígnia para quem faz parte da turma.', false, true, 110, 'none', '{}'::jsonb),
  ('badge-zorvi-admin', 'Administrador ZORVI', 'badge', '/profile-assets/badges/zorvi-admin.svg', 'legendary', 'Insígnia especial de administração do ZORVI.', false, true, 120, 'none', '{}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  asset_type = EXCLUDED.asset_type,
  asset_url = EXCLUDED.asset_url,
  rarity = EXCLUDED.rarity,
  description = EXCLUDED.description,
  is_free = EXCLUDED.is_free,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  animation_type = EXCLUDED.animation_type,
  fit_config = EXCLUDED.fit_config;

CREATE OR REPLACE FUNCTION public.grant_new_profile_assets_to_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_active THEN
    INSERT INTO public.user_profile_inventory (user_id, asset_id)
    SELECT a.user_id, NEW.id
    FROM public.zorvi_admins a
    WHERE a.is_active = true
    ON CONFLICT (user_id, asset_id) DO NOTHING;

    IF NEW.asset_type = 'badge' THEN
      INSERT INTO public.user_profile_badges (user_id, asset_id, is_featured)
      SELECT a.user_id, NEW.id, false
      FROM public.zorvi_admins a
      WHERE a.is_active = true
      ON CONFLICT (user_id, asset_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_new_profile_assets_to_admins() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profile_assets_unlock_for_admins ON public.profile_assets;
CREATE TRIGGER profile_assets_unlock_for_admins
AFTER INSERT OR UPDATE ON public.profile_assets
FOR EACH ROW
EXECUTE FUNCTION public.grant_new_profile_assets_to_admins();

INSERT INTO public.user_profile_inventory (user_id, asset_id)
SELECT a.user_id, p.id
FROM public.zorvi_admins a
CROSS JOIN public.profile_assets p
WHERE a.is_active = true
  AND p.is_active = true
ON CONFLICT (user_id, asset_id) DO NOTHING;

INSERT INTO public.user_profile_badges (user_id, asset_id, is_featured)
SELECT a.user_id, p.id, false
FROM public.zorvi_admins a
CROSS JOIN public.profile_assets p
WHERE a.is_active = true
  AND p.is_active = true
  AND p.asset_type = 'badge'
ON CONFLICT (user_id, asset_id) DO NOTHING;
