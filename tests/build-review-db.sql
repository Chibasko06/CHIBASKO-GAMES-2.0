\set ON_ERROR_STOP on
reset role;
\ir ../supabase/migrations/20260508_game_submissions.sql
\ir ../supabase/migrations/20260508_game_submissions_workflow_upgrade.sql
\ir ../supabase/migrations/20261007000300_secure_game_submissions.sql
create table public.profiles(id uuid primary key references auth.users(id),username text);
grant select on public.profiles to service_role;
\ir ../supabase/migrations/20261019000100_manual_build_reviews.sql.sql
grant execute on function public.distribution_expect_failure(text) to anon,authenticated;
set role anon;
select public.distribution_expect_failure('select * from public.game_build_reviews');
select public.distribution_expect_failure($s$select public.distribution_admin_builds('dddddddd-dddd-4ddd-8ddd-dddddddddddd')$s$);
select public.distribution_expect_failure($s$select public.distribution_review_job(gen_random_uuid())$s$);
reset role;
set role service_role;
insert into public.games(id,title,game_url) values('13131313-1313-4313-8313-131313131313','Generic review fixture','https://example.invalid');
insert into public.game_developer_members values('13131313-1313-4313-8313-131313131313','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner');
insert into public.game_build_uploads(id,game_id,created_by,request_id,version,version_id,status,expected_size,policy,expires_at)
values('12121212-1212-4212-8212-121212121212','13131313-1313-4313-8313-131313131313','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),'1.0.0','14141414-1414-4414-8414-141414141414','queued',100,public.upload_test_policy(),now()+interval '1 day');
select public.distribution_expect_failure($s$select public.distribution_admin_builds('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$s$);
select public.distribution_expect_failure($s$select public.distribution_admin_builds('dddddddd-dddd-4ddd-8ddd-dddddddddddd',gen_random_uuid())$s$);
select public.distribution_expect_failure($s$select public.distribution_review_action('dddddddd-dddd-4ddd-8ddd-dddddddddddd','12121212-1212-4212-8212-121212121212','publish')$s$);
select public.distribution_expect_failure($s$select public.distribution_review_action('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','12121212-1212-4212-8212-121212121212','reject','{}','Refus')$s$);
do $$ declare result jsonb; begin
 result:=public.distribution_admin_builds('dddddddd-dddd-4ddd-8ddd-dddddddddddd','12121212-1212-4212-8212-121212121212');
 if result->>'technicalStatus'<>'queued' then raise exception 'Missing pending build'; end if;
 if result::text ~ 'staging_key|lease_token|service_role|checkpoint|storage_prefix|created_by|staging/uploads' then raise exception 'Private internals leaked'; end if;
end $$;
select public.distribution_review_action('dddddddd-dddd-4ddd-8ddd-dddddddddddd','12121212-1212-4212-8212-121212121212','reject','{}','Contenu non conforme');
select public.distribution_expect_failure($s$select public.distribution_review_job('12121212-1212-4212-8212-121212121212')$s$);
do $$ begin
 if (public.distribution_developer_review('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','12121212-1212-4212-8212-121212121212')->>'reason')<>'Contenu non conforme' then raise exception 'Missing developer decision'; end if;
end $$;
select public.distribution_expect_failure($s$select public.distribution_developer_review('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','12121212-1212-4212-8212-121212121212')$s$);
-- Prepare a separate technical success state; real extraction is covered by validator tests.
reset role;
update public.game_build_reviews set decision='pending',reason=null where upload_id='12121212-1212-4212-8212-121212121212';
update public.game_build_uploads set status='completed',error_code=null where id='12121212-1212-4212-8212-121212121212';
set role service_role;
insert into public.game_versions(id,game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count)
values('14141414-1414-4414-8414-141414141414','13131313-1313-4313-8313-131313131313','1.0.0',1,1,
'{"gameId":"13131313-1313-4313-8313-131313131313","version":"1.0.0","schemaVersion":1,"integrationVersion":1,"capabilities":{"local":{"players":{"min":1,"max":1}}},"client":{"entrypoints":{"local":"index.html"}}}',repeat('d',64),100,2);
select public.distribution_expect_failure($s$select public.distribution_review_action('dddddddd-dddd-4ddd-8ddd-dddddddddddd','12121212-1212-4212-8212-121212121212','publish')$s$);
select public.distribution_expect_failure($s$select public.distribution_review_action('dddddddd-dddd-4ddd-8ddd-dddddddddddd','12121212-1212-4212-8212-121212121212','review','{"tested":true}')$s$);
select public.distribution_review_action('dddddddd-dddd-4ddd-8ddd-dddddddddddd','12121212-1212-4212-8212-121212121212','review','{"tested":true,"content":true,"metadata":true,"behavior":true}');
select public.distribution_expect_failure($s$update public.game_versions set artifact_sha256=repeat('e',64) where id='14141414-1414-4414-8414-141414141414'$s$);
reset role;
