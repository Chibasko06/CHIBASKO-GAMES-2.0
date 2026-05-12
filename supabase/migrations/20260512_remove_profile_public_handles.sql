drop index if exists public.profiles_public_handle_key;

alter table public.profiles
  drop column if exists public_handle;

drop function if exists public.build_profile_handle(text, uuid);
