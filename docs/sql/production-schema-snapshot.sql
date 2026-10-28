\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned
begin transaction read only;
set local statement_timeout='30s';
set local lock_timeout='5s';
set local search_path=pg_catalog,public;
with managed as (
 select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p') and c.relname ~
 '^(social_|profile_username_reservations$|contact_dispatches$|games$|profiles$|categories$|game_categories$|favorites$|play_history$|game_reviews$|game_reactions$|faq_entries$|admin_users$|password_reset_|developer_contacts$|game_account_|game_management_authorities$|game_platform_management$|game_submissions$|game_submission_|game_developer_|game_versions$|game_build_|game_reviewers$|game_version_delivery_policies$|game_preview_sessions$|game_launch_sessions$|game_server_|game_online_|game_connection_tickets$|game_exchange_limits$|multiplayer_)'
), objects as (
 select 'table:'||c.relname as key,jsonb_build_object(
  'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
  'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,
    'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'columnAcl',a.attacl::text) order by a.attnum)
   from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
  'constraints',coalesce((select jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),'valid',k.convalidated) order by k.conname) from pg_constraint k where k.conrelid=c.oid),'[]'::jsonb),
  'policies',coalesce((select jsonb_agg(jsonb_build_object('name',p.policyname,'roles',p.roles,'command',p.cmd,'using',p.qual,'check',p.with_check) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname),'[]'::jsonb),
  'grants',coalesce((select jsonb_agg(jsonb_build_object('role',case when g.grantee=0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end,'privilege',g.privilege_type,'grantable',g.is_grantable) order by case when g.grantee=0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end,g.privilege_type)
    from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) g where g.grantee<>c.relowner),'[]'::jsonb),
  'access',(select jsonb_object_agg(role_name,jsonb_build_object(
    'select',coalesce((select bool_or(has_column_privilege(role_name,c.oid,a.attnum,'SELECT')) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),false),
    'insert',coalesce((select bool_or(has_column_privilege(role_name,c.oid,a.attnum,'INSERT')) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),false),
    'update',coalesce((select bool_or(has_column_privilege(role_name,c.oid,a.attnum,'UPDATE')) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),false),
    'delete',has_table_privilege(role_name,c.oid,'DELETE'))) from (values('anon'),('authenticated'),('service_role')) r(role_name))
 ) as value from managed c
 union all
 select 'view:'||c.relname,jsonb_build_object(
  'owner',pg_get_userbyid(c.relowner),'definition',pg_get_viewdef(c.oid,true),'options',c.reloptions,
  'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'columnAcl',a.attacl::text) order by a.attnum)
    from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
  'grants',coalesce((select jsonb_agg(jsonb_build_object('role',case when g.grantee=0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end,'privilege',g.privilege_type,'grantable',g.is_grantable) order by case when g.grantee=0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end,g.privilege_type)
    from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) g where g.grantee<>c.relowner),'[]'::jsonb))
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='v' and c.relname='public_profiles'
 union all
 select 'storage:legacy_write_guard',jsonb_build_object(
  'rls',(select relrowsecurity from pg_class where oid='storage.objects'::regclass),
  'policies',jsonb_agg(jsonb_build_object('name',policyname,'roles',roles,'command',cmd,'permissive',permissive,'using',qual,'check',with_check) order by policyname))
 from pg_policies where schemaname='storage' and tablename='objects'
 and policyname in ('chibasko_legacy_storage_no_insert','chibasko_legacy_storage_no_update') having count(*)>0
 union all
 select 'function:'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',jsonb_build_object(
  'owner',pg_get_userbyid(p.proowner),'result',pg_get_function_result(p.oid),'language',l.lanname,
  'securityDefiner',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'configuration',p.proconfig,
  'bodySha256',encode(sha256(convert_to(replace(p.prosrc,chr(13),''),'UTF8')),'hex'),
  'grants',coalesce((select jsonb_agg(jsonb_build_object('role',case when g.grantee=0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end,'privilege',g.privilege_type,'grantable',g.is_grantable) order by case when g.grantee=0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end,g.privilege_type)
    from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) g where g.grantee<>p.proowner),'[]'::jsonb),
  'execute',(select jsonb_object_agg(role_name,has_function_privilege(role_name,p.oid,'EXECUTE')) from (values('anon'),('authenticated'),('service_role')) r(role_name))
 ) from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
 where n.nspname='public' and p.prokind='f' and (p.proname like 'distribution\_%' escape '\' or p.proname like 'social\_%' escape '\' or p.proname like 'contact\_%' escape '\'
 or p.proname in ('valid_public_username','reserve_profile_username','public_profile_resolve','admin_console_users','admin_console_overview','admin_console_deletions','public_profiles_page','catalogue_recent_history','catalogue_admin_users','catalogue_game_stats','catalogue_device','catalogue_page','catalogue_home','admin_save_game','guard_game_version','guard_active_game_version','set_active_game_version','get_published_game_runtimes',
 'normalize_profile_username','handle_new_user','slugify_profile_handle','touch_game_review_updated_at','touch_game_reaction_updated_at',
 'increment_game_view','record_game_play','get_game_public_stats','get_game_reviews','set_game_submissions_updated_at',
 'reserve_password_reset','check_password_reset','cleanup_password_reset_requests'))
 union all
 select 'index:'||i.indexname,jsonb_build_object('definition',i.indexdef,'valid',x.indisvalid,'ready',x.indisready)
 from pg_indexes i join pg_class c on c.oid=to_regclass(format('%I.%I',i.schemaname,i.indexname))
 join pg_index x on x.indexrelid=c.oid
 where i.schemaname='public' and i.tablename in (select relname from managed)
 union all
 select 'sequence:'||c.relname,jsonb_build_object('parameters',to_jsonb(s)-'seqrelid',
  'grants',coalesce((select jsonb_agg(jsonb_build_object('role',case when g.grantee=0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end,
   'privilege',g.privilege_type,'grantable',g.is_grantable) order by case when g.grantee=0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end,g.privilege_type)
   from aclexplode(coalesce(c.relacl,acldefault('S',c.relowner))) g where g.grantee<>c.relowner),'[]'::jsonb),
  'access',(select jsonb_object_agg(role_name,jsonb_build_object('usage',has_sequence_privilege(role_name,c.oid,'USAGE'),
   'select',has_sequence_privilege(role_name,c.oid,'SELECT'),'update',has_sequence_privilege(role_name,c.oid,'UPDATE')))
   from (values('anon'),('authenticated'),('service_role')) r(role_name)))
 from pg_class c join pg_sequence s on s.seqrelid=c.oid
 where exists(select 1 from pg_depend d where d.objid=c.oid and d.classid='pg_class'::regclass
  and d.refclassid='pg_class'::regclass and d.refobjid in (select oid from managed) and d.deptype in ('a','i'))
 union all
 select 'trigger:'||c.relname||':'||t.tgname,jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid
 where not t.tgisinternal and (t.tgrelid in (select oid from managed)
 or (c.oid=to_regclass('auth.users') and t.tgname in ('on_auth_user_created','account_deletion_guard')))
 union all
 select 'column:games.active_version_id',jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull)
 from pg_attribute a where a.attrelid=to_regclass('public.games') and a.attname='active_version_id' and not a.attisdropped
 union all
 select 'constraint:games:'||k.conname,to_jsonb(pg_get_constraintdef(k.oid)) from pg_constraint k
 where k.conrelid=to_regclass('public.games') and k.conkey @> array[
  (select attnum from pg_attribute where attrelid=k.conrelid and attname='active_version_id' and not attisdropped)]::smallint[]
), prerequisites as (
 select jsonb_build_object(
  'columns',coalesce((select jsonb_object_agg(n.nspname||'.'||c.relname||'.'||a.attname,t.typname)
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace join pg_type t on t.oid=a.atttypid
    where a.attnum>0 and not a.attisdropped and (n.nspname,c.relname,a.attname) in
    (('auth','users','id'),('auth','users','email'),('auth','users','raw_user_meta_data'),('auth','users','created_at'),('public','games','id'),('public','games','slug'),('public','games','title'),('public','games','is_published'),
     ('public','games','game_type'),('public','games','multiplayer_game_id'),('public','profiles','id'),('public','profiles','username'),('public','admin_users','user_id'))),'{}'::jsonb),
  'roles',(select jsonb_object_agg(rolname,jsonb_build_object('superuser',rolsuper,'bypassRls',rolbypassrls)) from pg_roles where rolname in ('anon','authenticated','service_role')),
  'uuidGenerator',to_regprocedure('gen_random_uuid()') is not null,
  'primaryKeys',(select jsonb_object_agg(c.conrelid::regclass::text,
    (select jsonb_agg(a.attname order by u.ordinality) from unnest(c.conkey) with ordinality u(num,ordinality)
     join pg_attribute a on a.attrelid=c.conrelid and a.attnum=u.num))
    from pg_constraint c where c.contype='p' and c.conrelid in
    (to_regclass('auth.users'),to_regclass('public.games'),to_regclass('public.profiles'),to_regclass('public.admin_users'))),
  'identityForeignKeys',(select jsonb_object_agg(t.name,exists(select 1 from pg_constraint c
    where c.conrelid=to_regclass('public.'||t.name) and c.confrelid=to_regclass('auth.users') and c.contype='f' and c.convalidated
    and c.conkey=array[(select attnum from pg_attribute where attrelid=c.conrelid and attname=t.column_name)]::smallint[]
    and c.confkey=array[(select attnum from pg_attribute where attrelid=c.confrelid and attname='id')]::smallint[]))
    from (values('profiles','id'),('admin_users','user_id')) t(name,column_name)),
  'slugUnique',exists(select 1 from pg_index i where i.indrelid=to_regclass('public.games') and i.indisunique and i.indisvalid and i.indpred is null
    and i.indnkeyatts=1 and i.indkey[0]=(select attnum from pg_attribute where attrelid=i.indrelid and attname='slug')),
  'serviceProfileRead',case when to_regclass('public.profiles') is null then false else has_table_privilege('service_role','public.profiles','SELECT') end,
  'legacyTriggers',coalesce((select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname)
    from pg_trigger t where t.tgrelid=to_regclass('public.games') and not t.tgisinternal and t.tgname not in ('guard_active_game_version','account_asset_guard')),'[]'::jsonb),
  'gamesRls',(select relrowsecurity from pg_class where oid=to_regclass('public.games')),
  'adminRls',(select relrowsecurity from pg_class where oid=to_regclass('public.admin_users')),
  'browserCatalogueWrites',coalesce((select bool_or(has_column_privilege(r.role_name,c.oid,a.attnum,'INSERT') or has_column_privilege(r.role_name,c.oid,a.attnum,'UPDATE')
    or has_table_privilege(r.role_name,c.oid,'DELETE')) from pg_class c join pg_attribute a on a.attrelid=c.oid
    cross join (values('anon'),('authenticated')) r(role_name) where c.oid=to_regclass('public.games') and a.attnum>0 and not a.attisdropped),true),
  'legacyPolicies',coalesce((select jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'roles',roles,'command',cmd,'using',qual,'check',with_check) order by tablename,policyname)
    from pg_policies where schemaname='public' and tablename in ('games','admin_users')),'[]'::jsonb)
 ) as value
)
select jsonb_build_object('format',1,'readOnly',current_setting('transaction_read_only')='on',
 'prerequisites',(select value from prerequisites),'objects',coalesce((select jsonb_object_agg(key,value) from objects),'{}'::jsonb));
rollback;
