\set ON_ERROR_STOP on
-- Socle historique non créé par les migrations versionnées, réservé au cluster jetable.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to anon,authenticated,service_role;
grant select on auth.users to service_role;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique, display_name text, avatar_url text, bio text,
 xp_points integer not null default 0, last_xp_tick_at timestamptz default now(), created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "public can read profiles" on public.profiles for select using(true);
create policy "users can update own profile" on public.profiles for update using(auth.uid()=id) with check(auth.uid()=id);
grant select,update on public.profiles to anon,authenticated;
grant all on public.profiles to service_role;
create table public.games (
 id uuid primary key default gen_random_uuid(),title text not null,slug text not null unique,game_url text not null,
 thumbnail_url text,description text,developer_name text,release_date_text text,mobile_compatible text,
 technology text,provider_name text,source_page_url text,views_count integer not null default 0,
 play_count integer not null default 0,is_published boolean not null default true,created_at timestamptz not null default now()
);
create table public.categories(id uuid primary key default gen_random_uuid(),name text not null,slug text not null unique,created_at timestamptz not null default now());
alter table public.games enable row level security;
create policy "public can read published games" on public.games for select using(is_published=true);
grant select on public.games to anon,authenticated;
grant all on public.games to service_role;
create table public.game_categories(id uuid primary key default gen_random_uuid(),game_id uuid not null references public.games(id) on delete cascade,
 category_id uuid not null references public.categories(id) on delete cascade,created_at timestamptz not null default now(),unique(game_id,category_id));
create table public.favorites(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,
 game_id uuid not null references public.games(id) on delete cascade,created_at timestamptz not null default now(),unique(user_id,game_id));
create table public.play_history(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,
 game_id uuid not null references public.games(id) on delete cascade,played_at timestamptz not null default now());
alter table public.favorites enable row level security;
alter table public.play_history enable row level security;
create policy favorites_owner on public.favorites for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy history_owner on public.play_history for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
grant select,insert,update,delete on public.favorites,public.play_history to authenticated,service_role;
-- Reproduit les privilèges par défaut historiques de Supabase pour les tables publiques.
alter default privileges in schema public grant select,insert,update,delete on tables to anon,authenticated,service_role;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[],owner uuid references auth.users(id),owner_id text);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid references auth.users(id),owner_id text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
