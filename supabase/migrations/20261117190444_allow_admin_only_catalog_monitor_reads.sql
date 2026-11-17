
GRANT SELECT ON public.zorvi_admins TO authenticated;
DROP POLICY IF EXISTS "Admins can read their own admin status" ON public.zorvi_admins;
CREATE POLICY "Admins can read their own admin status"
ON public.zorvi_admins FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id AND is_active = true);

GRANT SELECT ON public.retail_catalog_sync_runs TO authenticated;
DROP POLICY IF EXISTS "ZORVI admins can read catalog sync runs" ON public.retail_catalog_sync_runs;
CREATE POLICY "ZORVI admins can read catalog sync runs"
ON public.retail_catalog_sync_runs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.zorvi_admins a
    WHERE a.user_id = (SELECT auth.uid()) AND a.is_active = true
  )
);
