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
create table if not exists public.stores (id uuid primary key default gen_random_uuid(),name text not null,category text not null check(category in ('Farmácia','Mercado','Restaurante','Lojas','Outros')),address text not null,city text not null,state text not null,postal_code text,latitude double precision check(latitude is null or latitude between -90 and 90),longitude double precision check(longitude is null or longitude between -180 and 180),website_url text,brand_name text,brand_slug text,brand_logo_url text,coordinate_precision text,coordinate_source text,geocoded_at timestamptz,geocode_attempted_at timestamptz,source_url text,source_label text,owner_user_id uuid references auth.users(id) on delete set null,verification_status text not null default 'pending' check(verification_status in ('pending','verified','rejected')),created_at timestamptz not null default now());
create index if not exists stores_location_idx on public.stores(latitude,longitude);
create table if not exists public.products (id uuid primary key default gen_random_uuid(),name text not null,normalized_name text not null,brand text,variant text,barcode text,category text not null check(category in ('Farmácia','Mercado','Restaurante','Lojas','Outros')),unit text,created_at timestamptz not null default now());
create unique index if not exists products_barcode_unique_idx on public.products(barcode) where barcode is not null;
create index if not exists products_name_search_idx on public.products using gin(to_tsvector('portuguese',coalesce(name,'')||' '||coalesce(brand,'')||' '||coalesce(variant,'')));
create table if not exists public.price_observations (id uuid primary key default gen_random_uuid(),store_id uuid not null references public.stores(id) on delete cascade,product_id uuid not null references public.products(id) on delete cascade,price numeric(12,2) not null check(price>0),currency text not null default 'BRL',price_type text not null check(price_type in ('official_site','in_store','estimated','community_report')),source_url text,source_label text not null,observed_at timestamptz not null default now(),availability_status text not null default 'unknown' check(availability_status in ('available','unavailable','unknown')),verification_status text not null default 'pending' check(verification_status in ('pending','verified','rejected')),confidence_score numeric(4,3) check(confidence_score is null or confidence_score between 0 and 1),submitted_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),constraint official_price_requires_source check(price_type<>'official_site' or source_url is not null));
create index if not exists price_observations_product_price_idx on public.price_observations(product_id,price) where verification_status='verified';
create index if not exists price_observations_store_idx on public.price_observations(store_id,observed_at desc);
alter table public.stores enable row level security;alter table public.products enable row level security;alter table public.price_observations enable row level security;
grant select on public.stores,public.products,public.price_observations to authenticated;grant insert,update,delete on public.price_observations to authenticated;grant select,update on public.stores to service_role;grant select,update on public.stores to service_role;
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

-- Google Places: guarda somente o Place ID isento das restrições de cache.
alter table public.stores
  add column if not exists google_place_id text,
  add column if not exists google_match_status text,
  add column if not exists google_checked_at timestamptz,
  add column if not exists google_verified_at timestamptz;

alter table public.stores
  drop constraint if exists stores_google_match_status_check;

alter table public.stores
  add constraint stores_google_match_status_check
  check (
    google_match_status is null
    or google_match_status = any (array['verified'::text, 'needs_review'::text, 'not_found'::text, 'api_error'::text])
  );

create index if not exists stores_google_place_id_idx
  on public.stores (google_place_id)
  where google_place_id is not null;

create index if not exists stores_google_match_status_idx
  on public.stores (google_match_status)
  where google_match_status is not null;


-- Product catalog enrichment (kept in sync with migrations).

alter table public.products
  add column if not exists subcategory text,
  add column if not exists source_provider text not null default 'zorvi_manual',
  add column if not exists source_product_id text,
  add column if not exists source_url text,
  add column if not exists image_url text,
  add column if not exists description text,
  add column if not exists country_code text not null default 'BR',
  add column if not exists source_updated_at timestamptz,
  add column if not exists is_active boolean not null default true;
create unique index if not exists products_source_identity_idx on public.products(source_provider, source_product_id);
create index if not exists products_subcategory_idx on public.products(category, subcategory);
create index if not exists products_source_provider_idx on public.products(source_provider);

