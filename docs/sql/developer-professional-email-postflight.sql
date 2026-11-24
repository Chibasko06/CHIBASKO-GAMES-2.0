-- Lecture seule : aucune preuve, adresse, clé ou corps de message retourné.
select jsonb_build_object(
 'challenge_rls',(select relrowsecurity from pg_class where oid='public.developer_email_challenges'::regclass),
 'permissions',(select jsonb_agg(jsonb_build_object('role',r,'status_execute',has_function_privilege(r,'public.distribution_developer_email_status(uuid)','EXECUTE'),'challenge_select',has_table_privilege(r,'public.developer_email_challenges','SELECT'),'proof_update',has_column_privilege(r,'public.developer_contacts','email_verified_at','UPDATE'))) from unnest(array['anon','authenticated','service_role']) r),
 'profiles',(select jsonb_build_object('total',count(*),'verified',count(email_verified_at)) from public.developer_contacts),
 'holds',(select jsonb_object_agg(reason,n) from(select coalesce(delivery_hold,'none') reason,count(*) n from public.game_submission_notifications where sent_at is null group by delivery_hold) q),
 'guards',(select jsonb_agg(tgname order by tgname) from pg_trigger where not tgisinternal and tgfoid in('public.distribution_professional_email_guard()'::regprocedure,'public.distribution_guard_verified_submission()'::regprocedure))
) as professional_email_postflight;
