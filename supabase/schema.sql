-- ZORVI: perfis e autenticação
-- Execute este arquivo no SQL Editor do projeto Supabase.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text not null default 'Explorador ZORVI',
  avatar_url text,
  bio text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Permissões SQL necessárias para a API do Supabase; RLS continua filtrando por usuário.
grant select on table public.profiles to anon, authenticated;
grant update on table public.profiles to authenticated;

-- Perfis públicos podem ser consultados pela comunidade.
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

-- Cada pessoa só pode editar o próprio perfil.
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Cria automaticamente o perfil quando o usuário se cadastra.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    lower(regexp_replace(coalesce(split_part(new.email, '@', 1), 'explorador'), '[^a-zA-Z0-9_]', '', 'g')) || '_' || substr(new.id::text, 1, 6),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, 'explorador'), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();
\n
-- Feed social ZORVI: publicações, curtidas, comentários e imagens.
create table if not exists public.posts (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, content text not null default '', image_url text, location_name text, created_at timestamptz not null default now(), constraint posts_content_length check (char_length(content) <= 2200), constraint posts_location_length check (location_name is null or char_length(location_name) <= 120), constraint posts_content_or_image check (length(btrim(content)) > 0 or image_url is not null));
create table if not exists public.post_likes (post_id uuid not null references public.posts(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), primary key (post_id,user_id));
create table if not exists public.post_comments (id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, content text not null, created_at timestamptz not null default now(), constraint post_comments_content_length check (char_length(content) between 1 and 1000));
create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists posts_user_id_created_at_idx on public.posts(user_id,created_at desc);
create index if not exists post_likes_user_id_idx on public.post_likes(user_id);
create index if not exists post_comments_post_id_created_at_idx on public.post_comments(post_id,created_at asc);
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
grant select,insert,update,delete on public.posts to authenticated;
grant select,insert,delete on public.post_likes to authenticated;
grant select,insert,update,delete on public.post_comments to authenticated;
drop policy if exists "Authenticated users can read posts" on public.posts;
create policy "Authenticated users can read posts" on public.posts for select to authenticated using (true);
drop policy if exists "Users can create their own posts" on public.posts;
create policy "Users can create their own posts" on public.posts for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own posts" on public.posts;
create policy "Users can update their own posts" on public.posts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own posts" on public.posts;
create policy "Users can delete their own posts" on public.posts for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Authenticated users can read post likes" on public.post_likes;
create policy "Authenticated users can read post likes" on public.post_likes for select to authenticated using (true);
drop policy if exists "Users can like posts as themselves" on public.post_likes;
create policy "Users can like posts as themselves" on public.post_likes for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can remove their own likes" on public.post_likes;
create policy "Users can remove their own likes" on public.post_likes for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Authenticated users can read post comments" on public.post_comments;
create policy "Authenticated users can read post comments" on public.post_comments for select to authenticated using (true);
drop policy if exists "Users can comment as themselves" on public.post_comments;
create policy "Users can comment as themselves" on public.post_comments for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own comments" on public.post_comments;
create policy "Users can update their own comments" on public.post_comments for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own comments" on public.post_comments;
create policy "Users can delete their own comments" on public.post_comments for delete to authenticated using ((select auth.uid()) = user_id);
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('post-images','post-images',true,8388608,array['image/jpeg','image/png','image/webp']) on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Users can upload their own post images" on storage.objects;
create policy "Users can upload their own post images" on storage.objects for insert to authenticated with check (bucket_id='post-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Users can update their own post images" on storage.objects;
create policy "Users can update their own post images" on storage.objects for update to authenticated using (bucket_id='post-images' and (storage.foldername(name))[1]=(select auth.uid())::text) with check (bucket_id='post-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Users can delete their own post images" on storage.objects;
create policy "Users can delete their own post images" on storage.objects for delete to authenticated using (bucket_id='post-images' and (storage.foldername(name))[1]=(select auth.uid())::text);


-- Catálogo de estabelecimentos, produtos e preços verificáveis da ZORVI.
create table if not exists public.stores (id uuid primary key default gen_random_uuid(),name text not null,category text not null check(category in ('Farmácia','Mercado','Restaurante','Lojas','Outros')),address text not null,city text not null,state text not null,postal_code text,latitude double precision check(latitude is null or latitude between -90 and 90),longitude double precision check(longitude is null or longitude between -180 and 180),website_url text,brand_name text,brand_slug text,brand_logo_url text,coordinate_precision text,coordinate_source text,geocoded_at timestamptz,source_url text,source_label text,owner_user_id uuid references auth.users(id) on delete set null,verification_status text not null default 'pending' check(verification_status in ('pending','verified','rejected')),created_at timestamptz not null default now());
create index if not exists stores_location_idx on public.stores(latitude,longitude);
create table if not exists public.products (id uuid primary key default gen_random_uuid(),name text not null,normalized_name text not null,brand text,variant text,barcode text,category text not null check(category in ('Farmácia','Mercado','Restaurante','Lojas','Outros')),unit text,created_at timestamptz not null default now());
create unique index if not exists products_barcode_unique_idx on public.products(barcode) where barcode is not null;
create index if not exists products_name_search_idx on public.products using gin(to_tsvector('portuguese',coalesce(name,'')||' '||coalesce(brand,'')||' '||coalesce(variant,'')));
create table if not exists public.price_observations (id uuid primary key default gen_random_uuid(),store_id uuid not null references public.stores(id) on delete cascade,product_id uuid not null references public.products(id) on delete cascade,price numeric(12,2) not null check(price>0),currency text not null default 'BRL',price_type text not null check(price_type in ('official_site','in_store','estimated','community_report')),source_url text,source_label text not null,observed_at timestamptz not null default now(),availability_status text not null default 'unknown' check(availability_status in ('available','unavailable','unknown')),verification_status text not null default 'pending' check(verification_status in ('pending','verified','rejected')),confidence_score numeric(4,3) check(confidence_score is null or confidence_score between 0 and 1),submitted_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),constraint official_price_requires_source check(price_type<>'official_site' or source_url is not null));
create index if not exists price_observations_product_price_idx on public.price_observations(product_id,price) where verification_status='verified';
create index if not exists price_observations_store_idx on public.price_observations(store_id,observed_at desc);
alter table public.stores enable row level security;alter table public.products enable row level security;alter table public.price_observations enable row level security;
grant select on public.stores,public.products,public.price_observations to authenticated;grant insert,update,delete on public.price_observations to authenticated;
drop policy if exists "Authenticated users can read verified stores" on public.stores;create policy "Authenticated users can read verified stores" on public.stores for select to authenticated using(verification_status='verified');
drop policy if exists "Authenticated users can read product catalog" on public.products;create policy "Authenticated users can read product catalog" on public.products for select to authenticated using(true);
drop policy if exists "Authenticated users can read verified prices and own reports" on public.price_observations;create policy "Authenticated users can read verified prices and own reports" on public.price_observations for select to authenticated using(verification_status='verified' or submitted_by=(select auth.uid()));
drop policy if exists "Users can submit pending community price reports" on public.price_observations;create policy "Users can submit pending community price reports" on public.price_observations for insert to authenticated with check(submitted_by=(select auth.uid()) and verification_status='pending' and price_type='community_report');
drop policy if exists "Users can update their own pending price reports" on public.price_observations;create policy "Users can update their own pending price reports" on public.price_observations for update to authenticated using(submitted_by=(select auth.uid()) and verification_status='pending') with check(submitted_by=(select auth.uid()) and verification_status='pending' and price_type='community_report');
drop policy if exists "Users can delete their own pending price reports" on public.price_observations;create policy "Users can delete their own pending price reports" on public.price_observations for delete to authenticated using(submitted_by=(select auth.uid()) and verification_status='pending');

create index if not exists stores_owner_user_id_idx on public.stores(owner_user_id);
create index if not exists price_observations_submitted_by_idx on public.price_observations(submitted_by);

create unique index if not exists stores_name_address_city_state_unique on public.stores (lower(name), lower(address), lower(city), lower(state));

create index if not exists stores_brand_slug_idx on public.stores(brand_slug);
