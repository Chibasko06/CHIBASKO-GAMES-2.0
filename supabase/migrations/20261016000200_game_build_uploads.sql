-- PREPARED ONLY. Apply after 20261016000100; no production operation in tests.
begin;
set local lock_timeout='5s';
create table public.game_developer_members (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','editor')),
  primary key(game_id,user_id)
);
-- Explicit per-game grants; no trust in developer_name, submissions or manifest.
-- No owner is assigned automatically. Future teams can extend this relation.
create table public.game_build_uploads (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  request_id uuid not null,
  version text not null,
  version_id uuid not null unique default gen_random_uuid(),
  status text not null default 'created' check(status in ('created','uploading','finalizing','queued','validating','completed','failed','expired')),
  expected_size bigint not null check(expected_size>0),
  staging_key text generated always as ('staging/uploads/'||id::text||'/source.zip') stored,
  multipart_id text,
  staging_etag text,
  policy jsonb not null check(policy->>'revision'='1'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lease_token uuid, lease_until timestamptz,
  attempts integer not null default 0,
  checkpoint jsonb,
  error_code text,
  cleaned_at timestamptz,
  unique(created_by,request_id),
  check((lease_token is null)=(lease_until is null))
);
create index game_build_uploads_pending on public.game_build_uploads(status,updated_at);
create table public.game_build_outbox (
  upload_id uuid primary key references public.game_build_uploads(id),
  dispatched_at timestamptz
);
create table public.game_build_api_limits(actor uuid primary key references auth.users(id) on delete cascade,window_at timestamptz not null,hits integer not null);
alter table public.game_build_api_limits enable row level security;
revoke all on public.game_build_api_limits from public,anon,authenticated;
grant select,insert,update on public.game_build_api_limits to service_role;
alter table public.game_developer_members enable row level security;
alter table public.game_build_uploads enable row level security;
alter table public.game_build_outbox enable row level security;
revoke all on public.game_developer_members,public.game_build_uploads,public.game_build_outbox from public,anon,authenticated;
grant select,insert,update,delete on public.game_developer_members to service_role;
grant select,insert,update on public.game_build_uploads,public.game_build_outbox to service_role;

create function public.distribution_can_upload(p_actor uuid,p_game uuid) returns boolean
language sql stable security invoker set search_path=pg_catalog,public as $$
 select p_actor is not null and (
 exists(select 1 from public.admin_users where user_id=p_actor) or
 exists(select 1 from public.game_developer_members where user_id=p_actor and game_id=p_game))
$$;
create function public.distribution_api_limit(p_actor uuid,p_limit integer) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare n integer; begin
 insert into public.game_build_api_limits(actor,window_at,hits) values(p_actor,date_trunc('minute',now()),1)
 on conflict(actor) do update set window_at=excluded.window_at,
 hits=case when game_build_api_limits.window_at=excluded.window_at then game_build_api_limits.hits+1 else 1 end returning hits into n;
 if n>p_limit then raise exception 'quota_exceeded'; end if;
end $$;
create function public.distribution_get_upload(p_actor uuid,p_id uuid) returns public.game_build_uploads
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; begin
 select * into u from public.game_build_uploads where id=p_id;
 if not found then raise exception 'upload_not_found'; end if;
 if not public.distribution_can_upload(p_actor,u.game_id) or
 (u.created_by is distinct from p_actor and not exists(select 1 from public.admin_users where user_id=p_actor))
 then raise exception 'upload_not_found'; end if;
 perform public.distribution_api_limit(p_actor,(u.policy->>'maxApiPerMinute')::integer);
 -- Lock order is account counter -> upload, including create/idempotency retries.
 select * into u from public.game_build_uploads where id=p_id for update;
 if u.status in ('created','uploading','finalizing') and u.expires_at<=now() then
 update public.game_build_uploads set status='expired',error_code='upload_expired',updated_at=now() where id=p_id returning * into u;
 end if;
 u.checkpoint:=null;
 return u;
end $$;
create function public.distribution_create_upload(p_actor uuid,p_game uuid,p_version text,p_size bigint,p_request uuid,p_policy jsonb)
returns public.game_build_uploads language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; begin
 if not exists(select 1 from public.games where id=p_game) then raise exception 'game_not_found'; end if;
 if not public.distribution_can_upload(p_actor,p_game) then raise exception 'forbidden'; end if;
 perform public.distribution_api_limit(p_actor,(p_policy->>'maxApiPerMinute')::integer);
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 select * into u from public.game_build_uploads where created_by=p_actor and request_id=p_request;
 if found then
 if u.game_id<>p_game or u.version<>p_version or u.expected_size<>p_size then raise exception 'idempotency_conflict'; end if;
 return public.distribution_get_upload(p_actor,u.id); end if;
 if exists(select 1 from public.game_versions where game_id=p_game and version=p_version) then raise exception 'version_conflict'; end if;
 update public.game_build_uploads set status='expired',error_code='upload_expired',updated_at=now()
 where created_by=p_actor and status in ('created','uploading','finalizing') and expires_at<=now();
 if (select count(*) from public.game_build_uploads where created_by=p_actor and status not in ('completed','failed','expired'))>=(p_policy->>'maxActiveUploads')::integer
 or (select count(*) from public.game_build_uploads where created_by=p_actor and created_at>now()-interval '1 day')>=(p_policy->>'maxUploadsPerDay')::integer
 then raise exception 'quota_exceeded'; end if;
 if p_size<1 or p_size>(p_policy->>'maxArchiveBytes')::bigint then raise exception 'quota_exceeded'; end if;
 insert into public.game_build_uploads(game_id,created_by,request_id,version,expected_size,policy,expires_at)
 values(p_game,p_actor,p_request,p_version,p_size,p_policy,now()+make_interval(secs=>(p_policy->>'sessionSeconds')::integer)) returning * into u;
 return u;
end $$;
create function public.distribution_attach_transport(p_actor uuid,p_id uuid,p_multipart text) returns public.game_build_uploads
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; begin
 u:=public.distribution_get_upload(p_actor,p_id);
 if u.status='created' then update public.game_build_uploads set multipart_id=p_multipart,status='uploading',updated_at=now() where id=p_id returning * into u; end if;
 return u;
end $$;
create function public.distribution_begin_finalize(p_actor uuid,p_id uuid) returns public.game_build_uploads
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; begin
 u:=public.distribution_get_upload(p_actor,p_id);
 if u.status='uploading' then update public.game_build_uploads set status='finalizing',updated_at=now() where id=p_id returning * into u; end if;
 return u;
end $$;
create function public.distribution_resume_upload(p_actor uuid,p_id uuid) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; begin
 u:=public.distribution_get_upload(p_actor,p_id);
 if u.status='finalizing' then update public.game_build_uploads set status='uploading',updated_at=now() where id=p_id; end if;
end $$;
create function public.distribution_enqueue_upload(p_actor uuid,p_id uuid,p_etag text) returns public.game_build_uploads
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; begin
 u:=public.distribution_get_upload(p_actor,p_id);
 if u.status='finalizing' then
 update public.game_build_uploads set status='queued',staging_etag=p_etag,updated_at=now() where id=p_id returning * into u;
 insert into public.game_build_outbox(upload_id) values(p_id) on conflict do nothing;
 end if;
 return u;
end $$;
-- Outbox is durable, including the crash window between DB commit and queue.send.
-- Re-dispatch only unclaimed jobs; lease recovery fences dead consumers.
create function public.distribution_pending() returns table(id uuid)
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public.game_build_uploads set status='expired',error_code='upload_expired',updated_at=now()
 where status in ('created','uploading','finalizing') and expires_at<=now();
 update public.game_build_uploads set status=case when attempts>=(policy->>'maxAttempts')::integer then 'failed' else 'queued' end,
 error_code=case when attempts>=(policy->>'maxAttempts')::integer then 'validation_timeout' else null end,
 lease_token=null,lease_until=null,updated_at=now() where status='validating' and lease_until<now();
 return query select u.id from public.game_build_uploads u join public.game_build_outbox o on o.upload_id=u.id
 where u.status='queued' and (o.dispatched_at is null or o.dispatched_at<now()-make_interval(secs=>(u.policy->>'redispatchSeconds')::integer)) order by u.created_at limit 100;
end $$;
create function public.distribution_dispatched(p_id uuid) returns void language sql security invoker set search_path=pg_catalog,public as $$
 update public.game_build_outbox set dispatched_at=now() where upload_id=p_id
$$;
create function public.distribution_claim(p_id uuid) returns public.game_build_uploads
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; begin
 select * into u from public.game_build_uploads where id=p_id for update;
 if not found or u.status<>'queued' then return null; end if;
 if not public.distribution_can_upload(u.created_by,u.game_id) then
 update public.game_build_uploads set status='failed',error_code='forbidden',updated_at=now() where id=p_id; return null; end if;
 update public.game_build_uploads set status='validating',attempts=attempts+1,lease_token=gen_random_uuid(),
 lease_until=now()+make_interval(secs=>(policy->>'jobSeconds')::integer+120),updated_at=now() where id=p_id returning * into u;
 u.checkpoint:=null; return u;
end $$;
create function public.distribution_checkpoint(p_id uuid,p_lease uuid,p_checkpoint jsonb) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; begin
 select * into u from public.game_build_uploads where id=p_id for update;
 if u.status<>'validating' or u.lease_token is distinct from p_lease or u.lease_until<now() then raise exception 'lease_lost'; end if;
 if u.checkpoint is not null and u.checkpoint is distinct from p_checkpoint then raise exception 'validation_failed'; end if;
 if p_checkpoint->'manifest'->>'gameId'<>u.game_id::text or p_checkpoint->'manifest'->>'version'<>u.version
 or (p_checkpoint->>'archiveSize')::bigint<>u.expected_size then raise exception 'validation_failed'; end if;
 update public.game_build_uploads set checkpoint=p_checkpoint,updated_at=now() where id=p_id;
end $$;
create function public.distribution_complete(p_id uuid,p_lease uuid) returns public.game_build_uploads
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; c jsonb; begin
 select * into u from public.game_build_uploads where id=p_id for update;
 if u.status='completed' then u.checkpoint:=null; return u; end if;
 if u.status<>'validating' or u.lease_token is distinct from p_lease or u.lease_until<now() then raise exception 'lease_lost'; end if;
 if not public.distribution_can_upload(u.created_by,u.game_id) then raise exception 'forbidden'; end if;
 c:=u.checkpoint;
 if c is null then raise exception 'validation_failed'; end if;
 begin
 insert into public.game_versions(id,game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count,archive_sha256,archive_size,created_by)
 values(u.version_id,u.game_id,u.version,(c->'manifest'->>'schemaVersion')::integer,(c->'manifest'->>'integrationVersion')::integer,
 c->'manifest',c->>'artifactSha256',(c->>'artifactSize')::bigint,(c->>'fileCount')::integer,c->>'archiveSha256',(c->>'archiveSize')::bigint,u.created_by);
 update public.game_build_uploads set status='completed',lease_token=null,lease_until=null,error_code=null,updated_at=now() where id=p_id returning * into u;
 exception when unique_violation then
 update public.game_build_uploads set status='failed',error_code='version_conflict',lease_token=null,lease_until=null,updated_at=now() where id=p_id returning * into u;
 end;
 u.checkpoint:=null; return u;
end $$;
create function public.distribution_fail(p_id uuid,p_lease uuid,p_code text,p_retry boolean) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public.game_build_uploads set status=case when p_retry and attempts<(policy->>'maxAttempts')::integer then 'queued' else 'failed' end,
 error_code=p_code,lease_token=null,lease_until=null,updated_at=now()
 where id=p_id and status='validating' and lease_token=p_lease;
 update public.game_build_outbox set dispatched_at=null where upload_id=p_id;
end $$;
create function public.distribution_cleanup_candidates() returns setof public.game_build_uploads
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; begin
 for u in select * from public.game_build_uploads where status in ('completed','failed','expired') and cleaned_at is null
 and updated_at<now()-interval '1 day' order by updated_at limit 50 loop
 if u.checkpoint is not null then u.checkpoint:=jsonb_build_object('artifactSha256',u.checkpoint->>'artifactSha256'); end if;
 return next u;
 end loop;
end
$$;
create function public.distribution_cleaned(p_id uuid) returns void language sql security invoker set search_path=pg_catalog,public as $$
 update public.game_build_uploads set cleaned_at=now() where id=p_id and status in ('completed','failed','expired')
$$;
-- No callable privilege to browser users, including SECURITY INVOKER functions.
do $$ declare f record; begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'distribution_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
