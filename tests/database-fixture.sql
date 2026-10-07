\set ON_ERROR_STOP on
-- Minimal reproduction of the existing schema; NEVER run on a real project.
do $$ begin
  if current_database() <> 'chibasko_phase0_test' then raise exception 'Test database required'; end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null, display_name text, avatar_url text, bio text,
  xp_points integer not null default 0, last_xp_tick_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "public can read profiles" on public.profiles for select using (true);
create policy "users can update own profile" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);
grant select, update on public.profiles to anon, authenticated;
grant all on public.profiles to service_role;
-- Reproduce even a manually added column-level progression privilege.
grant update (xp_points) on public.profiles to authenticated;
create function public.normalize_profile_username(raw_value text) returns text language sql as $$
  select left(coalesce(nullif(trim(both '-' from regexp_replace(lower(coalesce(raw_value, '')), '[^a-z0-9]+', '-', 'g')), ''), 'joueur'), 24)
$$;
create function public.handle_new_user() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create function public.sync_profile_xp() returns public.profiles language sql as $$ select null::public.profiles $$;
\ir ../supabase/migrations/20260506_password_reset_codes.sql
\ir ../supabase/migrations/20260508_game_submissions.sql
\ir ../supabase/migrations/20260508_game_submissions_workflow_upgrade.sql
-- Simulate permissive historical grants and a policy: corrective SQL must close both.
grant all on public.password_reset_codes, public.game_submissions to anon, authenticated;
grant select (email), update (admin_notes) on public.game_submissions to anon, authenticated;
grant select (code_hash) on public.password_reset_codes to anon, authenticated;
create policy "legacy reset read" on public.password_reset_codes for select using (true);
create policy "legacy public access" on public.game_submissions for all using (true) with check (true);
insert into public.password_reset_codes (email, code_hash, expires_at)
  values ('legacy@example.com', repeat('a', 64), now() + interval '10 minutes');
