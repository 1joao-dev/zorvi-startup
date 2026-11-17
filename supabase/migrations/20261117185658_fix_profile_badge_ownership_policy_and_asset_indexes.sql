
DROP POLICY IF EXISTS "Users can feature their own unlocked badges" ON public.user_profile_badges;
CREATE POLICY "Users can feature their own unlocked badges"
ON public.user_profile_badges FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND EXISTS (
    SELECT 1
    FROM public.user_profile_inventory i
    JOIN public.profile_assets a ON a.id = i.asset_id
    WHERE i.user_id = (SELECT auth.uid())
      AND i.asset_id = public.user_profile_badges.asset_id
      AND a.asset_type = 'badge'
  )
);

CREATE INDEX IF NOT EXISTS user_profile_inventory_asset_id_idx
ON public.user_profile_inventory(asset_id);
CREATE INDEX IF NOT EXISTS user_profile_equipped_avatar_asset_id_idx
ON public.user_profile_equipped(avatar_asset_id);
CREATE INDEX IF NOT EXISTS user_profile_equipped_decoration_asset_id_idx
ON public.user_profile_equipped(decoration_asset_id);
CREATE INDEX IF NOT EXISTS user_profile_equipped_banner_asset_id_idx
ON public.user_profile_equipped(banner_asset_id);
CREATE INDEX IF NOT EXISTS user_profile_badges_asset_id_idx
ON public.user_profile_badges(asset_id);
