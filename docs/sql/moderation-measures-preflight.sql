-- Exécuter avec une connexion de lecture seule autorisée.
begin read only;
select current_database() as database_name, current_user as database_role;
select name, to_regclass('public.' || name) is not null as present
from unnest(array['moderation_cases','moderation_mail','admin_users','game_launch_sessions',
 'game_online_participants','game_developer_members','moderation_subjects',
 'moderation_measures','moderation_appeals','moderation_measure_mail',
 'moderation_measure_scope','moderation_qualification_targets']) name;
select p.oid::regprocedure as signature, p.prosecdef as security_definer,
 p.proconfig as configuration,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (p.proname like 'account\_%' escape '\'
 or p.proname like '%moderation%') order by p.proname,p.oid::regprocedure::text;
select c.relname,c.relrowsecurity,
 has_table_privilege('anon',c.oid,'SELECT') as anon_select,
 has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select,
 has_table_privilege('service_role',c.oid,'UPDATE') as service_update
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('moderation_subjects','moderation_measures','moderation_appeals','moderation_measure_mail',
 'moderation_measure_scope','moderation_qualification_targets');
select tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='public' order by tablename,policyname;
select tgname,tgrelid::regclass from pg_trigger
where not tgisinternal and tgname like 'moderation%';
select mode from public.moderation_measure_scope where id;
select count(user_id) as players,count(game_id) as games from public.moderation_qualification_targets;
rollback;
