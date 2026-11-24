-- Lecture seule : aucun corps de message ni adresse personnelle retournés.
select jsonb_build_object(
 'migration_state', (select to_jsonb(state) from (select current_user as execution_role,
 to_regprocedure('public.distribution_developer_workspace(uuid,uuid,integer)') is not null as workspace_001_present,
 to_regprocedure('public.distribution_confirmed_submission_email(uuid)') is not null as email_helper_002_present,
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='game_submission_notifications' and column_name='event_key') as outbox_002_present) state),

 'permissions', (select jsonb_agg(to_jsonb(permissions) order by rolname) from (select r.rolname,
 has_column_privilege(r.oid,'auth.users','email','SELECT') as auth_email_select,
 has_column_privilege(r.oid,'auth.users','email_confirmed_at','SELECT') as auth_confirmation_select,
 case when p.oid is not null then has_function_privilege(r.oid,p.oid,'EXECUTE') end as helper_execute
from pg_roles r
left join pg_proc p on p.oid=to_regprocedure('public.distribution_confirmed_submission_email(uuid)')
where r.rolname in ('anon','authenticated','service_role')) permissions),

 'helper', (select to_jsonb(helper) from (select p.proname, pg_get_userbyid(p.proowner) as owner,
 p.prosecdef as security_definer,p.proconfig as settings
from pg_proc p
where p.oid=to_regprocedure('public.distribution_confirmed_submission_email(uuid)')) helper),

 'triggers', (select jsonb_agg(to_jsonb(triggers) order by tgname) from (select tgname,tgenabled
from pg_trigger
where not tgisinternal and tgname in (
 'notify_developer_submission','notify_developer_revision','notify_developer_review',
 'notify_developer_external_review','notify_developer_publication')
order by tgname) triggers)
) as developer_email_postflight;
