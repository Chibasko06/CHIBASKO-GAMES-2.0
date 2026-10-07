-- Corrective migration for an existing database. Historical values are retained.
begin;

drop function if exists public.sync_profile_xp();

-- Keep account creation; stop explicitly initializing/updating legacy progression.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  final_username text;
begin
  requested_username := coalesce(
    new.raw_user_meta_data->>'user_name',
    new.raw_user_meta_data->>'username',
    split_part(coalesce(new.email, ''), '@', 1)
  );
  final_username := public.normalize_profile_username(requested_username);
  if exists (select 1 from public.profiles where username = final_username and id <> new.id) then
    final_username := left(final_username, 17) || '-' || substr(new.id::text, 1, 6);
  end if;

  insert into public.profiles (id, username, display_name, avatar_url, bio)
  values (
    new.id, final_username,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''),
             nullif(new.raw_user_meta_data->>'user_name', ''),
             nullif(new.raw_user_meta_data->>'username', ''), 'Joueur'),
    null, null
  )
  on conflict (id) do update
  set display_name = coalesce(public.profiles.display_name, excluded.display_name);
  return new;
end;
$$;

-- No trigger is dropped: the Auth -> profile link remains in place.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke update on public.profiles from public, anon, authenticated;
revoke update (xp_points, last_xp_tick_at) on public.profiles from public, anon, authenticated;
grant update (username, display_name, avatar_url, bio) on public.profiles to authenticated;
-- Existing own-profile RLS still applies to these column privileges.

comment on column public.profiles.xp_points is 'Legacy value retained for historical compatibility; no active progression system.';
comment on column public.profiles.last_xp_tick_at is 'Legacy timestamp retained for historical compatibility; no active progression system.';

commit;
