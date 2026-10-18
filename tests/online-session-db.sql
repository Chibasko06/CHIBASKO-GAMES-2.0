\set ON_ERROR_STOP on
do $$ begin if current_database()<>'chibasko_distribution_test' then raise exception 'Disposable database required'; end if; end $$;
\ir ../supabase/migrations/20261018000100_online_sessions.sql
set role anon;
select public.distribution_expect_failure('select * from public.game_server_credentials');
select public.distribution_expect_failure('select * from public.game_connection_tickets');
select public.distribution_expect_failure($s$select public.distribution_exchange_connection_ticket(repeat('a',64),repeat('b',64),gen_random_uuid())$s$);
reset role;

set role authenticated;
select public.distribution_expect_failure('select * from public.game_online_participants');
select public.distribution_expect_failure('insert into public.game_server_deployments default values');
reset role;
set role service_role;
insert into public.game_versions(id,game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count)
values('12121212-1212-4212-8212-121212121212','22222222-2222-4222-8222-222222222222','8.0.0',1,1,
 '{"schemaVersion":1,"integrationVersion":1,"gameId":"22222222-2222-4222-8222-222222222222","version":"8.0.0","capabilities":{"online":{"access":["public","private"],"players":{"min":2,"max":128}}},"client":{"entrypoints":{"online":"play.html"}}}',repeat('a',64),100,2);
insert into public.game_server_deployments(id,game_id,hosting_mode,endpoint,status) values
 ('13131313-1313-4313-8313-131313131313','22222222-2222-4222-8222-222222222222','self_hosted','wss://gameplay.chibaskogames.fr/','active'),
 ('14141414-1414-4414-8414-141414141414','22222222-2222-4222-8222-222222222222','chibasko_hosted','https://gameplay.chibaskogames.fr/','active');
insert into public.game_server_deployment_versions values('13131313-1313-4313-8313-131313131313','22222222-2222-4222-8222-222222222222','12121212-1212-4212-8212-121212121212');
select public.distribution_expect_failure($s$insert into public.game_server_deployment_versions values('14141414-1414-4414-8414-141414141414','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333')$s$);
insert into public.game_server_credentials(id,deployment_id,credential_hash,expires_at) values
 ('15151515-1515-4515-8515-151515151515','13131313-1313-4313-8313-131313131313',repeat('a',64),now()+interval '1 day'),
 ('16161616-1616-4616-8616-161616161616','13131313-1313-4313-8313-131313131313',repeat('b',64),now()+interval '1 day'),
 ('17171717-1717-4717-8717-171717171717','14141414-1414-4414-8414-141414141414',repeat('c',64),now()+interval '1 day');
reset role;
-- Helpers and deterministic hashes exist only inside the disposable test database.
create function public.online_test_ticket(h text) returns void language plpgsql as $$ declare l uuid; begin
 select id into strict l from public.game_launch_sessions where control_hash=repeat('e',64);
 perform public.distribution_issue_connection_ticket(l,repeat('e',64),(select generation from public.game_launch_sessions where id=l),repeat(h,64));