create table if not exists public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  source_provider text not null default 'zorvi_curated',
  created_at timestamptz not null default now(),
  constraint product_aliases_product_normalized_unique unique(product_id, normalized_alias),
  constraint product_aliases_alias_length check(char_length(alias) between 1 and 160)
);
create index if not exists product_aliases_normalized_alias_idx on public.product_aliases(normalized_alias);
create index if not exists product_aliases_product_id_idx on public.product_aliases(product_id);
alter table public.product_aliases enable row level security;
grant select on public.product_aliases to authenticated;
grant select, insert, update, delete on public.product_aliases to service_role;
drop policy if exists "Authenticated users can read product aliases" on public.product_aliases;
create policy "Authenticated users can read product aliases" on public.product_aliases for select to authenticated using(true);

create table if not exists public.product_catalog_search_cache (
  query_key text primary key,
  provider text not null,
  fetched_at timestamptz not null default now(),
  result_count integer not null default 0 check(result_count >= 0)
);
alter table public.product_catalog_search_cache enable row level security;
grant select, insert, update, delete on public.product_catalog_search_cache to service_role;

create or replace function public.normalize_product_text(input text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog, public
as $$
  select trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        translate(lower(coalesce(input, '')),
          'áàâãäéèêëíìîïóòôõöúùûüçñ',
          'aaaaaeeeeiiiiooooouuuucn'),
        '([0-9])([a-z])', '\1 \2', 'g'
      ),
      '([a-z])([0-9])', '\1 \2', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;

revoke all on function public.normalize_product_text(text) from public;
grant execute on function public.normalize_product_text(text) to authenticated, service_role;

create or replace function public.search_product_catalog(search_query text, result_limit integer default 20)
returns setof public.products
language sql stable security invoker set search_path = public as $$
  with q as (select public.normalize_product_text(search_query) as value)
  select p.*
  from public.products p cross join q
  where p.is_active = true and q.value <> ''
    and (
      p.normalized_name ilike '%' || q.value || '%'
      or public.normalize_product_text(p.name) ilike '%' || q.value || '%'
      or exists (select 1 from public.product_aliases a where a.product_id=p.id and a.normalized_alias ilike '%' || q.value || '%')
      or exists (
        select 1 from regexp_split_to_table(q.value, '\\s+') as term
        where length(term)>=2 and (
          p.normalized_name ilike '%' || term || '%'
          or exists (select 1 from public.product_aliases a where a.product_id=p.id and a.normalized_alias ilike '%' || term || '%')
        )
      )
    )
  order by case when p.normalized_name=q.value then 0 when p.normalized_name like q.value || '%' then 1 else 2 end, p.name
  limit least(greatest(coalesce(result_limit,20),1),50);
$$;
revoke all on function public.search_product_catalog(text,integer) from public;
grant execute on function public.search_product_catalog(text,integer) to authenticated, service_role;

