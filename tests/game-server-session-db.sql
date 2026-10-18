\set ON_ERROR_STOP on
set role anon;
select public.distribution_expect_failure('select public.distribution_server_session(repeat(''a'',64),''s_''||repeat(''1'',32))');
select public.get_published_game_runtimes();
reset role;
set role service_role;
do $$ declare sid text; h text:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text); result jsonb; begin
 sid:=public.distribution_prepare_online_session('24242424-2424-4424-8424-242424242424','25252525-2525-4525-8525-252525252525',
 '[{"actorId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","displayName":"A"},{"actorId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","displayName":"B"}]');
 insert into public.game_server_credentials(deployment_id,credential_hash,expires_at) values('25252525-2525-4525-8525-252525252525',h,clock_timestamp()+interval '1 hour');
 result:=public.distribution_server_session(h,sid);
 if jsonb_array_length(result#>'{data,participants}')<>2 or result::text like '%aaaaaaaa-aaaa%' or result::text like '%actorId%' then raise exception 'Unsafe or incomplete roster'; end if;
 if public.distribution_server_session(repeat('a',64),sid)#>>'{error,code}'<>'online_session_unavailable' then raise exception 'Cross-deployment roster access'; end if;
 update public.game_server_credentials set revoked_at=clock_timestamp() where credential_hash=h;
 if public.distribution_server_session(h,sid)#>>'{error,code}'<>'invalid_credential' then raise exception 'Revoked credential accepted'; end if;
 perform public.distribution_close_online_session(sid);
 if public.distribution_server_session(repeat('7',64),sid)#>>'{error,code}'<>'online_session_unavailable' then raise exception 'Closed session exposed'; end if;
end $$;
reset role;
