\set ON_ERROR_STOP on
-- Invoked only in the disposable cluster created by game-distribution-db.mjs.
create table public.admin_users(user_id uuid primary key references auth.users(id));
grant select on public.admin_users to service_role;
\ir ../supabase/migrations/20261016000200_game_build_uploads.sql
insert into auth.users values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
insert into public.admin_users values('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
insert into public.game_developer_members values('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','editor');
create function public.upload_test_policy() returns jsonb language sql as $$select '{"revision":1,"maxArchiveBytes":4294967296,"maxTotalBytes":17179869184,"maxFileBytes":4294967296,"maxFiles":50000,"maxManifestBytes":65536,"maxCompressionRatio":200,"maxPathDepth":32,"partBytes":33554432,"validationMs":900000,"sessionSeconds":86400,"signedUrlSeconds":900,"jobSeconds":3600,"maxAttempts":3,"maxActiveUploads":2,"maxUploadsPerDay":20,"maxApiPerMinute":120}'::jsonb$$;
-- Regrant the test-only failure helper; the migration correctly revoked browser
-- access to every distribution RPC, including this disposable fixture helper.
grant execute on function public.distribution_expect_failure(text) to anon,authenticated;
set role anon;
select public.distribution_expect_failure('select * from public.game_build_uploads');
select public.distribution_expect_failure('select * from public.game_developer_members');
select public.distribution_expect_failure($s$select public.distribution_get_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid())$s$);
reset role;
insert into public.game_build_uploads(id,game_id,created_by,request_id,version,status,expected_size,policy,expires_at,multipart_id)
values('77777777-7777-4777-8777-777777777777','22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),'6.0.0','uploading',100,public.upload_test_policy(),now()+interval '1 day','fixture-upload');
set role authenticated;
select public.distribution_expect_failure('insert into public.game_developer_members values(gen_random_uuid(),gen_random_uuid(),''owner'')');
select public.distribution_expect_failure('select * from public.game_build_outbox');
reset role;
set role service_role;
select public.distribution_expect_failure($s$select public.distribution_create_upload('cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','3.0.0',100,gen_random_uuid(),public.upload_test_policy())$s$);
select public.distribution_expect_failure($s$select public.distribution_create_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),'3.0.0',100,gen_random_uuid(),public.upload_test_policy())$s$);
do $$ declare u public.game_build_uploads; v public.game_build_uploads; begin
 u:=public.distribution_create_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','3.0.0',100,'11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',public.upload_test_policy());
 v:=public.distribution_create_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','3.0.0',100,'11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',public.upload_test_policy());
 if u.id<>v.id or u.created_by<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then raise exception 'Idempotence/identity broken'; end if;
 perform public.distribution_expect_failure(format('select public.distribution_get_upload(%L,%L)','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',u.id));
 perform public.distribution_get_upload('dddddddd-dddd-4ddd-8ddd-dddddddddddd',u.id);
 u:=public.distribution_attach_transport('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',u.id,'opaque-upload');
 u:=public.distribution_begin_finalize('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',u.id);
 u:=public.distribution_enqueue_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',u.id,'etag');
 v:=public.distribution_enqueue_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',u.id,'etag');
 if (select count(*) from public.game_build_outbox where upload_id=u.id)<>1 then raise exception 'Outbox duplicated'; end if;
 u:=public.distribution_claim(u.id);
 if (public.distribution_claim(u.id)).id is not null then raise exception 'Double claim'; end if;
 perform public.distribution_expect_failure(format('select public.distribution_checkpoint(%L,%L,''{}'')',u.id,gen_random_uuid()));
 perform public.distribution_fail(u.id,u.lease_token,'storage_error',true);
 u:=public.distribution_claim(u.id);
 delete from public.game_developer_members where user_id=u.created_by;
 perform public.distribution_expect_failure(format('select public.distribution_complete(%L,%L)',u.id,u.lease_token));
 insert into public.game_developer_members values(u.game_id,u.created_by,'owner');
 perform public.distribution_fail(u.id,u.lease_token,'validation_failed',false);
 u:=public.distribution_create_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','4.0.0',100,gen_random_uuid(),public.upload_test_policy());
 update public.game_build_uploads set expires_at=now()-interval '1 second' where id=u.id;
 u:=public.distribution_get_upload(u.created_by,u.id);
 if u.status<>'expired' then raise exception 'Expiration failed'; end if;
 u:=public.distribution_create_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','5.0.0',100,gen_random_uuid(),public.upload_test_policy()||'{"redispatchSeconds":3600}');
 u:=public.distribution_attach_transport(u.created_by,u.id,'retry-upload');
 u:=public.distribution_begin_finalize(u.created_by,u.id);
 u:=public.distribution_enqueue_upload(u.created_by,u.id,'etag');
 for i in 1..3 loop
 u:=public.distribution_claim(u.id);
 perform public.distribution_fail(u.id,u.lease_token,'storage_error',true);
 end loop;
 select * into u from public.game_build_uploads where id=u.id;
 if u.status<>'failed' or u.attempts<>3 then raise exception 'Unbounded retries'; end if;
end $$;
-- Two independent, fully validated jobs race to create the same logical version.
insert into public.game_build_uploads(id,game_id,created_by,request_id,version,status,expected_size,policy,expires_at,lease_token,lease_until,attempts,checkpoint)
select x,'22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),'3.0.0','validating',100,public.upload_test_policy(),now()+interval '1 day',gen_random_uuid(),now()+interval '1 hour',1,
 jsonb_build_object('manifest',jsonb_build_object('gameId','22222222-2222-4222-8222-222222222222','version','3.0.0','schemaVersion',1,'integrationVersion',1,'capabilities',jsonb_build_object('local',jsonb_build_object('players',jsonb_build_object('min',1,'max',1))),'client',jsonb_build_object('entrypoints',jsonb_build_object('local','index.html'))),'fileCount',1,'artifactSha256',repeat('a',64),'artifactSize',100,'archiveSha256',repeat('b',64),'archiveSize',100)
from unnest(array['88888888-8888-4888-8888-888888888888'::uuid,'99999999-9999-4999-8999-999999999999'::uuid]) x;
reset role;