insert into public.products(name,normalized_name,brand,variant,unit,category,subcategory,source_provider,source_product_id,description,country_code,is_active)
values
('Arroz tipo 1 5 kg','arroz tipo 1 5 kg',null,'Pacote de 5 kg','5 kg','Mercado','Mercearia','zorvi_curated','market-rice-type1-5kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Arroz tipo 1 1 kg','arroz tipo 1 1 kg',null,'Pacote de 1 kg','1 kg','Mercado','Mercearia','zorvi_curated','market-rice-type1-1kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Feijão carioca 1 kg','feijao carioca 1 kg',null,'Pacote de 1 kg','1 kg','Mercado','Mercearia','zorvi_curated','market-beans-carioca-1kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Feijão preto 1 kg','feijao preto 1 kg',null,'Pacote de 1 kg','1 kg','Mercado','Mercearia','zorvi_curated','market-beans-black-1kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Açúcar cristal 1 kg','acucar cristal 1 kg',null,'Pacote de 1 kg','1 kg','Mercado','Mercearia','zorvi_curated','market-sugar-crystal-1kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Açúcar refinado 1 kg','acucar refinado 1 kg',null,'Pacote de 1 kg','1 kg','Mercado','Mercearia','zorvi_curated','market-sugar-refined-1kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Café torrado e moído 500 g','cafe torrado e moido 500 g',null,'Pacote de 500 g','500 g','Mercado','Mercearia','zorvi_curated','market-coffee-ground-500g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Óleo de soja 900 ml','oleo de soja 900 ml',null,'Garrafa de 900 ml','900 ml','Mercado','Mercearia','zorvi_curated','market-soy-oil-900ml','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Leite integral UHT 1 L','leite integral uht 1 l',null,'Caixa de 1 litro','1 L','Mercado','Laticínios','zorvi_curated','market-milk-whole-1l','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Leite desnatado UHT 1 L','leite desnatado uht 1 l',null,'Caixa de 1 litro','1 L','Mercado','Laticínios','zorvi_curated','market-milk-skim-1l','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Leite em pó integral 400 g','leite em po integral 400 g',null,'Pacote de 400 g','400 g','Mercado','Laticínios','zorvi_curated','market-milk-powder-400g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Macarrão espaguete 500 g','macarrao espaguete 500 g',null,'Pacote de 500 g','500 g','Mercado','Mercearia','zorvi_curated','market-pasta-spaghetti-500g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Farinha de trigo 1 kg','farinha de trigo 1 kg',null,'Pacote de 1 kg','1 kg','Mercado','Mercearia','zorvi_curated','market-wheat-flour-1kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Farinha de mandioca 1 kg','farinha de mandioca 1 kg',null,'Pacote de 1 kg','1 kg','Mercado','Mercearia','zorvi_curated','market-cassava-flour-1kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Flocão de milho 500 g','flocao de milho 500 g',null,'Pacote de 500 g','500 g','Mercado','Mercearia','zorvi_curated','market-corn-flakes-500g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Ovos brancos 12 unidades','ovos brancos 12 unidades',null,'Bandeja com 12 unidades','12 un','Mercado','Ovos e laticínios','zorvi_curated','market-eggs-12','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Peito de frango por kg','peito de frango por kg',null,'Preço por quilograma','kg','Mercado','Carnes','zorvi_curated','market-chicken-breast-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Carne bovina acém por kg','carne bovina acem por kg',null,'Preço por quilograma','kg','Mercado','Carnes','zorvi_curated','market-beef-chuck-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Carne moída por kg','carne moida por kg',null,'Preço por quilograma','kg','Mercado','Carnes','zorvi_curated','market-ground-beef-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Batata inglesa por kg','batata inglesa por kg',null,'Preço por quilograma','kg','Mercado','Hortifruti','zorvi_curated','market-potato-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Cebola por kg','cebola por kg',null,'Preço por quilograma','kg','Mercado','Hortifruti','zorvi_curated','market-onion-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Tomate por kg','tomate por kg',null,'Preço por quilograma','kg','Mercado','Hortifruti','zorvi_curated','market-tomato-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Banana prata por kg','banana prata por kg',null,'Preço por quilograma','kg','Mercado','Hortifruti','zorvi_curated','market-banana-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Maçã por kg','maca por kg',null,'Preço por quilograma','kg','Mercado','Hortifruti','zorvi_curated','market-apple-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Laranja por kg','laranja por kg',null,'Preço por quilograma','kg','Mercado','Hortifruti','zorvi_curated','market-orange-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Refrigerante sabor cola 2 L','refrigerante sabor cola 2 l',null,'Garrafa de 2 litros','2 L','Mercado','Bebidas','zorvi_curated','market-cola-soda-2l','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Água mineral sem gás 1,5 L','agua mineral sem gas 1 5 l',null,'Garrafa de 1,5 litro','1,5 L','Mercado','Bebidas','zorvi_curated','market-water-1-5l','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Iogurte natural 170 g','iogurte natural 170 g',null,'Pote de 170 g','170 g','Mercado','Laticínios','zorvi_curated','market-yogurt-170g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Queijo muçarela por kg','queijo mucarela por kg',null,'Preço por quilograma','kg','Mercado','Frios e laticínios','zorvi_curated','market-mozzarella-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Margarina 500 g','margarina 500 g',null,'Pote de 500 g','500 g','Mercado','Frios e laticínios','zorvi_curated','market-margarine-500g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Manteiga 200 g','manteiga 200 g',null,'Tablete de 200 g','200 g','Mercado','Frios e laticínios','zorvi_curated','market-butter-200g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Pão de forma 450 g','pao de forma 450 g',null,'Pacote de 450 g','450 g','Mercado','Padaria','zorvi_curated','market-sliced-bread-450g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Biscoito cream cracker 350 g','biscoito cream cracker 350 g',null,'Pacote de 350 g','350 g','Mercado','Mercearia','zorvi_curated','market-cracker-350g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Molho de tomate 300 g','molho de tomate 300 g',null,'Sachê de 300 g','300 g','Mercado','Mercearia','zorvi_curated','market-tomato-sauce-300g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Sal refinado 1 kg','sal refinado 1 kg',null,'Pacote de 1 kg','1 kg','Mercado','Mercearia','zorvi_curated','market-salt-1kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Detergente líquido 500 ml','detergente liquido 500 ml',null,'Frasco de 500 ml','500 ml','Mercado','Limpeza','zorvi_curated','market-dish-detergent-500ml','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Água sanitária 1 L','agua sanitaria 1 l',null,'Frasco de 1 litro','1 L','Mercado','Limpeza','zorvi_curated','market-bleach-1l','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Desinfetante 2 L','desinfetante 2 l',null,'Frasco de 2 litros','2 L','Mercado','Limpeza','zorvi_curated','market-disinfectant-2l','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Sabão em pó 1,6 kg','sabao em po 1 6 kg',null,'Pacote de 1,6 kg','1,6 kg','Mercado','Limpeza','zorvi_curated','market-laundry-powder-1-6kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Amaciante de roupas 2 L','amaciante de roupas 2 l',null,'Frasco de 2 litros','2 L','Mercado','Limpeza','zorvi_curated','market-fabric-softener-2l','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Papel higiênico pacote com 12 rolos','papel higienico pacote com 12 rolos',null,'Pacote com 12 rolos','12 rolos','Mercado','Higiene','zorvi_curated','market-toilet-paper-12','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Papel toalha pacote com 2 rolos','papel toalha pacote com 2 rolos',null,'Pacote com 2 rolos','2 rolos','Mercado','Higiene','zorvi_curated','market-paper-towel-2','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Esponja dupla face','esponja dupla face',null,'Unidade','1 un','Mercado','Limpeza','zorvi_curated','market-sponge','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Sabão em barra pacote com 5 unidades','sabao em barra pacote com 5 unidades',null,'Pacote com 5 unidades','5 un','Mercado','Limpeza','zorvi_curated','market-bar-soap-5','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Saco para lixo 30 L','saco para lixo 30 l',null,'Pacote de sacos de 30 litros','30 L','Mercado','Limpeza','zorvi_curated','market-trash-bags-30l','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Shampoo 350 ml','shampoo 350 ml',null,'Frasco de 350 ml','350 ml','Farmácia','Higiene pessoal','zorvi_curated','pharmacy-shampoo-350ml','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Condicionador 350 ml','condicionador 350 ml',null,'Frasco de 350 ml','350 ml','Farmácia','Higiene pessoal','zorvi_curated','pharmacy-conditioner-350ml','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Escova dental adulta','escova dental adulta',null,'Unidade','1 un','Farmácia','Higiene bucal','zorvi_curated','pharmacy-toothbrush-adult','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Desodorante aerosol 150 ml','desodorante aerosol 150 ml',null,'Frasco de 150 ml','150 ml','Farmácia','Higiene pessoal','zorvi_curated','pharmacy-deodorant-150ml','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Fralda descartável tamanho M pacote','fralda descartavel tamanho m pacote',null,'Pacote tamanho M','Pacote','Farmácia','Higiene e bebê','zorvi_curated','pharmacy-diaper-size-m','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Absorvente higiênico pacote','absorvente higienico pacote',null,'Pacote','Pacote','Farmácia','Higiene pessoal','zorvi_curated','pharmacy-sanitary-pads','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Álcool 70% 1 L','alcool 70 1 l',null,'Frasco de 1 litro','1 L','Farmácia','Cuidados pessoais','zorvi_curated','pharmacy-alcohol-70-1l','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Gaze estéril pacote','gaze esteril pacote',null,'Pacote','Pacote','Farmácia','Primeiros socorros','zorvi_curated','pharmacy-sterile-gauze','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Algodão hidrófilo 50 g','algodao hidrofilo 50 g',null,'Pacote de 50 g','50 g','Farmácia','Primeiros socorros','zorvi_curated','pharmacy-cotton-50g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Sabonete em barra 90 g','sabonete em barra 90 g',null,'Unidade de 90 g','90 g','Farmácia','Higiene pessoal','zorvi_curated','pharmacy-soap-90g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Hidratante corporal 200 ml','hidratante corporal 200 ml',null,'Frasco de 200 ml','200 ml','Farmácia','Cuidados pessoais','zorvi_curated','pharmacy-body-lotion-200ml','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Lenços umedecidos pacote','lencos umedecidos pacote',null,'Pacote','Pacote','Farmácia','Higiene e bebê','zorvi_curated','pharmacy-wet-wipes','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Protetor solar FPS 50 200 ml','protetor solar fps 50 200 ml',null,'Embalagem de 200 ml','200 ml','Farmácia','Cuidados pessoais','zorvi_curated','pharmacy-sunscreen-fps50-200ml','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true)
on conflict (source_provider,source_product_id) do update set
  name=excluded.name, normalized_name=excluded.normalized_name, variant=excluded.variant, unit=excluded.unit,
  category=excluded.category, subcategory=excluded.subcategory, description=excluded.description,
  country_code=excluded.country_code, is_active=true;

insert into public.product_aliases(product_id,alias,normalized_alias,source_provider)
select p.id,p.name,public.normalize_product_text(p.name),'zorvi_catalog'
from public.products p where p.is_active
on conflict (product_id,normalized_alias) do nothing;

insert into public.product_aliases(product_id,alias,normalized_alias,source_provider)
select p.id,v.alias,public.normalize_product_text(v.alias),'zorvi_curated'
from (values
('market-rice-type1-5kg','arroz'),
('market-rice-type1-5kg','arroz branco'),
('market-rice-type1-5kg','arroz tipo um'),
('market-rice-type1-5kg','arroz 5kg'),
('market-rice-type1-1kg','arroz 1kg'),
('market-rice-type1-1kg','arroz tipo 1'),
('market-beans-carioca-1kg','feijão'),
('market-beans-carioca-1kg','feijao carioca'),
('market-beans-carioca-1kg','feijão carioca'),
('market-beans-carioca-1kg','feijao'),
('market-beans-black-1kg','feijão preto'),
('market-beans-black-1kg','feijao preto'),
('market-coffee-ground-500g','café'),
('market-coffee-ground-500g','cafe moido'),
('market-coffee-ground-500g','café moído'),
('market-coffee-ground-500g','cafe em pó'),
('market-soy-oil-900ml','óleo'),
('market-soy-oil-900ml','oleo de cozinha'),
('market-soy-oil-900ml','óleo de soja'),
('market-milk-whole-1l','leite'),
('market-milk-whole-1l','leite integral'),
('market-milk-whole-1l','leite de caixa'),
('market-milk-whole-1l','leite longa vida'),
('market-milk-whole-1l','leite uht'),
('market-milk-skim-1l','leite desnatado'),
('market-milk-skim-1l','leite magro'),
('market-milk-powder-400g','leite em pó'),
('market-milk-powder-400g','leite em po'),
('market-pasta-spaghetti-500g','macarrão'),
('market-pasta-spaghetti-500g','macarrao'),
('market-pasta-spaghetti-500g','espaguete'),
('market-eggs-12','ovos'),
('market-eggs-12','dúzia de ovos'),
('market-eggs-12','duzia de ovos'),
('market-chicken-breast-kg','peito de frango'),
('market-chicken-breast-kg','frango'),
('market-ground-beef-kg','carne moída'),
('market-ground-beef-kg','carne moida'),
('market-potato-kg','batata'),
('market-onion-kg','cebola'),
('market-tomato-kg','tomate'),
('market-banana-kg','banana'),
('market-toilet-paper-12','papel higiênico'),
('market-toilet-paper-12','papel higienico'),
('market-dish-detergent-500ml','detergente'),
('market-dish-detergent-500ml','lava louças'),
('market-dish-detergent-500ml','lava loucas'),
('market-laundry-powder-1-6kg','sabão em pó'),
('market-laundry-powder-1-6kg','sabao em po'),
('pharmacy-shampoo-350ml','shampoo'),
('pharmacy-shampoo-350ml','xampu'),
('pharmacy-conditioner-350ml','condicionador'),
('pharmacy-deodorant-150ml','desodorante'),
('pharmacy-diaper-size-m','fralda'),
('pharmacy-diaper-size-m','fralda tamanho m'),
('pharmacy-diaper-size-m','fralda m'),
('pharmacy-sanitary-pads','absorvente'),
('pharmacy-sanitary-pads','absorvente feminino'),
('pharmacy-sunscreen-fps50-200ml','protetor solar'),
('pharmacy-sunscreen-fps50-200ml','protetor solar fps 50')
) as v(source_product_id,alias)
join public.products p on p.source_provider='zorvi_curated' and p.source_product_id=v.source_product_id
where public.normalize_product_text(v.alias)<>''
on conflict (product_id,normalized_alias) do nothing;

grant select, insert, update, delete on public.products to service_role;


-- Catalog cache hardening.

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


-- Ranked catalog search and catalog summary.

create or replace function public.search_product_catalog(search_query text, result_limit integer default 20)
returns setof public.products
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select public.normalize_product_text(search_query) as value
  )
  select p.*
  from public.products p
  cross join q
  where p.is_active = true
    and q.value <> ''
    and (
      p.normalized_name ilike '%' || q.value || '%'
      or public.normalize_product_text(p.name) ilike '%' || q.value || '%'
      or exists (
        select 1 from public.product_aliases a
        where a.product_id = p.id
          and a.normalized_alias ilike '%' || q.value || '%'
      )
      or exists (
        select 1
        from regexp_split_to_table(q.value, '\s+') as term
        where length(term) >= 2
          and (
            p.normalized_name ilike '%' || term || '%'
            or exists (
              select 1 from public.product_aliases a
              where a.product_id = p.id
                and a.normalized_alias ilike '%' || term || '%'
            )
          )
      )
    )
  order by
    case
      when p.normalized_name = q.value then 0
      when p.normalized_name like q.value || '%' then 1
      else 2
    end,
    (
      select count(*)
      from regexp_split_to_table(q.value, '\s+') as term
      where length(term) >= 2
        and (
          p.normalized_name ilike '%' || term || '%'
          or exists (
            select 1 from public.product_aliases a
            where a.product_id = p.id
              and a.normalized_alias ilike '%' || term || '%'
          )
        )
    ) desc,
    p.name
  limit least(greatest(coalesce(result_limit, 20), 1), 50);
