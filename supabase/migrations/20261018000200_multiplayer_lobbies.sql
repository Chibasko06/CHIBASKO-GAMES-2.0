-- The lobby lock serializes seats, roster changes and rounds across all API instances.
begin;
create table public.multiplayer_game_policies (
 game_id uuid primary key references public.games(id) on delete cascade,
 start_policy text not null default 'manual' check(start_policy in ('manual','when_full'))
);
create table public.multiplayer_lobbies (
 id uuid primary key default gen_random_uuid(),
 game_id uuid not null references public.games(id),
 version_id uuid not null references public.game_versions(id),
 access text not null check(access in ('public','private')),
 code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,20)) check(code ~ '^[A-F0-9]{20}$'),
 status text not null default 'waiting' check(status in ('waiting','starting','playing','results','closed')),
 min_players integer not null check(min_players between 1 and 4096),
 max_players integer not null check(max_players between min_players and 4096),
 start_policy text not null check(start_policy in ('manual','when_full')),
 leader_actor uuid references auth.users(id) on delete set null,
 revision bigint not null default 1,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '24 hours',
 waiting_until timestamptz not null default clock_timestamp()+interval '30 minutes',
 foreign key(version_id,game_id) references public.game_versions(id,game_id),
 check(waiting_until<=expires_at)
);
create table public.multiplayer_lobby_members (
 lobby_id uuid not null references public.multiplayer_lobbies(id) on delete cascade,
 actor_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null default gen_random_uuid() unique,
 ready boolean not null default false,
 joined_at timestamptz not null default clock_timestamp(),
 primary key(lobby_id,actor_id)
);
-- Round history preserves session identity across replay and prevents premature session GC.
create table public.multiplayer_lobby_rounds (
 lobby_id uuid not null references public.multiplayer_lobbies(id) on delete cascade,
 round integer not null check(round>0),
 session_id text not null unique references public.game_online_sessions(id),
 created_at timestamptz not null default clock_timestamp(),
 finished_at timestamptz,
 primary key(lobby_id,round)
);
create index multiplayer_directory on public.multiplayer_lobbies(game_id,id) where access='public' and status='waiting';
create index multiplayer_expiry on public.multiplayer_lobbies(expires_at) where status<>'closed';
create index multiplayer_waiting_expiry on public.multiplayer_lobbies(waiting_until) where status='waiting';
create index multiplayer_actor_memberships on public.multiplayer_lobby_members(actor_id,lobby_id);
create index multiplayer_round_active on public.multiplayer_lobby_rounds(lobby_id,round desc);
create unique index multiplayer_one_unfinished_round on public.multiplayer_lobby_rounds(lobby_id) where finished_at is null;
create function public.distribution_multiplayer_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if row(new.id,new.game_id,new.version_id,new.access,new.code,new.min_players,new.max_players,new.start_policy,new.created_at,new.expires_at)
 is distinct from row(old.id,old.game_id,old.version_id,old.access,old.code,old.min_players,old.max_players,old.start_policy,old.created_at,old.expires_at)
 then raise exception 'Lobby configuration is immutable'; end if;
 return new;
end $$;
create trigger multiplayer_pin before update on public.multiplayer_lobbies for each row execute function public.distribution_multiplayer_guard();
create table public.multiplayer_api_limits (
 actor_id uuid not null references auth.users(id) on delete cascade,
 operation text not null, window_at timestamptz not null, hits integer not null,
 primary key(actor_id,operation)
);

create function public.distribution_multiplayer_access(p_game uuid,p_version uuid,p_access text) returns boolean
language sql security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.games g join public.game_versions v on v.game_id=g.id
  where g.id=p_game and g.is_published and v.id=p_version and v.status='published'
  and v.manifest#>'{capabilities,online,access}' ? p_access)
$$;

