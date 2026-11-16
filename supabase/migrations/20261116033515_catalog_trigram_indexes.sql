create extension if not exists pg_trgm with schema extensions;

create index if not exists products_normalized_name_trgm_idx
  on public.products using gin (normalized_name extensions.gin_trgm_ops);

create index if not exists product_aliases_normalized_alias_trgm_idx
  on public.product_aliases using gin (normalized_alias extensions.gin_trgm_ops);