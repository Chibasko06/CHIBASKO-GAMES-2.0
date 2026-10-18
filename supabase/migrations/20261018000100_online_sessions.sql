-- Control-plane resources. No deployment, credential or production session is provisioned here.
begin;
set local lock_timeout='5s';
create table public.game_server_deployments (
 id uuid primary key default gen_random_uuid(),
 game_id uuid not null references public.games(id) on delete restrict,
 hosting_mode text not null check(hosting_mode in ('self_hosted','chibasko_hosted')),
 endpoint text not null check(length(endpoint)<=2048 and endpoint ~ '^(https|wss)://'),
 status text not null default 'disabled' check(status in ('active','disabled')),
 region text check(length(region)<=64),
 created_at timestamptz not null default now(),
 unique(id,game_id)
);
create table public.game_server_deployment_versions (
 deployment_id uuid not null,
 game_id uuid not null,
 version_id uuid not null references public.game_versions(id) on delete restrict,
 primary key(deployment_id,version_id),
 foreign key(deployment_id,game_id) references public.game_server_deployments(id,game_id) on delete restrict
);
create function public.distribution_check_deployment_version() returns trigger
language plpgsql set search_path=pg_catalog,public as $$ begin
 if not exists(select 1 from public.game_versions where id=new.version_id and game_id=new.game_id
  and manifest#>'{capabilities,online}' is not null) then raise exception 'invalid_deployment'; end if;
 return new; end $$;
create trigger check_deployment_version before insert or update on public.game_server_deployment_versions
 for each row execute function public.distribution_check_deployment_version();
create table public.game_online_sessions (
 id text primary key default 's_'||replace(gen_random_uuid()::text,'-','') check(id ~ '^s_[a-f0-9]{32}$'),
 version_id uuid not null,
 deployment_id uuid not null,
 status text not null default 'ready' check(status in ('ready','closed')),
 created_at timestamptz not null default now(),
 closed_at timestamptz,
 foreign key(deployment_id,version_id) references public.game_server_deployment_versions(deployment_id,version_id) on delete restrict
);
create table public.game_online_participants (
 session_id text not null references public.game_online_sessions(id) on delete cascade,
 id text not null default 'p_'||replace(gen_random_uuid()::text,'-','') check(id ~ '^p_[a-f0-9]{32}$'),
 actor_id uuid not null references auth.users(id) on delete cascade,
 display_name text not null check(length(display_name) between 1 and 80 and display_name !~ '[[:cntrl:]]'),
 removed_at timestamptz,
 primary key(session_id,id), unique(session_id,actor_id)
);
create table public.game_server_credentials (
 id uuid primary key default gen_random_uuid(),
 deployment_id uuid not null references public.game_server_deployments(id) on delete restrict,
 credential_hash text not null unique check(credential_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 check(expires_at>created_at)
);
create table public.game_connection_tickets (
 ticket_hash text primary key check(ticket_hash ~ '^[a-f0-9]{64}$'),
 session_id text not null,
 participant_id text not null,
 launch_id uuid not null references public.game_launch_sessions(id) on delete cascade,
 generation uuid not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 consumed_at timestamptz,
 exchange_request_id uuid,
 exchange_credential_id uuid references public.game_server_credentials(id) on delete restrict,
 claims jsonb,
 foreign key(session_id,participant_id) references public.game_online_participants(session_id,id) on delete cascade,
 check(expires_at>created_at and expires_at<=created_at+interval '3 minutes'),
 check((consumed_at is null and exchange_request_id is null and exchange_credential_id is null and claims is null)
  or (consumed_at is not null and exchange_request_id is not null and exchange_credential_id is not null and claims is not null))
);
create index game_ticket_cleanup_idx on public.game_connection_tickets(expires_at);
create index game_ticket_launch_idx on public.game_connection_tickets(launch_id);
create unique index game_ticket_exchange_request_unique on public.game_connection_tickets(exchange_credential_id,exchange_request_id)
 where consumed_at is not null;
create table public.game_exchange_limits (
 key text primary key,
 window_start timestamptz not null,
 attempts integer not null check(attempts>0)
);
create function public.distribution_create_server_credential(p_deployment uuid,p_hash text,p_expires timestamptz) returns uuid
language plpgsql security invoker set search_path=pg_catalog,public as $$ declare result uuid; begin
 if p_expires<clock_timestamp()+interval '1 hour' or p_expires>clock_timestamp()+interval '90 days' then raise exception 'invalid_credential'; end if;
 insert into public.game_server_credentials(deployment_id,credential_hash,expires_at) values(p_deployment,p_hash,p_expires) returning id into result;
 return result;
end $$;
create function public.distribution_revoke_server_credential(p_id uuid) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$ begin
 update public.game_server_credentials set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=p_id;
end $$;
create function public.distribution_close_online_session(p_id text) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$ begin
 update public.game_online_sessions set status='closed',closed_at=coalesce(closed_at,clock_timestamp()) where id=p_id;
end $$;
create function public.distribution_remove_online_participant(p_session text,p_participant text) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$ begin
 update public.game_online_participants set removed_at=coalesce(removed_at,clock_timestamp()) where session_id=p_session and id=p_participant;
end $$;
-- The old cap bounded wire payloads to 64 players. Bridge v2 supports larger rosters.
alter table public.game_launch_sessions drop constraint game_launch_sessions_safe_context_check;
alter table public.game_launch_sessions add constraint game_launch_sessions_safe_context_check
 check(jsonb_typeof(safe_context)='object' and octet_length(safe_context::text)<=1048576);

create function public.distribution_online_context(p_actor uuid,p_reference text,p_game uuid,p_version uuid,p_locale text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.game_online_sessions; p public.game_online_participants; roster jsonb; begin
 select * into s from public.game_online_sessions where id=p_reference for share;
 if not found or s.status<>'ready' or s.version_id<>p_version then raise exception 'online_session_unavailable'; end if;
 if not exists(select 1 from public.game_versions where id=p_version and game_id=p_game)
  or not exists(select 1 from public.game_server_deployments where id=s.deployment_id and status='active') then raise exception 'online_session_unavailable'; end if;
 select * into p from public.game_online_participants where session_id=s.id and actor_id=p_actor and removed_at is null;
 if not found then raise exception 'online_session_unavailable'; end if;
 select jsonb_agg(jsonb_build_object('participantId',id,'username',display_name) order by id) into roster
 from public.game_online_participants where session_id=s.id and removed_at is null;
 return jsonb_build_object('gameId',p_game,'gameVersionId',p_version,'execution','online','locale',p_locale,
  'participants',roster,'session',jsonb_build_object('sessionId',s.id,'localParticipantIds',jsonb_build_array(p.id)));
end $$;

-- Only the authenticated lobby/control-plane service can provision a roster.
create function public.distribution_prepare_online_session(p_version uuid,p_deployment uuid,p_participants jsonb) returns text
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare sid text; capacity jsonb; item jsonb; begin
 select manifest#>'{capabilities,online,players}' into capacity from public.game_versions where id=p_version;
 if capacity is null or jsonb_typeof(p_participants)<>'array'
  or jsonb_array_length(p_participants) not between (capacity->>'min')::integer and (capacity->>'max')::integer
  or jsonb_array_length(p_participants)>4096 then raise exception 'invalid_online_roster'; end if;
 if not exists(select 1 from public.game_server_deployments where id=p_deployment and status='active') then raise exception 'invalid_deployment'; end if;
 insert into public.game_online_sessions(version_id,deployment_id) values(p_version,p_deployment) returning id into sid;
 for item in select * from jsonb_array_elements(p_participants) loop
  insert into public.game_online_participants(session_id,actor_id,display_name) values(sid,(item->>'actorId')::uuid,item->>'displayName');
 end loop;
 return sid;
end $$;

create function public.distribution_issue_connection_ticket(p_launch uuid,p_control_hash text,p_generation uuid,p_ticket_hash text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare l public.game_launch_sessions; s public.game_online_sessions; p public.game_online_participants; d public.game_server_deployments; issued timestamptz; expiry timestamptz; begin
 select * into l from public.game_launch_sessions where id=p_launch and control_hash=p_control_hash for update;
 if not found or l.revoked_at is not null or l.expires_at<=clock_timestamp() or l.generation<>p_generation or l.execution<>'online' then raise exception 'launch_expired'; end if;
 perform public.distribution_authorize_launch(l.issued_by,(l.safe_context->>'gameId')::uuid,l.version_id,l.audience,l.execution);
 select * into s from public.game_online_sessions where id=l.safe_context#>>'{session,sessionId}' for share;
 if not found or s.status<>'ready' or s.version_id<>l.version_id then raise exception 'online_session_unavailable'; end if;
 select * into p from public.game_online_participants where session_id=s.id and actor_id=l.issued_by and removed_at is null for share;
 if not found or l.safe_context#>'{session,localParticipantIds}'<>jsonb_build_array(p.id) then raise exception 'online_session_unavailable'; end if;
 select * into d from public.game_server_deployments where id=s.deployment_id and status='active' for share;
 if not found then raise exception 'online_session_unavailable'; end if;
 perform public.distribution_api_limit(l.issued_by,60);
 if exists(select 1 from public.game_connection_tickets where launch_id=l.id and consumed_at is not null) then raise exception 'ticket_replayed'; end if;
 -- A lost START response can be retried; only the most recently issued ticket survives.
 update public.game_connection_tickets set revoked_at=coalesce(revoked_at,clock_timestamp()) where launch_id=l.id;
 issued:=clock_timestamp();expiry:=least(issued+interval '3 minutes',l.expires_at);
 insert into public.game_connection_tickets(ticket_hash,session_id,participant_id,launch_id,generation,created_at,expires_at)
 values(p_ticket_hash,s.id,p.id,l.id,l.generation,issued,expiry);
 return jsonb_build_object('execution','online','online',jsonb_build_object('onlineSessionId',s.id,'participantId',p.id,
  'server',jsonb_build_object('endpoint',d.endpoint,'expiresAt',expiry)));
end $$;

create function public.distribution_exchange_connection_ticket(p_credential_hash text,p_ticket_hash text,p_request uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare c public.game_server_credentials; t public.game_connection_tickets; s public.game_online_sessions;
 p public.game_online_participants; l public.game_launch_sessions; v public.game_versions; d public.game_server_deployments;
 count_attempts integer; result jsonb; begin
 -- Return failures as values so unsuccessful attempts still commit rate counters.
 select * into c from public.game_server_credentials where credential_hash=p_credential_hash for share;
 if not found or c.revoked_at is not null or c.expires_at<=clock_timestamp() then
  insert into public.game_exchange_limits as limits values('invalid-auth',clock_timestamp(),1)
  on conflict(key) do update set attempts=case when limits.window_start<clock_timestamp()-interval '1 minute' then 1 else limits.attempts+1 end,
  window_start=case when limits.window_start<clock_timestamp()-interval '1 minute' then clock_timestamp() else limits.window_start end returning attempts into count_attempts;
  return jsonb_build_object('error',jsonb_build_object('code',case when count_attempts>10000 then 'rate_limited' else 'invalid_credential' end));
 end if;
 insert into public.game_exchange_limits as limits values(c.id::text,clock_timestamp(),1)
 on conflict(key) do update set attempts=case when limits.window_start<clock_timestamp()-interval '1 minute' then 1 else limits.attempts+1 end,
 window_start=case when limits.window_start<clock_timestamp()-interval '1 minute' then clock_timestamp() else limits.window_start end returning attempts into count_attempts;
 if count_attempts>600 then return jsonb_build_object('error',jsonb_build_object('code','rate_limited')); end if;
 select * into t from public.game_connection_tickets where ticket_hash=p_ticket_hash;
 if not found then return jsonb_build_object('error',jsonb_build_object('code','invalid_ticket')); end if;
 select * into l from public.game_launch_sessions where id=t.launch_id for share;
 select * into t from public.game_connection_tickets where ticket_hash=p_ticket_hash for update;
 if not found then return jsonb_build_object('error',jsonb_build_object('code','invalid_ticket')); end if;
 select * into s from public.game_online_sessions where id=t.session_id for share;
 select * into d from public.game_server_deployments where id=s.deployment_id for share;
 select * into p from public.game_online_participants where session_id=s.id and id=t.participant_id for share;
 select * into v from public.game_versions where id=s.version_id;
 if d.id<>c.deployment_id or d.status<>'active' or s.status<>'ready' or p.id is null or p.removed_at is not null
  or l.id is null or l.revoked_at is not null or l.expires_at<=clock_timestamp() or l.generation<>t.generation
  or l.version_id<>s.version_id or l.issued_by<>p.actor_id or l.execution<>'online'
  or l.safe_context#>>'{session,sessionId}'<>s.id or l.safe_context#>'{session,localParticipantIds}'<>jsonb_build_array(p.id)
  or t.revoked_at is not null then return jsonb_build_object('error',jsonb_build_object('code','invalid_ticket')); end if;
 begin perform public.distribution_authorize_launch(l.issued_by,v.game_id,v.id,l.audience,l.execution);
 exception when others then return jsonb_build_object('error',jsonb_build_object('code','invalid_ticket')); end;
 if t.expires_at<=clock_timestamp() then return jsonb_build_object('error',jsonb_build_object('code','ticket_expired')); end if;
 if t.consumed_at is not null then
  if t.exchange_request_id=p_request and t.exchange_credential_id=c.id and t.consumed_at>clock_timestamp()-interval '30 seconds' then return jsonb_build_object('data',t.claims); end if;
  return jsonb_build_object('error',jsonb_build_object('code','ticket_replayed'));
 end if;
 if exists(select 1 from public.game_connection_tickets where exchange_credential_id=c.id and exchange_request_id=p_request)
 then return jsonb_build_object('error',jsonb_build_object('code','ticket_replayed')); end if;
 result:=jsonb_build_object('gameId',v.game_id,'gameVersionId',v.id,'onlineSessionId',s.id,
  'participant',jsonb_build_object('id',p.id,'displayName',p.display_name));
 update public.game_connection_tickets set consumed_at=clock_timestamp(),exchange_request_id=p_request,exchange_credential_id=c.id,claims=result where ticket_hash=t.ticket_hash;
 return jsonb_build_object('data',result);
end $$;

create function public.distribution_cleanup_online() returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$ begin
 delete from public.game_connection_tickets where expires_at<clock_timestamp()-interval '1 hour';
 delete from public.game_exchange_limits where window_start<clock_timestamp()-interval '1 hour';
 delete from public.game_online_sessions s where s.status='closed' and s.closed_at<clock_timestamp()-interval '1 day'
  and not exists(select 1 from public.game_connection_tickets where session_id=s.id);
end $$;
do $$ declare resource text; f record; begin
 foreach resource in array array['game_server_deployments','game_server_deployment_versions','game_online_sessions','game_online_participants',
 'game_server_credentials','game_connection_tickets','game_exchange_limits'] loop
 execute format('alter table public.%I enable row level security',resource);
 execute format('revoke all on public.%I from public,anon,authenticated',resource);
 execute format('grant select,insert,update,delete on public.%I to service_role',resource);
 end loop;
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname=any(array[
 'distribution_online_context','distribution_prepare_online_session','distribution_issue_connection_ticket','distribution_exchange_connection_ticket','distribution_cleanup_online',
 'distribution_create_server_credential','distribution_revoke_server_credential','distribution_close_online_session','distribution_remove_online_participant',
 'distribution_check_deployment_version']) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
