begin;
set local lock_timeout='5s';

-- Seules les images HTTPS du fournisseur sont utilisées à la création ; aucun téléchargement serveur.
create function public.google_profile_avatar(p_value text) returns text
language sql immutable set search_path='' as $$
 select case when length(p_value)<=2048 and p_value ~ '^https://lh[0-9]+[.]googleusercontent[.]com([/?]|$)'
 and p_value !~ '[[:space:][:cntrl:]]' and strpos(p_value,chr(92))=0 then p_value else null end;
$$;
revoke all on function public.google_profile_avatar(text) from public,anon,authenticated;
grant execute on function public.google_profile_avatar(text) to service_role;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
declare base text; candidate text; attempt integer; google boolean:=coalesce(to_jsonb(new)->'raw_app_meta_data'->>'provider','')='google'; proposed text; avatar text;
begin
 if google then
  proposed:=coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'),''),nullif(btrim(new.raw_user_meta_data->>'name'),''));
  avatar:=coalesce(public.google_profile_avatar(new.raw_user_meta_data->>'avatar_url'),public.google_profile_avatar(new.raw_user_meta_data->>'picture'));
 end if;
 base:=public.normalize_profile_username(coalesce(proposed,new.raw_user_meta_data->>'user_name',new.raw_user_meta_data->>'username',split_part(coalesce(new.email,''),'@',1)));
 for attempt in 0..8 loop
  candidate:=case when attempt=0 then base else left(base,15)||'-'||left(encode(sha256(convert_to(new.id::text||':'||attempt::text,'UTF8')),'hex'),16) end;
  begin
   insert into public.profiles(id,username,display_name,avatar_url,bio)
   values(new.id,candidate,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),nullif(new.raw_user_meta_data->>'full_name',''),candidate),avatar,
    coalesce(nullif(btrim(new.raw_user_meta_data->>'bio'),''),nullif(btrim(new.raw_user_meta_data->>'onboarding_bio'),'')));
   return new;
  exception when unique_violation then null;
  end;
 end loop;
 raise exception 'public_username_allocation_failed';
end $$;
revoke all on function public.handle_new_user() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
