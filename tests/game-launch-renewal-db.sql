\set ON_ERROR_STOP on
do $$ begin if current_database()<>'chibasko_distribution_test' then raise exception 'Disposable database required'; end if; end $$;
\ir ../supabase/migrations/20261017000200_game_launch_renewals.sql
set role anon;
select public.distribution_expect_failure('select public.distribution_renew_launch(gen_random_uuid(),repeat(''a'',64),1800)');
reset role;
set role authenticated;
select public.distribution_expect_failure('select public.distribution_renew_launch(gen_random_uuid(),repeat(''a'',64),1800)');
reset role;
set role service_role;
do $$ declare s jsonb; r jsonb; context jsonb; old_generation text; begin
 context:=jsonb_build_object('gameId','11111111-1111-4111-8111-111111111111','gameVersionId','33333333-3333-4333-8333-333333333333','execution','local','locale','fr','participants','[]'::jsonb);
 s:=public.distribution_create_launch(null,'11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','published','local',repeat('1',64),repeat('2',64),context,1800,60,600);
 update public.game_launch_sessions set created_at=now()-interval '45 minutes',expires_at=now()+interval '5 minutes' where id=(s->>'id')::uuid;
 old_generation:=s->>'generation';
 r:=public.distribution_renew_launch((s->>'id')::uuid,repeat('2',64),1800);
 if r->>'generation'<>old_generation or (r->>'expires_at')::timestamptz<now()+interval '29 minutes' then raise exception 'Long session renewal failed'; end if;
 if r ? 'control_hash' or r ? 'capability_hash' then raise exception 'Renewal leaked hashes'; end if;
 perform public.distribution_check_launch(repeat('1',64));
 perform public.artifact_expect_code(format('select public.distribution_renew_launch(%L,%L,1800)',s->>'id',repeat('3',64)),'launch_expired');
 perform public.artifact_expect_code(format('select public.distribution_renew_launch(%L,%L,1801)',s->>'id',repeat('2',64)),'invalid_launch_request');
 update public.game_launch_sessions set created_at=now()-interval '23 hours 59 minutes',expires_at=now()+interval '30 seconds' where id=(s->>'id')::uuid;
 r:=public.distribution_renew_launch((s->>'id')::uuid,repeat('2',64),1800);
 if (r->>'expires_at')::timestamptz>now()+interval '61 seconds' then raise exception 'Absolute lifetime was extended'; end if;
 perform public.distribution_revoke_launch((s->>'id')::uuid,repeat('2',64));
 perform public.artifact_expect_code(format('select public.distribution_renew_launch(%L,%L,1800)',s->>'id',repeat('2',64)),'launch_expired');
 -- A valid preview's current membership is required on every renewal.
 context:=jsonb_build_object('gameId','22222222-2222-4222-8222-222222222222','gameVersionId','abababab-abab-4bab-8bab-abababababab','execution','local','locale','fr','participants','[]'::jsonb);
 s:=public.distribution_create_launch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','abababab-abab-4bab-8bab-abababababab','preview','local',repeat('4',64),repeat('5',64),context,1800,60,600);
 perform public.distribution_renew_launch((s->>'id')::uuid,repeat('5',64),1800);
 delete from public.game_developer_members where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 perform public.artifact_expect_code(format('select public.distribution_renew_launch(%L,%L,1800)',s->>'id',repeat('5',64)),'preview_forbidden');
 insert into public.game_developer_members values('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner');
 update public.game_launch_sessions set expires_at=now()-interval '1 second',created_at=now()-interval '31 minutes' where id=(s->>'id')::uuid;
 perform public.artifact_expect_code(format('select public.distribution_renew_launch(%L,%L,1800)',s->>'id',repeat('5',64)),'launch_expired');
 -- Fixture for an actual two-connection renew/revoke race in the JS runner.
 context:=jsonb_build_object('gameId','11111111-1111-4111-8111-111111111111','gameVersionId','33333333-3333-4333-8333-333333333333','execution','local','locale','fr','participants','[]'::jsonb);
 s:=public.distribution_create_launch(null,'11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','published','local',repeat('6',64),repeat('7',64),context,1800,60,600);
 update public.game_launch_sessions set id='cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd' where id=(s->>'id')::uuid;
end $$;
reset role;
