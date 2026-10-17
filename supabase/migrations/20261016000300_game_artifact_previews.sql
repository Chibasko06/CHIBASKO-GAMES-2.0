-- PREPARED ONLY. After distribution phases 1/2; no production application here.
begin;
set local lock_timeout='5s';
create table public.game_reviewers (
  user_id uuid primary key references auth.users(id) on delete cascade
);
-- A reviewer capability is independent of catalogue ownership/admin membership.
-- No accounts are granted this capability automatically.
create table public.game_version_delivery_policies (
  version_id uuid primary key references public.game_versions(id) on delete restrict,
  profile text not null default 'web-v1' check(profile in ('web-v1','web-isolated-v1','web-legacy-v1')),
  connect_origins jsonb not null default '[]' check(jsonb_typeof(connect_origins)='array' and jsonb_array_length(connect_origins)<=32),
  asset_origins jsonb not null default '[]' check(jsonb_typeof(asset_origins)='array' and jsonb_array_length(asset_origins)<=32)
);
create table public.game_preview_sessions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.game_versions(id) on delete restrict,
  issued_by uuid not null references auth.users(id) on delete cascade,
  execution text not null check(execution in ('local','online')),
  ticket_hash text not null unique check(ticket_hash ~ '^[0-9a-f]{64}$'),
  cookie_hash text unique check(cookie_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  ticket_expires_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check(ticket_expires_at<=expires_at),
  check((cookie_hash is null)=(consumed_at is null))
);
create index game_preview_expiration_idx on public.game_preview_sessions(expires_at);
create index game_preview_actor_idx on public.game_preview_sessions(issued_by,created_at);
alter table public.game_reviewers enable row level security;
alter table public.game_version_delivery_policies enable row level security;
alter table public.game_preview_sessions enable row level security;
revoke all on public.game_reviewers,public.game_version_delivery_policies,public.game_preview_sessions from public,anon,authenticated;
grant select,insert,update,delete on public.game_reviewers,public.game_version_delivery_policies,public.game_preview_sessions to service_role;

create function public.distribution_preview_allowed(p_actor uuid,p_game uuid,p_status text) returns boolean
language sql stable security invoker set search_path=pg_catalog,public as $$
 select public.distribution_can_upload(p_actor,p_game) or (p_status in ('in_review','approved') and exists(select 1 from public.game_reviewers where user_id=p_actor))
$$;
create function public.distribution_resolve_version(p_version uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',v.id,'game_id',v.game_id,'version',v.version,'schema_version',v.schema_version,
 'integration_version',v.integration_version,'status',v.status,'manifest',v.manifest,'artifact_sha256',v.artifact_sha256,
 'storage_prefix',v.storage_prefix,'delivery_policy',jsonb_build_object('profile',coalesce(p.profile,'web-v1'),
 'connectOrigins',coalesce(p.connect_origins,'[]'::jsonb),'assetOrigins',coalesce(p.asset_origins,'[]'::jsonb)))
 from public.game_versions v left join public.game_version_delivery_policies p on p.version_id=v.id where v.id=p_version
$$;
create function public.distribution_issue_preview(p_actor uuid,p_version uuid,p_execution text,p_ticket_hash text,
 p_ticket_seconds integer,p_session_seconds integer,p_limit integer) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v public.game_versions; s public.game_preview_sessions; begin
 select * into v from public.game_versions where id=p_version;
 if not found then raise exception 'version_not_found'; end if;
 if not public.distribution_preview_allowed(p_actor,v.game_id,v.status) then raise exception 'preview_forbidden'; end if;
 if v.status not in ('draft','in_review','approved') then raise exception 'version_not_previewable'; end if;
 if p_execution not in ('local','online') or v.manifest#>>array['client','entrypoints',p_execution] is null then raise exception 'unsupported_execution'; end if;
 if p_ticket_seconds not between 1 and 300 or p_session_seconds not between p_ticket_seconds and 3600 or p_limit not between 1 and 60 then raise exception 'invalid_preview_policy'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,17));
 if (select count(*) from public.game_preview_sessions where issued_by=p_actor and created_at>now()-interval '1 minute')>=p_limit then raise exception 'quota_exceeded'; end if;
 insert into public.game_preview_sessions(version_id,issued_by,execution,ticket_hash,ticket_expires_at,expires_at)
 values(p_version,p_actor,p_execution,p_ticket_hash,now()+make_interval(secs=>p_ticket_seconds),now()+make_interval(secs=>p_session_seconds)) returning * into s;
 return jsonb_build_object('id',s.id,'version_id',s.version_id,'execution',s.execution,'expires_at',s.expires_at);
end $$;
create function public.distribution_exchange_preview(p_session uuid,p_ticket_hash text,p_cookie_hash text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.game_preview_sessions; v public.game_versions; begin
 select * into s from public.game_preview_sessions where id=p_session and ticket_hash=p_ticket_hash for update;
 if not found or s.ticket_expires_at<=now() or s.expires_at<=now() then raise exception 'preview_expired'; end if;
 if s.consumed_at is not null then raise exception 'preview_replayed'; end if;
 select * into v from public.game_versions where id=s.version_id;
 if v.status not in ('draft','in_review','approved') then raise exception 'version_not_previewable'; end if;
 if not public.distribution_preview_allowed(s.issued_by,v.game_id,v.status) then raise exception 'preview_forbidden'; end if;
 update public.game_preview_sessions set consumed_at=now(),cookie_hash=p_cookie_hash where id=p_session;
 return jsonb_build_object('id',s.id,'version_id',s.version_id,'execution',s.execution,'expires_at',s.expires_at);
end $$;
create function public.distribution_check_preview(p_session uuid,p_cookie_hash text) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare s public.game_preview_sessions; v public.game_versions; begin
 select * into s from public.game_preview_sessions where id=p_session and cookie_hash=p_cookie_hash and consumed_at is not null;
 if not found or s.expires_at<=now() then raise exception 'preview_expired'; end if;
 select * into v from public.game_versions where id=s.version_id;
 if v.status not in ('draft','in_review','approved') then raise exception 'version_not_previewable'; end if;
 if not public.distribution_preview_allowed(s.issued_by,v.game_id,v.status) then raise exception 'preview_forbidden'; end if;
 return jsonb_build_object('id',s.id,'version_id',s.version_id,'execution',s.execution,'expires_at',s.expires_at);
end $$;
create function public.distribution_cleanup_previews() returns integer
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare n integer; begin
 delete from public.game_preview_sessions where expires_at<=now();get diagnostics n=row_count;return n;
end $$;
do $$ declare f record; begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname=any(array[
 'distribution_preview_allowed','distribution_resolve_version','distribution_issue_preview','distribution_exchange_preview','distribution_check_preview','distribution_cleanup_previews']) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
