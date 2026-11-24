-- Lecture seule, sans adresse ni contenu de message.
select jsonb_build_object(
 'workspace',to_regprocedure('public.distribution_developer_workspace(uuid,uuid,integer)') is not null,
 'email_events',to_regprocedure('public.distribution_confirmed_submission_email(uuid)') is not null,
 'already_applied',exists(select 1 from information_schema.columns where table_schema='public' and table_name='developer_contacts' and column_name='email_verified_at'),
 'profiles',(select count(*) from public.developer_contacts),
 'active_developer_leases',(select count(*) from public.game_submission_notifications where event_key<>'internal' and sent_at is null and lease_until>clock_timestamp())
) as professional_email_preflight;
