begin read only;
select signature,to_regprocedure('public.'||signature) is not null as presente
from unnest(array[
 'distribution_review_action(uuid,uuid,text,jsonb,text,uuid)',
 'distribution_review_action_core(uuid,uuid,text,jsonb,text,uuid)',
 'distribution_record_integration_scan(uuid,uuid,jsonb)',
 'distribution_record_integration_observation(uuid,uuid,uuid,uuid,text,text,integer)',
 'distribution_admin_integration(uuid,uuid)',
 'distribution_integration_event(text,text)'
]) signature;
select p.oid::regprocedure as fonction,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'execute') as execute_anonyme,
 has_function_privilege('authenticated',p.oid,'execute') as execute_joueur,
 has_function_privilege('service_role',p.oid,'execute') as execute_serveur
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('distribution_integration_event','distribution_record_integration_scan','distribution_record_integration_observation','distribution_admin_integration','distribution_review_action','distribution_review_action_core')
order by p.proname;
select c.relname,c.relrowsecurity,
 has_table_privilege('anon',c.oid,'select') as lecture_anonyme,
 has_table_privilege('authenticated',c.oid,'select') as lecture_joueur
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('game_build_review_events','game_launch_sessions');
rollback;