end $$;
create function public.online_test_exchange(c text,h text,expected text,request uuid default '19191919-1919-4919-8919-191919191919') returns jsonb language plpgsql as $$
declare r jsonb; begin
 r:=public.distribution_exchange_connection_ticket(repeat(c,64),repeat(h,64),request);
 if coalesce(r#>>'{error,code}','ok')<>expected then raise exception 'Expected %, got %',expected,r; end if;
 return r;
end $$;
set role service_role;
do $$ declare sid text; ctx jsonb; l jsonb; r jsonb; begin
 sid:=public.distribution_prepare_online_session('12121212-1212-4212-8212-121212121212','13131313-1313-4313-8313-131313131313',
  '[{"actorId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","displayName":"One"},{"actorId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","displayName":"Two"}]');
 ctx:=public.distribution_online_context('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sid,'22222222-2222-4222-8222-222222222222','12121212-1212-4212-8212-121212121212','fr');
 if ctx::text like '%aaaaaaaa-aaaa%' or jsonb_array_length(ctx->'participants')<>2 then raise exception 'Identity leak or bad roster'; end if;
 perform public.artifact_expect_code(format('select public.distribution_online_context(%L,%L,%L,%L,''fr'')','cccccccc-cccc-4ccc-8ccc-cccccccccccc',sid,'22222222-2222-4222-8222-222222222222','12121212-1212-4212-8212-121212121212'),'online_session_unavailable');
 l:=public.distribution_create_launch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','12121212-1212-4212-8212-121212121212','preview','online',repeat('f',64),repeat('e',64),ctx,1800,60,600);
 if exists(select 1 from public.game_connection_tickets) then raise exception 'Ticket created before START'; end if;
 perform public.online_test_ticket('1');
 perform public.online_test_exchange('f','1','invalid_credential');
 perform public.online_test_exchange('c','1','invalid_ticket');
 perform public.online_test_exchange('a','f','invalid_ticket');
 -- Rotation permits either active credential, but cannot change the retry identity.
 r:=public.online_test_exchange('b','1','ok');
 if r::text ~ 'actor|credential|ticket|storage|aaaaaaaa-aaaa' then raise exception 'Unsafe claims'; end if;
 if r<>public.online_test_exchange('b','1','ok') then raise exception 'Retry changed result'; end if;
 perform public.online_test_exchange('a','1','ticket_replayed');
 perform public.online_test_exchange('b','1','ticket_replayed',gen_random_uuid());
 update public.game_connection_tickets set consumed_at=clock_timestamp()-interval '31 seconds';
 perform public.online_test_exchange('b','1','ticket_replayed');
 perform public.artifact_expect_code('select public.online_test_ticket(''2'')','ticket_replayed');
 update public.game_server_credentials set revoked_at=clock_timestamp() where credential_hash=repeat('b',64);
 perform public.online_test_exchange('b','1','invalid_credential');
 delete from public.game_connection_tickets;
 perform public.online_test_ticket('2');
 update public.game_connection_tickets set created_at=statement_timestamp()-interval '4 minutes',expires_at=statement_timestamp()-interval '1 minute';
 perform public.online_test_exchange('a','2','ticket_expired');
 perform public.online_test_ticket('3');
 perform public.online_test_exchange('a','2','invalid_ticket');
 update public.game_connection_tickets set revoked_at=clock_timestamp() where ticket_hash=repeat('3',64);
 perform public.online_test_exchange('a','3','invalid_ticket');
 perform public.online_test_ticket('4');
 update public.game_online_sessions set status='closed',closed_at=clock_timestamp() where id=sid;
 perform public.online_test_exchange('a','4','invalid_ticket');
 update public.game_online_sessions set status='ready',closed_at=null where id=sid;
 update public.game_online_participants set removed_at=clock_timestamp() where session_id=sid and actor_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 perform public.online_test_exchange('a','4','invalid_ticket');
 update public.game_online_participants set removed_at=null where session_id=sid;
 update public.game_server_deployments set status='disabled' where id='13131313-1313-4313-8313-131313131313';
 perform public.online_test_exchange('a','4','invalid_ticket');
 update public.game_server_deployments set status='active' where id='13131313-1313-4313-8313-131313131313';
 update public.game_launch_sessions set generation=gen_random_uuid() where id=(l->>'id')::uuid;
 perform public.online_test_exchange('a','4','invalid_ticket');
 perform public.online_test_ticket('5');
 update public.game_server_credentials set expires_at=clock_timestamp()-interval '1 second',created_at=clock_timestamp()-interval '1 day' where credential_hash=repeat('a',64);
 perform public.online_test_exchange('a','5','invalid_credential');
 update public.game_server_credentials set expires_at=clock_timestamp()+interval '1 day' where credential_hash=repeat('a',64);
end $$;
reset role;
insert into auth.users select gen_random_uuid() from generate_series(1,128);
do $$ declare sid text; roster jsonb; credential_id uuid; begin
 select jsonb_agg(jsonb_build_object('actorId',id,'displayName','Scale fixture')) into roster from (select id from auth.users limit 128) users;
 sid:=public.distribution_prepare_online_session('12121212-1212-4212-8212-121212121212','13131313-1313-4313-8313-131313131313',roster);
 if (select count(*) from public.game_online_participants where session_id=sid)<>128 then raise exception 'Large roster truncated'; end if;
 credential_id:=public.distribution_create_server_credential('13131313-1313-4313-8313-131313131313',repeat('d',64),clock_timestamp()+interval '1 day');
 perform public.distribution_revoke_server_credential(credential_id);
 if not exists(select 1 from public.game_server_credentials where id=credential_id and revoked_at is not null) then raise exception 'Credential revocation failed'; end if;
 perform public.distribution_remove_online_participant(sid,(select id from public.game_online_participants where session_id=sid limit 1));
 if (select count(*) from public.game_online_participants where session_id=sid and removed_at is not null)<>1 then raise exception 'Participant removal failed'; end if;
 perform public.distribution_close_online_session(sid);
 if not exists(select 1 from public.game_online_sessions where id=sid and status='closed' and closed_at is not null) then raise exception 'Session close failed'; end if;
end $$;
