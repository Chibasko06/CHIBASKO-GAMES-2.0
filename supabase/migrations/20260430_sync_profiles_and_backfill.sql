create or replace function public.normalize_profile_username(raw_value text)
returns text
language plpgsql
as $$
declare
  normalized text;
begin
  normalized := lower(coalesce(raw_value, ''));
  normalized := regexp_replace(normalized, '[^a-z0-9]+', '-', 'g');
  normalized := regexp_replace(normalized, '(^-+|-+$)', '', 'g');

  if normalized = '' then
    normalized := 'joueur';
  end if;

  return left(normalized, 24);
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
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

  if exists (
    select 1
    from public.profiles
    where username = final_username
      and id <> new.id
  ) then
    final_username := left(final_username, 17) || '-' || substr(new.id::text, 1, 6);
  end if;

  insert into public.profiles (
    id,
    username,
    display_name,
    avatar_url,
    bio,
    xp_points,
    last_xp_tick_at
  )
  values (
    new.id,
    final_username,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      nullif(new.raw_user_meta_data->>'user_name', ''),
      nullif(new.raw_user_meta_data->>'username', ''),
      'Joueur'
    ),
    null,
    null,
    0,
    now()
  )
  on conflict (id) do update
  set
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    last_xp_tick_at = coalesce(public.profiles.last_xp_tick_at, excluded.last_xp_tick_at);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

with missing_users as (
  select
    users.id,
    users.email,
    users.raw_user_meta_data,
    public.normalize_profile_username(
      coalesce(
        users.raw_user_meta_data->>'user_name',
        users.raw_user_meta_data->>'username',
        split_part(coalesce(users.email, ''), '@', 1)
      )
    ) as requested_username,
    row_number() over (
      partition by public.normalize_profile_username(
        coalesce(
          users.raw_user_meta_data->>'user_name',
          users.raw_user_meta_data->>'username',
          split_part(coalesce(users.email, ''), '@', 1)
        )
      )
      order by users.created_at, users.id
    ) as duplicate_rank
  from auth.users as users
  left join public.profiles on profiles.id = users.id
  where profiles.id is null
)
insert into public.profiles (
  id,
  username,
  display_name,
  avatar_url,
  bio,
  xp_points,
  last_xp_tick_at
)
select
  missing_users.id,
  case
    when missing_users.duplicate_rank > 1
      or exists (
        select 1
        from public.profiles existing
        where existing.username = missing_users.requested_username
      )
    then left(missing_users.requested_username, 17) || '-' || substr(missing_users.id::text, 1, 6)
    else missing_users.requested_username
  end,
  coalesce(
    nullif(missing_users.raw_user_meta_data->>'display_name', ''),
    nullif(missing_users.raw_user_meta_data->>'user_name', ''),
    nullif(missing_users.raw_user_meta_data->>'username', ''),
    'Joueur'
  ),
  null,
  null,
  0,
  now()
from missing_users;
