\set ON_ERROR_STOP on
-- This fixture runs ONLY in the runner's newly initialized loopback cluster.
\ir game-catalogue-db.sql
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
create table public.profiles(id uuid primary key references auth.users(id), username text);
create table public.categories(id uuid primary key default gen_random_uuid(), name text);
create table public.game_categories(game_id uuid references public.games(id), category_id uuid references public.categories(id));
create table public.faq_entries(id uuid primary key default gen_random_uuid(), question text, is_published boolean default true);
create table public.game_submissions(id uuid primary key default gen_random_uuid(), email text, admin_notes text);
grant all on public.games, public.categories, public.game_categories, public.faq_entries, public.game_submissions to anon, authenticated;
grant update(is_published,is_beta,multiplayer_game_id) on public.games to anon, authenticated;
grant select(email),update(admin_notes) on public.game_submissions to authenticated;
create policy "legacy permissive" on public.games for all using(true) with check(true);
insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
create table public.admin_catalogue_snapshot as select * from public.games;
\ir ../supabase/migrations/20261013000100_secure_admin.sql
do $$ begin
 if exists(select 1 from public.admin_users) then raise exception 'Migration granted admin automatically';end if;
 if exists((select * from public.admin_catalogue_snapshot except select * from public.games) union all (select * from public.games except select * from public.admin_catalogue_snapshot)) then raise exception 'Existing games changed';end if;
end $$;
-- Manual maintenance operation in the fixture only, never in the migration.
insert into public.admin_users(user_id) values('00000000-0000-4000-8000-000000000002');
set role anon;
do $$ begin
 if (select count(*) from public.games)<>81 then raise exception 'Public catalogue broken or draft leaked';end if;
 begin insert into public.games(title,slug,game_url) values('Forbidden','forbidden','https://example.com');raise exception 'Anonymous insert succeeded';exception when insufficient_privilege then null;end;
 begin update public.games set is_published=false;raise exception 'Anonymous update succeeded';exception when insufficient_privilege then null;end;
 begin delete from public.games;raise exception 'Anonymous delete succeeded';exception when insufficient_privilege then null;end;
 begin perform user_id from public.admin_users;raise exception 'Anonymous membership read succeeded';exception when insufficient_privilege then null;end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $$ begin
 if exists(select user_id from public.admin_users) then raise exception 'Other account membership leaked';end if;
 begin insert into public.admin_users(user_id) values(auth.uid());raise exception 'Self elevation succeeded';exception when insufficient_privilege then null;end;
 begin update public.admin_users set user_id=auth.uid();raise exception 'Role alteration succeeded';exception when insufficient_privilege then null;end;
 begin update public.games set is_beta=true,multiplayer_game_id='evil';raise exception 'Catalogue update succeeded';exception when insufficient_privilege then null;end;
 begin insert into public.games(title,slug,game_url) values('Forbidden','forbidden','https://example.com');raise exception 'Normal insert succeeded';exception when insufficient_privilege then null;end;
 begin delete from public.games;raise exception 'Normal delete succeeded';exception when insufficient_privilege then null;end;
 begin perform email from public.game_submissions;raise exception 'Private submissions leaked';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$ begin
 if (select count(user_id) from public.admin_users)<>1 then raise exception 'Own membership unavailable';end if;
 begin update public.games set is_published=true;raise exception 'Admin JWT wrote directly';exception when insufficient_privilege then null;end;
 begin delete from public.admin_users;raise exception 'Admin JWT changed membership';exception when insufficient_privilege then null;end;
end $$;
reset role;
set role service_role;
insert into public.games(title,slug,game_url) values('Admin CRUD','admin-crud','https://example.com');
update public.games set is_published=false,is_beta=true where slug='admin-crud';
do $$ begin if not exists(select 1 from public.games where slug='admin-crud' and not is_published and is_beta) then raise exception 'Server CRUD broken';end if;end $$;
delete from public.games where slug='admin-crud';
reset role;
do $$ declare r text;t text;p text; begin
 foreach r in array array['anon','authenticated'] loop
  foreach t in array array['games','categories','game_categories','faq_entries','game_submissions'] loop
   foreach p in array array['INSERT','UPDATE','DELETE'] loop
    if has_table_privilege(r,'public.'||t,p) then raise exception '% can % %',r,p,t;end if;
   end loop;
  end loop;
  if has_column_privilege(r,'public.games','is_published','UPDATE') or has_column_privilege(r,'public.game_submissions','admin_notes','UPDATE') then raise exception 'Column grants survived';end if;
 end loop;
end $$;