$$;

create or replace function public.get_product_catalog_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'total_count',
    (select count(*)::integer from public.products where is_active = true),
    'category_counts',
    coalesce(
      (
        select jsonb_object_agg(category, product_count)
        from (
          select category, count(*)::integer as product_count
          from public.products
          where is_active = true
          group by category
        ) as category_summary
      ),
      '{}'::jsonb
    )
  );
$$;

revoke all on function public.search_product_catalog(text, integer) from public;
grant execute on function public.search_product_catalog(text, integer) to authenticated, service_role;
revoke all on function public.get_product_catalog_summary() from public;
grant execute on function public.get_product_catalog_summary() to authenticated, service_role;


-- Ignore generic units in catalog search.

create or replace function public.search_product_catalog(search_query text, result_limit integer default 20)
returns setof public.products
language sql
stable
security invoker
set search_path = public
as $$
  with q as (select public.normalize_product_text(search_query) as value)
  select p.*
  from public.products p
  cross join q
  where p.is_active = true
    and q.value <> ''
    and (
      p.normalized_name ilike '%' || q.value || '%'
      or public.normalize_product_text(p.name) ilike '%' || q.value || '%'
      or exists (
        select 1 from public.product_aliases a
        where a.product_id = p.id and a.normalized_alias ilike '%' || q.value || '%'
      )
      or exists (
        select 1
        from regexp_split_to_table(q.value, '\s+') as term
        where (length(term) >= 3 or term ~ '^[0-9]{2,}$')
          and (
            p.normalized_name ilike '%' || term || '%'
            or exists (
              select 1 from public.product_aliases a
              where a.product_id = p.id and a.normalized_alias ilike '%' || term || '%'
            )
          )
      )
    )
  order by
    case
      when p.normalized_name = q.value then 0
      when p.normalized_name like q.value || '%' then 1
      else 2
    end,
    (
      select count(*)
      from regexp_split_to_table(q.value, '\s+') as term
      where (length(term) >= 3 or term ~ '^[0-9]{2,}$')
        and (
          p.normalized_name ilike '%' || term || '%'
          or exists (
            select 1 from public.product_aliases a
            where a.product_id = p.id and a.normalized_alias ilike '%' || term || '%'
          )
        )
    ) desc,
    p.name
  limit least(greatest(coalesce(result_limit, 20), 1), 50);
