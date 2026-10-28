begin;
set local lock_timeout='5s';

do $$ begin
 if to_regclass('public.public_profiles') is null then raise exception 'profile_public_projection_required';end if;
end $$;

revoke select on public.profiles from public,anon,authenticated;
-- Un privilège de colonne historique survivrait à la révocation de table.
do $$ declare columns_list text; begin
 select string_agg(quote_ident(attname),',') into columns_list from pg_attribute
 where attrelid='public.profiles'::regclass and attnum>0 and not attisdropped;
 execute format('revoke select (%s) on public.profiles from public,anon,authenticated',columns_list);
end $$;
grant select on public.profiles to authenticated;
drop policy if exists "public can read profiles" on public.profiles;
create policy profiles_read_own on public.profiles for select to authenticated using (id=(select auth.uid()));
-- Une ancienne politique permissive ne doit pas rouvrir les autres profils.
create policy profiles_read_boundary on public.profiles as restrictive for select to anon,authenticated
 using (id=(select auth.uid()));

commit;
