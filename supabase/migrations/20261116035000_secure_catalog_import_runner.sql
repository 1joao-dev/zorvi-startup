create extension if not exists pg_net with schema extensions;

create schema if not exists private;

create table if not exists private.catalog_import_auth (
  id integer primary key check (id = 1),
  token text not null,
  token_hash text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table private.catalog_import_auth enable row level security;
revoke all on schema private from public, anon, authenticated;
revoke all on table private.catalog_import_auth from public, anon, authenticated, service_role;

create or replace function public.verify_catalog_import_token(candidate text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $$
  select candidate is not null
    and exists (
      select 1
      from private.catalog_import_auth auth
      where auth.id = 1
        and auth.enabled = true
        and auth.token_hash = encode(
          extensions.digest(convert_to(candidate, 'UTF8'), 'sha256'),
          'hex'
        )
    );
$$;

revoke all on function public.verify_catalog_import_token(text) from public, anon, authenticated;
grant execute on function public.verify_catalog_import_token(text) to service_role;

with generated as (
  select encode(extensions.gen_random_bytes(32), 'hex') as token
)
insert into private.catalog_import_auth (id, token, token_hash, enabled)
select
  1,
  generated.token,
  encode(extensions.digest(convert_to(generated.token, 'UTF8'), 'sha256'), 'hex'),
  true
from generated
on conflict (id) do update
set token = excluded.token,
    token_hash = excluded.token_hash,
    enabled = true,
    updated_at = now();
