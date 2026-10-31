\set ON_ERROR_STOP on
-- Run using a separately verified database connection. This transaction cannot write.
begin transaction read only;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
select current_database() as database_name, current_setting('transaction_read_only') as read_only,
       current_setting('server_version') as server_version;

-- Missing prerequisites block the migration batch. Presence alone is not a drift check.
select name, to_regclass(name) is not null as present
from unnest(array['auth.users','public.games','public.profiles','public.admin_users']) as name;
select table_schema,table_name,column_name,data_type,is_nullable
from information_schema.columns
where (table_schema='auth' and table_name='users' and column_name='id')
   or (table_schema='public' and table_name='games' and column_name in
       ('id','slug','title','is_published','game_type','multiplayer_game_id','active_version_id'))
   or (table_schema='public' and table_name='profiles' and column_name in ('id','username'))
   or (table_schema='public' and table_name='admin_users' and column_name='user_id')
order by table_schema,table_name,column_name;
select rolname,rolbypassrls from pg_roles where rolname in ('anon','authenticated','service_role');
select to_regprocedure('gen_random_uuid()') is not null as uuid_generator_present;
select to_regclass('supabase_migrations.schema_migrations') is not null as ledger_present;
-- The ledger may be absent on a manually managed installation.
do $$ begin
 if to_regclass('supabase_migrations.schema_migrations') is not null then
   raise notice 'Read version/name from supabase_migrations.schema_migrations separately; reconcile with file SHA-256 inventory.';
 end if;
end $$;

-- Collision / post-migration inventory. No table content or credential hash is read.
select c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) as owner,
       c.relacl
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p')
 order by c.relname;
select p.oid::regprocedure::text as signature,p.prosecdef,p.proconfig,p.proacl,
       md5(pg_get_functiondef(p.oid)) as definition_fingerprint
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (p.proname like 'catalogue\_%' escape '\' or p.proname like 'moderation\_%' escape '\' or p.proname like 'account\_%' escape '\' or p.proname like 'social\_%' escape '\' or p.proname like 'contact\_%' escape '\' or p.proname like 'distribution\_%' escape '\'
 or p.proname in ('valid_public_username','reserve_profile_username','public_profile_resolve','admin_console_users','admin_console_overview','admin_console_deletions','public_profiles_page','admin_save_game','set_active_game_version','guard_game_version','guard_active_game_version','get_published_game_runtimes'))
order by signature;
select p.oid::regprocedure::text as signature,r.role_name,
       has_function_privilege(r.role_name,p.oid,'EXECUTE') as can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
cross join (values('anon'),('authenticated'),('service_role')) as r(role_name)
where n.nspname='public' and p.prokind='f'
 and (p.proname like 'catalogue\_%' escape '\' or p.proname like 'moderation\_%' escape '\' or p.proname like 'account\_%' escape '\' or p.proname like 'social\_%' escape '\' or p.proname like 'contact\_%' escape '\' or p.proname like 'distribution\_%' escape '\' or p.proname in ('valid_public_username','reserve_profile_username','public_profile_resolve','admin_console_users','admin_console_overview','admin_console_deletions','public_profiles_page','admin_save_game','set_active_game_version','get_published_game_runtimes'))
order by signature,role_name;
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' order by tablename,policyname;
select table_name,grantee,privilege_type from information_schema.role_table_grants
where table_schema='public' and grantee in ('anon','authenticated','service_role')
order by table_name,grantee,privilege_type;
select table_name,column_name,grantee,privilege_type from information_schema.column_privileges
where table_schema='public' and table_name='games' and grantee in ('anon','authenticated')
order by column_name,grantee,privilege_type;
select c.conrelid::regclass::text as table_name,c.conname,c.contype,c.convalidated,
       pg_get_constraintdef(c.oid) as definition
from pg_constraint c join pg_namespace n on n.oid=c.connamespace
where n.nspname='public' order by table_name,c.conname;
select t.tgrelid::regclass::text as table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal order by table_name,t.tgname;
select tablename,indexname,indexdef from pg_indexes where schemaname='public'
order by tablename,indexname;
-- Inventorie aussi les dépendances gérées par Supabase ou par un schéma externe.
select c.conrelid::regclass::text as source_table,c.conname,c.confrelid::regclass::text as target_table,
       pg_get_constraintdef(c.oid) as definition,c.convalidated
from pg_constraint c where c.contype='f' and c.confrelid in (to_regclass('auth.users'),to_regclass('public.profiles'))
order by source_table,c.conname;
-- Seules les protections applicatives sont contrôlées ; le schéma Storage reste géré par Supabase.
select policyname,permissive,roles,cmd,qual,with_check from pg_policies
where schemaname='storage' and tablename='objects'
 and policyname in ('chibasko_legacy_storage_no_insert','chibasko_legacy_storage_no_update') order by policyname;
select bucket_id,count(*) as objects,count(*) filter(where coalesce(nullif(to_jsonb(o)->>'owner_id',''),nullif(to_jsonb(o)->>'owner','')) is not null) as owned
from storage.objects o group by bucket_id order by bucket_id;
rollback;
