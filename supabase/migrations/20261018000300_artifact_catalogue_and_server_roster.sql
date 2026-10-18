begin;
-- Public catalogue projection contains no manifest internals or creator identity.
create function public.get_published_game_runtimes() returns table(game_id uuid,version_id uuid,capabilities jsonb)
language sql stable security definer set search_path=pg_catalog,public as $$
 select g.id,v.id,v.manifest->'capabilities' from public.games g join public.game_versions v on v.id=g.active_version_id and v.game_id=g.id
 where g.is_published and v.status='published'
$$;
revoke all on function public.get_published_game_runtimes() from public;
grant execute on function public.get_published_game_runtimes() to anon,authenticated,service_role;

create function public.distribution_server_session(p_credential_hash text,p_session text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare c public.game_server_credentials; s public.game_online_sessions; roster jsonb; n integer; game uuid; begin
 select * into c from public.game_server_credentials where credential_hash=p_credential_hash and revoked_at is null and expires_at>clock_timestamp() for share;
 insert into public.game_exchange_limits(key,window_start,attempts) values('roster:'||coalesce(c.id::text,'invalid'),date_trunc('minute',clock_timestamp()),1)
 on conflict(key) do update set window_start=excluded.window_start,
 attempts=case when game_exchange_limits.window_start=excluded.window_start then game_exchange_limits.attempts+1 else 1 end returning attempts into n;
 if n>600 then return jsonb_build_object('error',jsonb_build_object('code','rate_limited')); end if;
 if c.id is null then return jsonb_build_object('error',jsonb_build_object('code','invalid_credential')); end if;
 select * into s from public.game_online_sessions where id=p_session and deployment_id=c.deployment_id and status='ready' for share;
 if not found or not exists(select 1 from public.game_server_deployments where id=c.deployment_id and status='active') then
  return jsonb_build_object('error',jsonb_build_object('code','online_session_unavailable')); end if;
 if exists(select 1 from public.game_online_participants where session_id=s.id and removed_at is not null) then
  return jsonb_build_object('error',jsonb_build_object('code','online_session_unavailable')); end if;
 select jsonb_agg(jsonb_build_object('id',id,'displayName',display_name) order by id) into roster from public.game_online_participants where session_id=s.id;
 select game_id into game from public.game_versions where id=s.version_id;
 return jsonb_build_object('data',jsonb_build_object('gameId',game,'gameVersionId',s.version_id,'onlineSessionId',s.id,'participants',roster));
end $$;
revoke all on function public.distribution_server_session(text,text) from public,anon,authenticated;
grant execute on function public.distribution_server_session(text,text) to service_role;
commit;
