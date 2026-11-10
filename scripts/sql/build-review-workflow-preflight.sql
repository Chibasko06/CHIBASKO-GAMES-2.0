begin read only;
-- À exécuter avec un accès de lecture autorisé, avant et après la migration.
select signature,to_regprocedure('public.'||signature) is not null as presente
from unnest(array[
 'distribution_claim(uuid)','distribution_fail(uuid,uuid,text,boolean)',
 'distribution_complete(uuid,uuid)','distribution_review_snapshot(uuid)',
 'distribution_owned_draft(uuid,uuid)','distribution_draft_snapshot(uuid)',
 'account_assert_allowed(uuid)'
]) signature;
select c.relname,c.relrowsecurity,
 has_table_privilege('anon',c.oid,'select') as lecture_anonyme,
 has_table_privilege('authenticated',c.oid,'select') as lecture_joueur
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('game_build_review_events','game_build_reviews','game_build_uploads','game_submission_drafts');
select p.oid::regprocedure as fonction,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'execute') as execute_anonyme,
 has_function_privilege('authenticated',p.oid,'execute') as execute_joueur,
 has_function_privilege('service_role',p.oid,'execute') as execute_serveur
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('distribution_review_state','distribution_validation_start','distribution_validation_fail','distribution_validation_complete','distribution_retry_validation','distribution_request_build_correction','distribution_prepare_build_correction','distribution_record_playtest','distribution_validation_event')
order by p.proname;
rollback;
