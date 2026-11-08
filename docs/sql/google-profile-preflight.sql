begin transaction read only;
select to_regprocedure('public.handle_new_user()'),
 to_regprocedure('public.normalize_profile_username(text)'),
 to_regprocedure('public.reserve_profile_username()');
select column_name,data_type from information_schema.columns
 where table_schema='auth' and table_name='users'
 and column_name in('email','raw_user_meta_data','raw_app_meta_data');
select tgname,tgenabled from pg_trigger
 where tgrelid='auth.users'::regclass and tgfoid='public.handle_new_user()'::regprocedure and not tgisinternal;
-- Après migration : false pour les deux rôles publics.
-- select has_function_privilege('anon','public.google_profile_avatar(text)','execute');
-- select has_function_privilege('authenticated','public.google_profile_avatar(text)','execute');
rollback;