create function public.distribution_multiplayer_limit(p_actor uuid,p_operation text) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare n integer; lim integer; begin
 if p_actor is null then return false; end if;
 lim:=case p_operation when 'create' then 10 when 'lookup' then 20 when 'list' then 60 when 'get' then 60 else 30 end;
 insert into public.multiplayer_api_limits values(p_actor,p_operation,date_trunc('minute',clock_timestamp()),1)
 on conflict(actor_id,operation) do update set window_at=excluded.window_at,
 hits=case when multiplayer_api_limits.window_at=excluded.window_at then multiplayer_api_limits.hits+1 else 1 end returning hits into n;
 return n<=lim;
end $$;

create function public.distribution_multiplayer_snapshot(p_actor uuid,p_id uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare l public.multiplayer_lobbies; players jsonb; sid text; begin
 select * into l from public.multiplayer_lobbies where id=p_id for share;
 if not found or not exists(select 1 from public.multiplayer_lobby_members where lobby_id=p_id and actor_id=p_actor) then raise exception 'lobby_not_found'; end if;
 select jsonb_agg(jsonb_build_object('id',m.id,'displayName',coalesce(nullif(left(p.username,80),''),'Joueur'),
  'self',m.actor_id=p_actor,'leader',m.actor_id=l.leader_actor,'ready',m.ready) order by m.joined_at,m.id)
 into players from public.multiplayer_lobby_members m left join public.profiles p on p.id=m.actor_id where m.lobby_id=p_id;
 select session_id into sid from public.multiplayer_lobby_rounds where lobby_id=p_id order by round desc limit 1;
 return jsonb_build_object('id',l.id,'gameId',l.game_id,'gameVersionId',l.version_id,'access',l.access,'code',l.code,
  'status',case when l.expires_at<=clock_timestamp() or (l.status='waiting' and l.waiting_until<=clock_timestamp()) then 'closed' else l.status end,
  'minPlayers',l.min_players,'maxPlayers',l.max_players,'startPolicy',l.start_policy,'revision',l.revision,
  'expiresAt',l.expires_at,'members',coalesce(players,'[]'),'onlineSessionReference',sid);
end $$;

create function public.distribution_multiplayer_start(p_actor uuid,p_id uuid,p_automatic boolean default false) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare l public.multiplayer_lobbies; n integer; roster jsonb; dep uuid; sid text; begin
 select * into l from public.multiplayer_lobbies where id=p_id for update;
 if not found or not exists(select 1 from public.multiplayer_lobby_members where lobby_id=p_id and actor_id=p_actor) then raise exception 'lobby_not_found'; end if;
 if l.expires_at<=clock_timestamp() or (l.status='waiting' and l.waiting_until<=clock_timestamp()) then raise exception 'lobby_expired'; end if;
 if l.status in ('starting','playing') then return public.distribution_multiplayer_snapshot(p_actor,p_id); end if;
 if l.status<>'waiting' then raise exception 'invalid_state'; end if;
 if (not p_automatic and l.leader_actor is distinct from p_actor) or (p_automatic and l.start_policy<>'when_full') then raise exception 'forbidden'; end if;
 select count(*),jsonb_agg(jsonb_build_object('actorId',m.actor_id,'displayName',coalesce(nullif(left(p.username,80),''),'Joueur')) order by m.joined_at,m.id)
 into n,roster from public.multiplayer_lobby_members m left join public.profiles p on p.id=m.actor_id where m.lobby_id=p_id;
 if n<l.min_players or n>l.max_players or exists(select 1 from public.multiplayer_lobby_members where lobby_id=p_id and not ready)
  or (p_automatic and n<>l.max_players) then raise exception 'not_ready'; end if;
 perform 1 from public.games g join public.game_versions v on v.game_id=g.id where g.id=l.game_id and g.is_published and v.id=l.version_id and v.status='published' for share of g,v;
 if not found then raise exception 'version_unavailable'; end if;
 select d.id into dep from public.game_server_deployments d join public.game_server_deployment_versions v on v.deployment_id=d.id
 where v.version_id=l.version_id and d.game_id=l.game_id and d.status='active' order by d.created_at,d.id limit 1 for share of d;
 if dep is null then raise exception 'deployment_unavailable'; end if;
 sid:=public.distribution_prepare_online_session(l.version_id,dep,roster);
 insert into public.multiplayer_lobby_rounds(lobby_id,round,session_id) select p_id,coalesce(max(round),0)+1,sid from public.multiplayer_lobby_rounds where lobby_id=p_id;
 update public.multiplayer_lobbies set status='starting',revision=revision+1 where id=p_id;
 return public.distribution_multiplayer_snapshot(p_actor,p_id);
end $$;

create function public.distribution_multiplayer_create(p_actor uuid,p_game uuid,p_access text,p_request uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.game_versions; l public.multiplayer_lobbies; policy text; begin
 if p_actor is null then raise exception 'unauthorized'; end if;
 if p_access not in ('public','private') or p_request is null then raise exception 'invalid_request'; end if;
 -- A request UUID makes authenticated transport retries idempotent without a process cache.
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into l from public.multiplayer_lobbies where id=p_request;
 if found then
  if l.game_id<>p_game or l.access<>p_access or not exists(select 1 from public.multiplayer_lobby_members where lobby_id=l.id and actor_id=p_actor) then raise exception 'request_conflict'; end if;
  return public.distribution_multiplayer_snapshot(p_actor,l.id);
 end if;
 select gv.* into v from public.games g join public.game_versions gv on gv.id=g.active_version_id and gv.game_id=g.id
 where g.id=p_game and g.is_published and gv.status='published' for share of g,gv;
 if not found then raise exception 'game_not_available'; end if;
 if not coalesce(v.manifest#>'{capabilities,online,access}' ? p_access,false) then raise exception 'unsupported_access'; end if;
 select start_policy into policy from public.multiplayer_game_policies where game_id=p_game;
 insert into public.multiplayer_lobbies(id,game_id,version_id,access,min_players,max_players,start_policy,leader_actor)
 values(p_request,p_game,v.id,p_access,(v.manifest#>>'{capabilities,online,players,min}')::integer,
  (v.manifest#>>'{capabilities,online,players,max}')::integer,coalesce(policy,'manual'),p_actor);
 insert into public.multiplayer_lobby_members(lobby_id,actor_id) values(p_request,p_actor);
 return public.distribution_multiplayer_snapshot(p_actor,p_request);
end $$;

create function public.distribution_multiplayer_mutate(p_actor uuid,p_id uuid,p_action text,p_ready boolean default false) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare l public.multiplayer_lobbies; n integer; sid text; begin
 select * into l from public.multiplayer_lobbies where id=p_id for update;
 if not found then raise exception 'lobby_not_found'; end if;
 if p_action<>'leave' and (l.expires_at<=clock_timestamp() or (l.status='waiting' and l.waiting_until<=clock_timestamp())) then raise exception 'lobby_expired'; end if;
 if p_action in ('join','join_code') then
  if exists(select 1 from public.multiplayer_lobby_members where lobby_id=p_id and actor_id=p_actor) then return public.distribution_multiplayer_snapshot(p_actor,p_id); end if;
  if l.status<>'waiting' then raise exception 'invalid_state'; end if;
  if l.access='private' and p_action<>'join_code' then raise exception 'lobby_not_found'; end if;
  if not public.distribution_multiplayer_access(l.game_id,l.version_id,l.access) then raise exception 'version_unavailable'; end if;
  select count(*) into n from public.multiplayer_lobby_members where lobby_id=p_id;
  if n>=l.max_players then raise exception 'lobby_full'; end if;
  insert into public.multiplayer_lobby_members(lobby_id,actor_id) values(p_id,p_actor);
 else
  if not exists(select 1 from public.multiplayer_lobby_members where lobby_id=p_id and actor_id=p_actor) then raise exception 'lobby_not_found'; end if;
  if p_action='ready' then
   if l.status<>'waiting' then raise exception 'invalid_state'; end if;
   update public.multiplayer_lobby_members set ready=p_ready where lobby_id=p_id and actor_id=p_actor;
  elsif p_action='leave' then
   -- The round roster is frozen. Removal revokes future admission without mutating its identity.
   select session_id into sid from public.multiplayer_lobby_rounds where lobby_id=p_id and finished_at is null;
   if sid is not null then update public.game_online_participants set removed_at=clock_timestamp() where session_id=sid and actor_id=p_actor; end if;
   delete from public.multiplayer_lobby_members where lobby_id=p_id and actor_id=p_actor;
   if sid is not null and l.status='starting' then
    perform public.distribution_close_online_session(sid);
    update public.multiplayer_lobby_rounds set finished_at=clock_timestamp() where session_id=sid;
    update public.multiplayer_lobbies set status='results' where id=p_id;
   end if;
   if l.leader_actor=p_actor then
    update public.multiplayer_lobbies set leader_actor=(select actor_id from public.multiplayer_lobby_members where lobby_id=p_id order by joined_at,id limit 1) where id=p_id;
   end if;
   if not exists(select 1 from public.multiplayer_lobby_members where lobby_id=p_id) then
    if sid is not null then perform public.distribution_close_online_session(sid); end if;
    update public.multiplayer_lobbies set status='closed' where id=p_id;
   end if;
   update public.multiplayer_lobbies set revision=revision+1 where id=p_id;
   return jsonb_build_object('left',true);
  elsif p_action='replay' then
   if l.status<>'results' or l.leader_actor is distinct from p_actor then raise exception 'invalid_state'; end if;
   update public.multiplayer_lobbies set status='waiting',waiting_until=least(expires_at,clock_timestamp()+interval '30 minutes') where id=p_id;
   update public.multiplayer_lobby_members set ready=false where lobby_id=p_id;
  else raise exception 'invalid_request'; end if;
 end if;
 update public.multiplayer_lobbies set revision=revision+1 where id=p_id;
 if l.start_policy='when_full' and (select count(*)=l.max_players and bool_and(ready) from public.multiplayer_lobby_members where lobby_id=p_id) then
  return public.distribution_multiplayer_start(p_actor,p_id,true);
 end if;
 return public.distribution_multiplayer_snapshot(p_actor,p_id);
end $$;

create function public.distribution_multiplayer_list(p_actor uuid,p_game uuid,p_after uuid default null) returns jsonb
language sql security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(row),'[]') from (
  select l.id,l.game_id as "gameId",l.version_id as "gameVersionId",l.max_players as "maxPlayers",count(m.actor_id)::integer as "currentPlayers"
  from public.multiplayer_lobbies l left join public.multiplayer_lobby_members m on m.lobby_id=l.id
  join public.games g on g.id=l.game_id and g.is_published
  join public.game_versions v on v.id=l.version_id and v.status='published'
  where p_actor is not null and l.game_id=p_game and l.access='public' and l.status='waiting' and l.expires_at>clock_timestamp() and l.waiting_until>clock_timestamp()
   and (p_after is null or l.id>p_after)
  group by l.id having count(m.actor_id)<l.max_players order by l.id limit 25
 ) row
$$;

create function public.distribution_multiplayer_lookup(p_actor uuid,p_game uuid,p_code text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$ declare target uuid; begin
 select id into target from public.multiplayer_lobbies where game_id=p_game and code=p_code and access='private';
 if target is null then raise exception 'lobby_not_found'; end if;
 return public.distribution_multiplayer_mutate(p_actor,target,'join_code');
end $$;

-- Trusted session orchestration only: browsers cannot declare a round started or finished.
create function public.distribution_multiplayer_round(p_session text,p_event text) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$ declare target uuid; l public.multiplayer_lobbies; begin
 select lobby_id into target from public.multiplayer_lobby_rounds where session_id=p_session;
 if target is null then raise exception 'lobby_not_found'; end if;
 select * into l from public.multiplayer_lobbies where id=target for update;
 if not exists(select 1 from public.multiplayer_lobby_rounds where lobby_id=target and session_id=p_session and finished_at is null) then return; end if;
 if p_event='playing' and l.status='starting' then update public.multiplayer_lobbies set status='playing',revision=revision+1 where id=target;
 elsif p_event='results' and l.status in ('starting','playing') then
  perform public.distribution_close_online_session(p_session);
  update public.multiplayer_lobby_rounds set finished_at=clock_timestamp() where session_id=p_session;
  update public.multiplayer_lobbies set status='results',revision=revision+1 where id=target;
 elsif p_event not in ('playing','results') then raise exception 'invalid_request'; end if;
end $$;

create function public.distribution_multiplayer_server_event(p_credential_hash text,p_session text,p_event text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.game_server_credentials; target uuid; attempts integer; begin
 select * into c from public.game_server_credentials where credential_hash=p_credential_hash and revoked_at is null and expires_at>clock_timestamp() for share;
 insert into public.game_exchange_limits(key,window_start,attempts)
 values('lifecycle:'||coalesce(c.id::text,'invalid'),date_trunc('minute',clock_timestamp()),1)
 on conflict(key) do update set window_start=excluded.window_start,
 attempts=case when game_exchange_limits.window_start=excluded.window_start then game_exchange_limits.attempts+1 else 1 end returning game_exchange_limits.attempts into attempts;
 if attempts>(case when c.id is null then 10000 else 600 end) then return jsonb_build_object('error',jsonb_build_object('code','rate_limited')); end if;
 if c.id is null then return jsonb_build_object('error',jsonb_build_object('code','invalid_credential')); end if;
 if p_event not in ('playing','results') or p_event is null then return jsonb_build_object('error',jsonb_build_object('code','invalid_request')); end if;
 select lobby_id into target from public.multiplayer_lobby_rounds where session_id=p_session;
 if target is null then return jsonb_build_object('error',jsonb_build_object('code','online_session_unavailable')); end if;
 perform 1 from public.multiplayer_lobbies where id=target for update;
 perform 1 from public.game_online_sessions s join public.game_server_deployments d on d.id=s.deployment_id
 where s.id=p_session and d.id=c.deployment_id and d.status='active' for share of d;
 if not found then return jsonb_build_object('error',jsonb_build_object('code','online_session_unavailable')); end if;
 perform public.distribution_multiplayer_round(p_session,p_event);
 return jsonb_build_object('data',jsonb_build_object('accepted',true));
end $$;

create function public.distribution_cleanup_multiplayer() returns void
language plpgsql security invoker set search_path=public,pg_temp as $$ declare l public.multiplayer_lobbies; s text; begin
 for l in select * from public.multiplayer_lobbies where status<>'closed' and (expires_at<=clock_timestamp() or (status='waiting' and waiting_until<=clock_timestamp())) order by id for update skip locked loop
  for s in select session_id from public.multiplayer_lobby_rounds where lobby_id=l.id and finished_at is null loop perform public.distribution_close_online_session(s); end loop;
  update public.multiplayer_lobbies set status='closed',revision=revision+1 where id=l.id;
 end loop;
 delete from public.multiplayer_lobbies where status='closed' and expires_at<clock_timestamp()-interval '7 days';
 delete from public.multiplayer_api_limits where window_at<clock_timestamp()-interval '1 hour';
end $$;

-- Session GC must retain round history until lobby retention releases its reference.
create or replace function public.distribution_cleanup_online() returns void language plpgsql security invoker set search_path=public,pg_temp as $$ begin
 delete from public.game_connection_tickets where expires_at<clock_timestamp()-interval '1 hour';
 delete from public.game_exchange_limits where window_start<clock_timestamp()-interval '1 hour';
 delete from public.game_online_sessions s where status='closed' and closed_at<clock_timestamp()-interval '1 day'
  and not exists(select 1 from public.game_connection_tickets t where t.session_id=s.id)
  and not exists(select 1 from public.multiplayer_lobby_rounds r where r.session_id=s.id);
end $$;

do $$ declare t text; f record; begin
 foreach t in array array['multiplayer_game_policies','multiplayer_lobbies','multiplayer_lobby_members','multiplayer_lobby_rounds','multiplayer_api_limits'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'distribution_multiplayer_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
revoke all on function public.distribution_cleanup_multiplayer() from public,anon,authenticated;
grant execute on function public.distribution_cleanup_multiplayer() to service_role;

commit;
