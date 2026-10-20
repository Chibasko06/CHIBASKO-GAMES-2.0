\set ON_ERROR_STOP on
reset role;
alter table auth.users add column email text;
alter table public.games add column slug text unique;
create table public.categories(id uuid primary key,name text);
grant select on public.categories to service_role;
grant select on auth.users to service_role;
grant usage on schema auth to service_role;
\ir ../supabase/migrations/20261020000200_developer_submissions.sql
insert into auth.users(id,email) values('edededed-eded-4ded-8ded-edededededed','fixture@example.test');
set role service_role;
do $$ declare game uuid; again uuid; u public.game_build_uploads; sid uuid; body jsonb; begin
 game:=public.distribution_register_game('edededed-eded-4ded-8ded-edededededed','12121212-3434-4343-8343-121212121212','Fixture game');
 again:=public.distribution_register_game('edededed-eded-4ded-8ded-edededededed','12121212-3434-4343-8343-121212121212','Fixture game');
 if game<>again or not exists(select 1 from public.game_developer_members where game_id=game and user_id='edededed-eded-4ded-8ded-edededededed' and role='owner') then raise exception 'Registration/ownership failed'; end if;
 if exists(select 1 from public.games where id=game and (is_published or active_version_id is not null)) then raise exception 'Automatic publication'; end if;
 perform public.distribution_expect_failure(format('select public.distribution_create_upload(%L,%L,%L,100,gen_random_uuid(),public.upload_test_policy())','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',game,'1.0.0'));
 u:=public.distribution_create_upload('edededed-eded-4ded-8ded-edededededed',game,'1.0.0',100,gen_random_uuid(),public.upload_test_policy());
 perform public.distribution_expect_failure(format('select public.distribution_submit_editorial(%L,%L,%L,%L,''{}'',null)','edededed-eded-4ded-8ded-edededededed',u.id,'Title','Description'));
 perform public.distribution_attach_transport('edededed-eded-4ded-8ded-edededededed',u.id,'fixture-multipart');
 perform public.distribution_begin_finalize('edededed-eded-4ded-8ded-edededededed',u.id);
 perform public.distribution_enqueue_upload('edededed-eded-4ded-8ded-edededededed',u.id,'fixture-etag');
 sid:=public.distribution_submit_editorial('edededed-eded-4ded-8ded-edededededed',u.id,'Title','Description','{}',null);
 if sid<>public.distribution_submit_editorial('edededed-eded-4ded-8ded-edededededed',u.id,'Title','Description','{}',null) then raise exception 'Submission not idempotent'; end if;
 if not exists(select 1 from public.game_build_reviews where upload_id=u.id and submission_id=sid) then raise exception 'Missing review link'; end if;
 body:=public.distribution_developer_builds('edededed-eded-4ded-8ded-edededededed');
 if body::text ~ 'staging_key|multipart_id|lease_token|checkpoint|service_role|fixture-etag' then raise exception 'Private field leak'; end if;
 if not exists(select 1 from jsonb_array_elements(body) x where x->>'id'=u.id::text and x->>'editorialComplete'='true') then raise exception 'Missing submission'; end if;
 if exists(select 1 from jsonb_array_elements(public.distribution_developer_builds('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')) x where x->>'id'=u.id::text) then raise exception 'IDOR'; end if;
 if exists(select 1 from public.game_versions where game_id=game) then raise exception 'Premature version'; end if;
 perform public.distribution_create_upload('edededed-eded-4ded-8ded-edededededed',game,'1.1.0',100,gen_random_uuid(),public.upload_test_policy());
 perform public.distribution_expect_failure(format('select public.distribution_create_upload(%L,%L,%L,99999999999,gen_random_uuid(),public.upload_test_policy())','edededed-eded-4ded-8ded-edededededed',game,'2.0.0'));
end $$;
set role authenticated;
select public.distribution_expect_failure('select * from public.game_developer_registrations');
select public.distribution_expect_failure($s$select public.distribution_register_game('edededed-eded-4ded-8ded-edededededed',gen_random_uuid(),'Forbidden')$s$);
reset role;

