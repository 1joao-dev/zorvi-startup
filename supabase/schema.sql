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
