
ALTER TABLE public.profile_assets
  ADD COLUMN IF NOT EXISTS animation_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS fit_config jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profile_assets'::regclass
      AND conname = 'profile_assets_animation_type_check'
  ) THEN
    ALTER TABLE public.profile_assets
      ADD CONSTRAINT profile_assets_animation_type_check
      CHECK (animation_type IN ('none','float','pulse','bob','glow','spin','orbit','shimmer','twinkle','flicker','drift','bounce'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profile_assets'::regclass
      AND conname = 'profile_assets_fit_config_object_check'
  ) THEN
    ALTER TABLE public.profile_assets
      ADD CONSTRAINT profile_assets_fit_config_object_check
      CHECK (jsonb_typeof(fit_config) = 'object');
  END IF;
END $$;

UPDATE public.profile_assets SET
  animation_type = CASE slug
    WHEN 'avatar-robot' THEN 'bob'
    WHEN 'avatar-wolf' THEN 'pulse'
    WHEN 'avatar-crystal' THEN 'glow'
    WHEN 'decoration-orbit' THEN 'spin'
    WHEN 'decoration-halo' THEN 'pulse'
    WHEN 'decoration-crown' THEN 'shimmer'
    WHEN 'decoration-laurel' THEN 'float'
    WHEN 'banner-nebula' THEN 'twinkle'
    WHEN 'banner-aurora' THEN 'drift'
    WHEN 'banner-grid' THEN 'shimmer'
    WHEN 'banner-sunset' THEN 'drift'
    ELSE animation_type
  END,
  fit_config = CASE slug
    WHEN 'decoration-orbit' THEN '{"top":"-14%","left":"-14%","width":"128%","height":"128%","objectFit":"contain"}'::jsonb
    WHEN 'decoration-halo' THEN '{"top":"-12%","left":"-12%","width":"124%","height":"124%","objectFit":"contain"}'::jsonb
    WHEN 'decoration-crown' THEN '{"top":"-27%","left":"-19%","width":"138%","height":"138%","objectFit":"contain"}'::jsonb
    WHEN 'decoration-laurel' THEN '{"top":"-18%","left":"-20%","width":"140%","height":"140%","objectFit":"contain"}'::jsonb
    ELSE fit_config
  END
WHERE slug IN ('avatar-robot','avatar-wolf','avatar-crystal','decoration-orbit','decoration-halo','decoration-crown','decoration-laurel','banner-nebula','banner-aurora','banner-grid','banner-sunset');

INSERT INTO public.profile_assets
  (slug,name,asset_type,asset_url,rarity,description,is_free,is_active,sort_order,animation_type,fit_config)
VALUES
('avatar-astronaut','Astronauta Cósmico','avatar','/profile-assets/avatars/astronaut.svg','rare','Explorador espacial com visor azul e estrelas.',true,true,90,'float','{}'::jsonb),
('avatar-dragon','Dragão Violeta','avatar','/profile-assets/avatars/dragon.svg','epic','Dragão estilizado em tons de ametista.',true,true,100,'glow','{}'::jsonb),
('avatar-tiger','Tigre Cyber','avatar','/profile-assets/avatars/tiger.svg','rare','Tigre laranja com detalhes digitais.',true,true,110,'pulse','{}'::jsonb),
('avatar-jellyfish','Água-viva Neon','avatar','/profile-assets/avatars/jellyfish.svg','epic','Água-viva luminosa em azul e lilás.',true,true,120,'float','{}'::jsonb),
('avatar-ghost','Fantasma Glitch','avatar','/profile-assets/avatars/ghost.svg','rare','Fantasma simpático em roxo e azul.',true,true,130,'bob','{}'::jsonb),
('avatar-capybara','Capivara Zen','avatar','/profile-assets/avatars/capybara.svg','common','Capivara tranquila com folhinha tropical.',true,true,140,'float','{}'::jsonb),
('avatar-phoenix','Fênix Solar','avatar','/profile-assets/avatars/phoenix.svg','legendary','Ave de fogo com plumagem dourada.',true,true,150,'glow','{}'::jsonb),
('avatar-slime','Slime Elétrico','avatar','/profile-assets/avatars/slime.svg','rare','Criatura gelatinosa verde com brilho.',true,true,160,'bounce','{}'::jsonb),
('decoration-comet','Cometa Violeta','avatar_decoration','/profile-assets/decorations/comet.svg','rare','Rastro orbital violeta com estrela cadente.',true,true,50,'spin','{"top":"-16%","left":"-16%","width":"132%","height":"132%","objectFit":"contain"}'::jsonb),
('decoration-flame','Chamas Místicas','avatar_decoration','/profile-assets/decorations/flame.svg','epic','Chamas em degradê ao redor do avatar.',true,true,60,'pulse','{"top":"-18%","left":"-18%","width":"136%","height":"136%","objectFit":"contain"}'::jsonb),
('decoration-sakura','Sakura','avatar_decoration','/profile-assets/decorations/sakura.svg','rare','Flores de cerejeira emoldurando o perfil.',true,true,70,'float','{"top":"-15%","left":"-15%","width":"130%","height":"130%","objectFit":"contain"}'::jsonb),
('decoration-lightning','Relâmpago Neon','avatar_decoration','/profile-assets/decorations/lightning.svg','epic','Raios elétricos ciano nas laterais.',true,true,80,'flicker','{"top":"-17%","left":"-17%","width":"134%","height":"134%","objectFit":"contain"}'::jsonb),
('decoration-ice','Cristais de Gelo','avatar_decoration','/profile-assets/decorations/ice.svg','epic','Cristais azuis com brilho gelado.',true,true,90,'glow','{"top":"-18%","left":"-18%","width":"136%","height":"136%","objectFit":"contain"}'::jsonb),
('decoration-gold','Moldura Dourada','avatar_decoration','/profile-assets/decorations/gold.svg','legendary','Aro dourado com pequenas gemas.',true,true,100,'shimmer','{"top":"-14%","left":"-14%","width":"128%","height":"128%","objectFit":"contain"}'::jsonb),
('decoration-glitch','Glitch Digital','avatar_decoration','/profile-assets/decorations/glitch.svg','legendary','Moldura pixelada com falhas digitais.',true,true,110,'flicker','{"top":"-16%","left":"-16%","width":"132%","height":"132%","objectFit":"contain"}'::jsonb),
('decoration-stars','Constelação','avatar_decoration','/profile-assets/decorations/stars.svg','rare','Estrelas e órbitas em azul e violeta.',true,true,120,'orbit','{"top":"-18%","left":"-18%","width":"136%","height":"136%","objectFit":"contain"}'::jsonb),
('banner-synthwave','Synthwave','banner','/profile-assets/banners/synthwave.svg','rare','Pôr do sol retrô com grade neon.',true,true,50,'drift','{}'::jsonb),
('banner-deep-space','Espaço Profundo','banner','/profile-assets/banners/deep-space.svg','epic','Planetas e estrelas em uma nebulosa.',true,true,60,'twinkle','{}'::jsonb),
('banner-ocean','Oceano Noturno','banner','/profile-assets/banners/ocean.svg','common','Ondas em camadas de azul profundo.',true,true,70,'drift','{}'::jsonb),
('banner-forest','Floresta Esmeralda','banner','/profile-assets/banners/forest.svg','rare','Folhagens abstratas em verde e turquesa.',true,true,80,'float','{}'::jsonb),
('banner-pink-nebula','Nebulosa Rosa','banner','/profile-assets/banners/pink-nebula.svg','epic','Nuvens cósmicas em rosa e magenta.',true,true,90,'shimmer','{}'::jsonb),
('banner-cyber-circuit','Circuito Cyber','banner','/profile-assets/banners/cyber-circuit.svg','legendary','Circuitos digitais em azul elétrico.',true,true,100,'flicker','{}'::jsonb)
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

INSERT INTO public.user_profile_inventory (user_id,asset_id)
SELECT p.id,a.id
FROM public.profiles p
CROSS JOIN public.profile_assets a
WHERE a.is_active = true AND a.is_free = true
ON CONFLICT (user_id,asset_id) DO NOTHING;
