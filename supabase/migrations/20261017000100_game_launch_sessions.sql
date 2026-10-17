-- Prepared only. No production application, identity grants or content publication.
begin;
set local lock_timeout='5s';
create table public.game_launch_sessions (
 id uuid primary key default gen_random_uuid(),
 version_id uuid not null references public.game_versions(id) on delete restrict,
 issued_by uuid references auth.users(id) on delete cascade,
 audience text not null check(audience in ('published','preview')),
 execution text not null check(execution in ('local','online')),
 generation uuid not null default gen_random_uuid(),
 capability_hash text not null unique check(capability_hash ~ '^[a-f0-9]{64}$'),
 control_hash text not null unique check(control_hash ~ '^[a-f0-9]{64}$'),
 safe_context jsonb not null check(jsonb_typeof(safe_context)='object' and octet_length(safe_context::text)<=16384),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 check(expires_at>created_at and expires_at<=created_at+interval '30 minutes'),
 check((audience='published' and execution='local') or issued_by is not null)
);
create index game_launch_expiry_idx on public.game_launch_sessions(expires_at);
create index game_launch_anonymous_rate_idx on public.game_launch_sessions(created_at) where issued_by is null;
alter table public.game_launch_sessions enable row level security;
revoke all on public.game_launch_sessions from public,anon,authenticated;
grant select,insert,update,delete on public.game_launch_sessions to service_role;

create function public.distribution_authorize_launch(p_actor uuid,p_game uuid,p_version uuid,p_audience text,p_execution text) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v public.game_versions; visible boolean; begin
 select * into v from public.game_versions where id=p_version and game_id=p_game;
 if not found then raise exception 'version_not_found'; end if;
 if p_audience='preview' then
  if p_actor is null then raise exception 'unauthorized'; end if;
  if not public.distribution_preview_allowed(p_actor,p_game,v.status) then raise exception 'preview_forbidden'; end if;
  if v.status not in ('draft','in_review','approved') then raise exception 'version_not_previewable'; end if;
 elsif p_audience='published' then
  select is_published into visible from public.games where id=p_game;
  if v.status<>'published' or visible is distinct from true then raise exception 'version_not_found'; end if;
 else raise exception 'invalid_launch_request'; end if;
 if p_execution not in ('local','online') or v.manifest#>>array['client','entrypoints',p_execution] is null then raise exception 'unsupported_execution'; end if;
 if p_execution='online' and p_actor is null then raise exception 'unauthorized'; end if;
end $$;
create function public.distribution_create_launch(p_actor uuid,p_game uuid,p_version uuid,p_audience text,p_execution text,
 p_capability_hash text,p_control_hash text,p_context jsonb,p_seconds integer,p_actor_limit integer,p_anonymous_limit integer) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.game_launch_sessions; begin
 perform public.distribution_authorize_launch(p_actor,p_game,p_version,p_audience,p_execution);
 if p_seconds not between 60 and 1800 or p_context->>'gameId' is distinct from p_game::text
  or p_context->>'gameVersionId' is distinct from p_version::text or p_context->>'execution' is distinct from p_execution then raise exception 'invalid_launch_request'; end if;
 if p_actor_limit not between 1 and 1200 or p_anonymous_limit not between 1 and 10000 then raise exception 'invalid_launch_request'; end if;
 if p_actor is not null then perform public.distribution_api_limit(p_actor,p_actor_limit);
 else
  perform pg_advisory_xact_lock(hashtextextended('anonymous-game-launch',31));
  if (select count(*) from public.game_launch_sessions where issued_by is null and created_at>now()-interval '1 minute')>=p_anonymous_limit then raise exception 'quota_exceeded'; end if;
 end if;
 insert into public.game_launch_sessions(version_id,issued_by,audience,execution,capability_hash,control_hash,safe_context,expires_at)
 values(p_version,p_actor,p_audience,p_execution,p_capability_hash,p_control_hash,p_context,now()+make_interval(secs=>p_seconds)) returning * into s;
 return jsonb_build_object('id',s.id,'version_id',s.version_id,'generation',s.generation,'expires_at',s.expires_at,'safe_context',s.safe_context);
end $$;
create function public.distribution_check_launch(p_capability_hash text) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare s public.game_launch_sessions; v public.game_versions; visible boolean; begin
 select * into s from public.game_launch_sessions where capability_hash=p_capability_hash;
 if not found or s.expires_at<=now() or s.revoked_at is not null then raise exception 'launch_expired'; end if;
 select * into v from public.game_versions where id=s.version_id;
 if s.audience='preview' then
  if v.status not in ('draft','in_review','approved') then raise exception 'version_not_previewable'; end if;
  if not public.distribution_preview_allowed(s.issued_by,v.game_id,v.status) then raise exception 'preview_forbidden'; end if;
 else
  select is_published into visible from public.games where id=v.game_id;
  if v.status<>'published' or visible is distinct from true then raise exception 'version_not_found'; end if;
 end if;
 return jsonb_build_object('id',s.id,'version_id',s.version_id,'generation',s.generation,'expires_at',s.expires_at,'safe_context',s.safe_context);
end $$;
create function public.distribution_revoke_launch(p_id uuid,p_control_hash text) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public.game_launch_sessions set revoked_at=coalesce(revoked_at,now()) where id=p_id and control_hash=p_control_hash;
 if not found then raise exception 'launch_expired'; end if;
end $$;
create function public.distribution_cleanup_launches() returns integer
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare n integer; begin delete from public.game_launch_sessions where expires_at<=now() or revoked_at<now()-interval '15 minutes';get diagnostics n=row_count;return n;end $$;
do $$ declare f record; begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname=any(array[
 'distribution_authorize_launch','distribution_create_launch','distribution_check_launch','distribution_revoke_launch','distribution_cleanup_launches']) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
