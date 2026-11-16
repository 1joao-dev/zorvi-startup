
alter function public.normalize_product_text(text) set search_path = pg_catalog, public;

revoke all on table public.product_catalog_search_cache from anon, authenticated;
grant select, insert, update, delete on table public.product_catalog_search_cache to service_role;

drop policy if exists "Service role manages catalog search cache" on public.product_catalog_search_cache;
create policy "Service role manages catalog search cache"
  on public.product_catalog_search_cache
  for all
  to service_role
  using (true)
  with check (true);
