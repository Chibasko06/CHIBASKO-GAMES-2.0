begin transaction read only;

-- Métadonnées seulement : aucune session, capacité ou donnée de joueur.
select name,to_regclass('public.'||name) is not null as present
from unnest(array['games','game_versions','game_launch_sessions','game_public_deliveries']) name;

select name,to_regprocedure('public.'||name) is not null as present
from unnest(array[
 'distribution_check_launch(text)',
 'distribution_record_integration_observation(uuid,uuid,uuid,uuid,text,text,integer)',
 'distribution_issue_public_delivery(uuid,text,text)',
 'distribution_check_public_delivery(uuid,text)',
 'distribution_exchange_public_delivery(uuid,text,text,text)',
 'distribution_exchange_shared_public_delivery(uuid,text,text,text)',
 'distribution_check_versioned_public_delivery(uuid,uuid,text)',
 'distribution_exchange_versioned_public_delivery(uuid,text,text,text)'
]) name;

select p.oid::regprocedure as function,p.prosecdef as security_definer,p.proconfig,
 exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute,
 has_function_privilege('anon',p.oid,'execute') as anon_execute,
 has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'execute') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
 ('distribution_issue_public_delivery','distribution_check_public_delivery','distribution_exchange_public_delivery','distribution_exchange_shared_public_delivery','distribution_check_versioned_public_delivery','distribution_exchange_versioned_public_delivery');

select indexname from pg_indexes where schemaname='public' and tablename='game_public_deliveries'
 and indexname in ('game_public_deliveries_cookie_hash_key','game_public_deliveries_cookie_game_idx','game_public_deliveries_cookie_version_idx') order by indexname;

select c.relname,c.relrowsecurity as rls,
 has_table_privilege('anon',c.oid,'select') as anon_select,
 has_table_privilege('authenticated',c.oid,'select') as authenticated_select,
 has_any_column_privilege('anon',c.oid,'select') as anon_column_select,
 has_any_column_privilege('authenticated',c.oid,'select') as authenticated_column_select
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='game_public_deliveries';

rollback;
