\set ON_ERROR_STOP on
-- Disposable PostgreSQL only, after phase 1/2 tests and their concurrency race.
do $$ begin if current_database()<>'chibasko_distribution_test' then raise exception 'Disposable database required'; end if; end $$;
\ir ../supabase/migrations/20261016000300_game_artifact_previews.sql
create function public.artifact_expect_code(statement text,expected text) returns void language plpgsql as $$
declare actual text; begin
 begin execute statement; exception when others then actual:=sqlerrm; end;
 if actual is distinct from expected then raise exception 'Expected %, got %',expected,actual; end if;
end $$;
insert into auth.users values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
insert into public.game_reviewers values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
set role anon;
select public.distribution_expect_failure('select * from public.game_preview_sessions');
select public.distribution_expect_failure('select public.distribution_resolve_version(gen_random_uuid())');
reset role;
set role authenticated;
select public.distribution_expect_failure('select * from public.game_reviewers');
select public.distribution_expect_failure('insert into public.game_version_delivery_policies default values');
select public.distribution_expect_failure('select public.distribution_cleanup_previews()');
reset role;
set role service_role;
do $$ declare v uuid; s jsonb; session_id uuid; actor uuid; resolved jsonb; begin
 select id into strict v from public.game_versions where game_id='22222222-2222-4222-8222-222222222222' and version='3.0.0';
 resolved:=public.distribution_resolve_version(v);
 if resolved->>'status'<>'draft' or resolved#>>'{delivery_policy,profile}'<>'web-v1' then raise exception 'Resolution/default policy failed'; end if;
 if public.distribution_resolve_version(gen_random_uuid()) is not null then raise exception 'Unknown version resolved'; end if;
 perform public.artifact_expect_code(format('select public.distribution_issue_preview(%L,%L,''local'',%L,60,900,30)','cccccccc-cccc-4ccc-8ccc-cccccccccccc',v,repeat('a',64)),'preview_forbidden');
 perform public.artifact_expect_code(format('select public.distribution_issue_preview(%L,%L,''local'',%L,60,900,30)','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',v,repeat('a',64)),'preview_forbidden');
 perform public.artifact_expect_code(format('select public.distribution_issue_preview(%L,%L,''local'',%L,60,900,30)','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),repeat('a',64)),'version_not_found');
 perform public.artifact_expect_code(format('select public.distribution_issue_preview(%L,%L,''online'',%L,60,900,30)','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v,repeat('a',64)),'unsupported_execution');
 foreach actor in array array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid] loop
   s:=public.distribution_issue_preview(actor,v,'local',md5(actor::text)||md5(actor::text),60,900,30);
   if s->>'version_id'<>v::text or s ? 'ticket_hash' or s ? 'cookie_hash' then raise exception 'Unsafe preview response'; end if;
 end loop;
 session_id:=(select id from public.game_preview_sessions where issued_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1);
 perform public.artifact_expect_code(format('select public.distribution_exchange_preview(%L,%L,%L)',gen_random_uuid(),repeat('a',64),repeat('b',64)),'preview_expired');
 perform public.artifact_expect_code(format('select public.distribution_exchange_preview(%L,%L,%L)',session_id,repeat('a',64),repeat('b',64)),'preview_expired');
 perform public.distribution_exchange_preview(session_id,md5('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')||md5('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),repeat('b',64));
 perform public.artifact_expect_code(format('select public.distribution_exchange_preview(%L,%L,%L)',session_id,md5('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')||md5('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),repeat('c',64)),'preview_replayed');
 perform public.distribution_check_preview(session_id,repeat('b',64));
 perform public.artifact_expect_code(format('select public.distribution_check_preview(%L,%L)',session_id,repeat('c',64)),'preview_expired');
 delete from public.game_developer_members where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 perform public.artifact_expect_code(format('select public.distribution_check_preview(%L,%L)',session_id,repeat('b',64)),'preview_forbidden');
 insert into public.game_developer_members values('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner');
 update public.game_preview_sessions set ticket_expires_at=now()-interval '2 seconds',expires_at=now()-interval '1 second' where id=session_id;
 perform public.artifact_expect_code(format('select public.distribution_check_preview(%L,%L)',session_id,repeat('b',64)),'preview_expired');
 if public.distribution_cleanup_previews()<>1 then raise exception 'Expiration cleanup failed'; end if;
 s:=public.distribution_issue_preview('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v,'local',repeat('d',64),60,900,30);
 update public.game_preview_sessions set ticket_expires_at=now()-interval '1 second' where id=(s->>'id')::uuid;
 perform public.artifact_expect_code(format('select public.distribution_exchange_preview(%L,%L,%L)',s->>'id',repeat('d',64),repeat('e',64)),'preview_expired');
 update public.game_versions set status='in_review' where id=v;
 s:=public.distribution_issue_preview('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',v,'local',repeat('e',64),60,900,30);
 perform public.distribution_exchange_preview((s->>'id')::uuid,repeat('e',64),repeat('f',64));
 delete from public.game_reviewers where user_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 perform public.artifact_expect_code(format('select public.distribution_check_preview(%L,%L)',s->>'id',repeat('f',64)),'preview_forbidden');
 update public.game_versions set status='approved' where id=v;
 insert into public.game_reviewers values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 perform public.distribution_check_preview((s->>'id')::uuid,repeat('f',64));
 insert into public.game_version_delivery_policies(version_id,profile,connect_origins) values(v,'web-isolated-v1','["wss://server.example.com"]');
 if public.distribution_resolve_version(v)#>>'{delivery_policy,profile}'<>'web-isolated-v1' then raise exception 'Approved delivery policy not resolved'; end if;
 update public.game_versions set status='published' where id=v;
 perform public.artifact_expect_code(format('select public.distribution_check_preview(%L,%L)',s->>'id',repeat('f',64)),'version_not_previewable');
 perform public.artifact_expect_code(format('select public.distribution_issue_preview(%L,%L,''local'',%L,60,900,30)','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v,repeat('9',64)),'version_not_previewable');
 update public.game_versions set status='archived' where id=v;
 if public.distribution_resolve_version(v)->>'status'<>'archived' then raise exception 'Archive resolution failed'; end if;
end $$;
-- Independent draft used for a real concurrent one-time ticket exchange.
insert into public.game_versions(id,game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count)
select 'abababab-abab-4bab-8bab-abababababab',game_id,'7.0.0',schema_version,integration_version,jsonb_set(manifest,'{version}','"7.0.0"'),repeat('c',64),artifact_size,file_count
from public.game_versions where version='3.0.0';
insert into public.game_preview_sessions(id,version_id,issued_by,execution,ticket_hash,ticket_expires_at,expires_at)
values('fafafafa-fafa-4afa-8afa-fafafafafafa','abababab-abab-4bab-8bab-abababababab','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','local',repeat('1',64),now()+interval '1 minute',now()+interval '15 minutes');
reset role;