$$;
revoke all on function public.search_product_catalog(text, integer) from public;
grant execute on function public.search_product_catalog(text, integer) to authenticated, service_role;


-- Enforce exact size and numeric presentation matches.

create or replace function public.search_product_catalog(search_query text, result_limit integer default 20)
returns setof public.products
language sql
stable
security invoker
set search_path = public
as $$
  with q as (select public.normalize_product_text(search_query) as value)
  select p.*
  from public.products p
  cross join q
  where p.is_active = true
    and q.value <> ''
    and (
      p.normalized_name ilike '%' || q.value || '%'
      or public.normalize_product_text(p.name) ilike '%' || q.value || '%'
      or exists (
        select 1 from public.product_aliases a
        where a.product_id = p.id and a.normalized_alias ilike '%' || q.value || '%'
      )
      or exists (
        select 1
        from regexp_split_to_table(q.value, '\s+') as term
        where (length(term) >= 3 or term ~ '^[0-9]+$' or term in ('pp','p','m','g','gg','xg','xgg','xggg'))
          and (
            p.normalized_name ilike '%' || term || '%'
            or exists (
              select 1 from public.product_aliases a
              where a.product_id = p.id and a.normalized_alias ilike '%' || term || '%'
            )
          )
      )
    )
    and not exists (
      select 1
      from regexp_split_to_table(q.value, '\s+') as query_token
      where query_token in ('pp','p','m','g','gg','xg','xgg','xggg')
        and not exists (
          select 1
          from regexp_split_to_table(
            public.normalize_product_text(concat_ws(' ', p.normalized_name, p.variant, p.unit)),
            '\s+'
          ) as product_token
          where product_token = query_token
        )
    )
    and not exists (
      select 1
      from regexp_split_to_table(q.value, '\s+') as query_token
      where query_token ~ '^[0-9]+$'
        and not exists (
          select 1
          from regexp_split_to_table(
            public.normalize_product_text(concat_ws(' ', p.normalized_name, p.variant, p.unit)),
            '\s+'
          ) as product_token
          where product_token = query_token
        )
    )
  order by
    case
      when p.normalized_name = q.value then 0
      when p.normalized_name like q.value || '%' then 1
      else 2
    end,
    (
      select count(*)
      from regexp_split_to_table(q.value, '\s+') as term
      where (length(term) >= 3 or term ~ '^[0-9]+$' or term in ('pp','p','m','g','gg','xg','xgg','xggg'))
        and (
          p.normalized_name ilike '%' || term || '%'
          or exists (
            select 1 from public.product_aliases a
            where a.product_id = p.id and a.normalized_alias ilike '%' || term || '%'
          )
        )
    ) desc,
    p.name
  limit least(greatest(coalesce(result_limit, 20), 1), 50);
$$;
revoke all on function public.search_product_catalog(text, integer) from public;
grant execute on function public.search_product_catalog(text, integer) to authenticated, service_role;
