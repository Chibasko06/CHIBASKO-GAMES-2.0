alter table public.profiles
  add column if not exists public_handle text;

create or replace function public.slugify_profile_handle(raw_value text)
returns text
language plpgsql
as $$
declare
  sanitized text;
begin
  sanitized := lower(coalesce(raw_value, ''));
  sanitized := regexp_replace(sanitized, '[^a-z0-9]+', '-', 'g');
  sanitized := regexp_replace(sanitized, '^-+|-+$', '', 'g');
  sanitized := left(sanitized, 24);

  if sanitized = '' then
    sanitized := 'joueur';
  end if;

  return sanitized;
end;
$$;

create or replace function public.build_profile_handle(raw_username text, profile_id uuid)
returns text
language plpgsql
as $$
declare
  base_handle text;
  candidate text;
begin
  base_handle := public.slugify_profile_handle(raw_username);
  candidate := base_handle;

  if exists (
    select 1
    from public.profiles
    where public_handle = candidate
      and id <> profile_id
  ) then
    candidate := base_handle || '-' || left(profile_id::text, 6);
  end if;

  return candidate;
end;
$$;

update public.profiles
set public_handle = public.build_profile_handle(username, id)
where public_handle is null
   or btrim(public_handle) = '';

alter table public.profiles
  alter column public_handle set not null;

create unique index if not exists profiles_public_handle_key
on public.profiles(public_handle);
