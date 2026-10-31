begin;
set local lock_timeout='5s';

create table public.moderation_subjects(
 id uuid primary key,
 kind text not null check(kind in ('player','game')),
 user_id uuid unique references auth.users(id) on delete set null,
 game_id uuid unique references public.games(id) on delete set null,
 version integer not null default 0 check(version>=0),
 retention_days integer not null check(retention_days between 1 and 3650),
 retain_until timestamptz not null,
 measure text check(measure in ('suspend','ban','unpublish')),
 ends_at timestamptz,
 check((measure='suspend' and ends_at is not null) or (measure is distinct from 'suspend' and ends_at is null)),
 check((kind='player' and game_id is null and measure is distinct from 'unpublish') or
       (kind='game' and user_id is null and (measure is null or measure='unpublish')))
);
create table public.moderation_measures(
 id uuid primary key,
 subject uuid not null references public.moderation_subjects(id),
 case_id uuid references public.moderation_cases(id) on delete set null,
 actor uuid references auth.users(id) on delete set null,
 actor_reference uuid not null,
 operation_hash text not null check(operation_hash ~ '^[a-f0-9]{64}$'),
 version integer not null,
 action text not null check(action in ('warn','suspend','ban','lift','unpublish','restore')),
 reason text not null check(length(reason) between 10 and 5000),
 note text check(length(note)<=5000),
 ends_at timestamptz,
 retention_days integer not null check(retention_days between 1 and 3650),
 archived_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 unique(subject,version),
 check((action='suspend' and ends_at is not null) or (action<>'suspend' and ends_at is null))
);
create index moderation_subjects_blocking on public.moderation_subjects(measure,ends_at,user_id) where measure in ('ban','suspend');
create index moderation_measures_history on public.moderation_measures(subject,created_at desc,id desc);
create index moderation_measures_unarchived on public.moderation_measures(subject,created_at,id) where archived_at is null;
create index moderation_measures_actor on public.moderation_measures(actor,created_at desc);
create index moderation_measures_case on public.moderation_measures(case_id) where case_id is not null;
create index moderation_cases_user_recent on public.moderation_cases(target_user,created_at desc,id desc) where target_user is not null;
create index moderation_cases_game_recent on public.moderation_cases(target_game,created_at desc,id desc) where target_game is not null;
create table public.moderation_appeals(
 id uuid primary key,
 measure uuid not null unique references public.moderation_measures(id),
 author uuid references auth.users(id) on delete set null,
 description text not null check(length(description) between 20 and 5000),
 state text not null default 'pending' check(state in ('pending','accepted','rejected')),
 version integer not null default 1,
 decision text check(length(decision) between 10 and 5000),
 reviewer uuid references auth.users(id) on delete set null,
 reviewer_reference uuid,
 created_at timestamptz not null default clock_timestamp(),reviewed_at timestamptz,
 archived_at timestamptz,
 check((state='pending' and decision is null and reviewed_at is null) or (state<>'pending' and decision is not null and reviewed_at is not null))
);
create index moderation_appeals_pending on public.moderation_appeals(created_at,id) where state='pending';
create index moderation_appeals_author_recent on public.moderation_appeals(author,created_at desc);

do $$declare t text;begin
 foreach t in array array['moderation_subjects','moderation_measures','moderation_appeals'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to service_role',t);
 end loop;
end $$;

create function public.account_actor_allowed(p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_actor is null or (exists(select 1 from auth.users u where u.id=p_actor and to_jsonb(u)->>'deleted_at' is null and coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity'::timestamptz)<=statement_timestamp()) and not exists(select 1 from public.moderation_subjects s where s.user_id=p_actor
  and (s.measure='ban' or (s.measure='suspend' and s.ends_at>statement_timestamp()))))
$$;
revoke all on function public.account_actor_allowed(uuid) from public,anon,authenticated,service_role;
grant execute on function public.account_actor_allowed(uuid) to service_role;

-- Les opérations d'un compte se terminent avant une décision concurrente le visant.
create function public.account_assert_allowed(p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if current_setting('role',true)='authenticated' and p_actor is distinct from auth.uid() then raise exception using errcode='42501',message='forbidden';end if;
 if p_actor is not null then
  perform pg_advisory_xact_lock_shared(hashtextextended('account-moderation:'||p_actor::text,0));
  if not public.account_actor_allowed(p_actor) then raise exception using errcode='42501',message='account_restricted';end if;
 end if;
end $$;
revoke all on function public.account_assert_allowed(uuid) from public,anon,authenticated,service_role;
grant execute on function public.account_assert_allowed(uuid) to authenticated,service_role;

create function public.distribution_account_access(p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$select public.account_actor_allowed(p_actor)$$;
revoke all on function public.distribution_account_access(uuid) from public,anon,authenticated;
grant execute on function public.distribution_account_access(uuid) to service_role;

create function public.account_access() returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is null then return false;end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('account-moderation:'||auth.uid()::text,0));
 return public.account_actor_allowed(auth.uid());
end $$;
revoke all on function public.account_access() from public,anon;
grant execute on function public.account_access() to authenticated;

create function public.moderation_self_status(p_before timestamptz default null,p_cursor uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();result jsonb;
begin
 if v_actor is null then raise exception 'unauthorized';end if;
 if (p_before is null)<>(p_cursor is null) then raise exception 'invalid_request';end if;
 select jsonb_build_object('blocked',not public.account_actor_allowed(v_actor),'measure',(select measure from public.moderation_subjects where user_id=v_actor),
  'endsAt',(select ends_at from public.moderation_subjects where user_id=v_actor),
  'current',(select jsonb_build_object('id',m.id,'action',m.action,'reason',m.reason,'ends_at',m.ends_at,'created_at',m.created_at,
   'appeal',(select jsonb_build_object('state',a.state,'decision',a.decision) from public.moderation_appeals a where a.measure=m.id))
   from public.moderation_measures m join public.moderation_subjects s on s.id=m.subject
   where s.user_id=v_actor and not public.account_actor_allowed(v_actor) and m.action=s.measure order by m.version desc limit 1),
  'history',coalesce((select jsonb_agg(x order by x.created_at desc,x.id desc) from
   (select m.id,m.action,m.reason,m.ends_at,m.created_at,m.archived_at,
    case when s.kind='game' then (select title from public.games where id=s.game_id) end as game_title,
    (select jsonb_build_object('state',a.state,'decision',a.decision,'reviewedAt',a.reviewed_at) from public.moderation_appeals a where a.measure=m.id) as appeal
    from public.moderation_measures m join public.moderation_subjects s on s.id=m.subject
    where (s.user_id=v_actor or exists(select 1 from public.game_developer_members d where d.game_id=s.game_id and d.user_id=v_actor and d.role='owner'))
     and (p_before is null or (m.created_at,m.id)<(p_before,p_cursor)) order by m.created_at desc,m.id desc limit 20) x),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.moderation_self_status(timestamptz,uuid) from public,anon;
grant execute on function public.moderation_self_status(timestamptz,uuid) to authenticated;

create function public.moderation_appeal(p_id uuid,p_measure uuid,p_description text) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare v_actor uuid:=auth.uid();existing public.moderation_appeals;subject_id uuid;
begin
 if v_actor is null then raise exception 'unauthorized';end if;
 if p_id is null or length(btrim(coalesce(p_description,''))) not between 20 and 5000 then raise exception 'invalid_request';end if;
 select s.id into subject_id from public.moderation_measures m join public.moderation_subjects s on s.id=m.subject where m.id=p_measure and (s.user_id=v_actor or exists(select 1 from public.game_developer_members d where d.game_id=s.game_id and d.user_id=v_actor and d.role='owner'));
 if not found then raise exception 'forbidden';end if;
 perform pg_advisory_xact_lock(hashtextextended('account-appeal:'||v_actor::text,0));
 perform id from public.moderation_subjects where id=subject_id for update;
 if exists(select 1 from public.moderation_measures where id=p_measure and archived_at is not null) then raise exception 'decision_archived';end if;
 select * into existing from public.moderation_appeals where measure=p_measure;
 if found then
  if existing.id=p_id and existing.description=btrim(p_description) then return jsonb_build_object('id',existing.id,'state',existing.state);end if;
  raise exception 'request_conflict';
 end if;
 if (select count(*) from public.moderation_appeals where author=v_actor and created_at>now()-interval '24 hours')>=5 then raise exception 'rate_limited';end if;
 insert into public.moderation_appeals(id,measure,author,description) values(p_id,p_measure,v_actor,btrim(p_description));
 return jsonb_build_object('id',p_id,'state','pending');
end $$;
revoke all on function public.moderation_appeal(uuid,uuid,text) from public,anon;
grant execute on function public.moderation_appeal(uuid,uuid,text) to authenticated;


create or replace function public.increment_game_view(p_game_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_total integer;
begin
 perform public.account_assert_allowed(auth.uid());
  update public.games
  set views_count = views_count + 1
  where id = p_game_id
    and is_published = true
  returning views_count into new_total;

  return coalesce(new_total, 0);
end;
$$;

create or replace function public.record_game_play(p_game_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_total integer;
begin
 perform public.account_assert_allowed(auth.uid());
  update public.games
  set play_count = play_count + 1
  where id = p_game_id
    and is_published = true
  returning play_count into new_total;

  if auth.uid() is not null then
    insert into public.play_history (user_id, game_id)
    values (auth.uid(), p_game_id);
  end if;

  return coalesce(new_total, 0);
end;
$$;

create or replace function public.distribution_can_upload(p_actor uuid,p_game uuid) returns boolean
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
begin
 perform public.account_assert_allowed(p_actor);
 return (select p_actor is not null and (
 exists(select 1 from public.admin_users where user_id=p_actor) or
 exists(select 1 from public.game_developer_members where user_id=p_actor and game_id=p_game)));
end $$;

create or replace function public.distribution_api_limit(p_actor uuid,p_limit integer) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare n integer; begin
 perform public.account_assert_allowed(p_actor);
 insert into public.game_build_api_limits(actor,window_at,hits) values(p_actor,date_trunc('minute',now()),1)
 on conflict(actor) do update set window_at=excluded.window_at,
 hits=case when game_build_api_limits.window_at=excluded.window_at then game_build_api_limits.hits+1 else 1 end returning hits into n;
 if n>p_limit then raise exception 'quota_exceeded'; end if;
end $$;

create or replace function public.distribution_get_upload(p_actor uuid,p_id uuid) returns public.game_build_uploads
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; begin
 perform public.account_assert_allowed(p_actor);
 select * into u from public.game_build_uploads where id=p_id;
 if not found then raise exception 'upload_not_found'; end if;
 if not public.distribution_can_upload(p_actor,u.game_id) or
 (u.created_by is distinct from p_actor and not exists(select 1 from public.admin_users where user_id=p_actor))
 then raise exception 'upload_not_found'; end if;
 perform public.distribution_api_limit(p_actor,(u.policy->>'maxApiPerMinute')::integer);

 select * into u from public.game_build_uploads where id=p_id for update;
 if u.status in ('created','uploading','finalizing') and u.expires_at<=now() then
 update public.game_build_uploads set status='expired',error_code='upload_expired',updated_at=now() where id=p_id returning * into u;
 end if;
 u.checkpoint:=null;
 return u;
end $$;

create or replace function public.distribution_create_upload(p_actor uuid,p_game uuid,p_version text,p_size bigint,p_request uuid,p_policy jsonb)
returns public.game_build_uploads language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; begin
 perform public.account_assert_allowed(p_actor);
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

create or replace function public.distribution_attach_transport(p_actor uuid,p_id uuid,p_multipart text) returns public.game_build_uploads
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; begin
 perform public.account_assert_allowed(p_actor);
 u:=public.distribution_get_upload(p_actor,p_id);
 if u.status='created' then update public.game_build_uploads set multipart_id=p_multipart,status='uploading',updated_at=now() where id=p_id returning * into u; end if;
 return u;
end $$;

create or replace function public.distribution_begin_finalize(p_actor uuid,p_id uuid) returns public.game_build_uploads
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; begin
 perform public.account_assert_allowed(p_actor);
 u:=public.distribution_get_upload(p_actor,p_id);
 if u.status='uploading' then update public.game_build_uploads set status='finalizing',updated_at=now() where id=p_id returning * into u; end if;
 return u;
end $$;

create or replace function public.distribution_resume_upload(p_actor uuid,p_id uuid) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; begin
 perform public.account_assert_allowed(p_actor);
 u:=public.distribution_get_upload(p_actor,p_id);
 if u.status='finalizing' then update public.game_build_uploads set status='uploading',updated_at=now() where id=p_id; end if;
end $$;

create or replace function public.distribution_enqueue_upload(p_actor uuid,p_id uuid,p_etag text) returns public.game_build_uploads
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; begin
 perform public.account_assert_allowed(p_actor);
 u:=public.distribution_get_upload(p_actor,p_id);
 if u.status='finalizing' then
 update public.game_build_uploads set status='queued',staging_etag=p_etag,updated_at=now() where id=p_id returning * into u;
 insert into public.game_build_outbox(upload_id) values(p_id) on conflict do nothing;
 end if;
 return u;
end $$;

create or replace function public.distribution_preview_allowed(p_actor uuid,p_game uuid,p_status text) returns boolean
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
begin
 perform public.account_assert_allowed(p_actor);
 return (select public.distribution_can_upload(p_actor,p_game) or (p_status in ('in_review','approved') and exists(select 1 from public.game_reviewers where user_id=p_actor)));
end $$;

create or replace function public.distribution_issue_preview(p_actor uuid,p_version uuid,p_execution text,p_ticket_hash text,
 p_ticket_seconds integer,p_session_seconds integer,p_limit integer) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v public.game_versions; s public.game_preview_sessions; begin
 perform public.account_assert_allowed(p_actor);
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

create or replace function public.distribution_authorize_launch(p_actor uuid,p_game uuid,p_version uuid,p_audience text,p_execution text) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v public.game_versions; visible boolean; begin
 perform public.account_assert_allowed(p_actor);
 if p_audience='published' then perform pg_advisory_xact_lock_shared(hashtextextended('game-moderation:'||p_game::text,0));end if;
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

create or replace function public.distribution_create_launch(p_actor uuid,p_game uuid,p_version uuid,p_audience text,p_execution text,
 p_capability_hash text,p_control_hash text,p_context jsonb,p_seconds integer,p_actor_limit integer,p_anonymous_limit integer) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.game_launch_sessions; begin
 perform public.account_assert_allowed(p_actor);
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

create or replace function public.distribution_online_context(p_actor uuid,p_reference text,p_game uuid,p_version uuid,p_locale text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.game_online_sessions; p public.game_online_participants; roster jsonb; begin
 perform public.account_assert_allowed(p_actor);
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

create or replace function public.distribution_multiplayer_limit(p_actor uuid,p_operation text) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare n integer; lim integer; begin
 perform public.account_assert_allowed(p_actor);
 if p_actor is null then return false; end if;
 lim:=case p_operation when 'create' then 10 when 'lookup' then 20 when 'list' then 60 when 'get' then 60 else 30 end;
 insert into public.multiplayer_api_limits values(p_actor,p_operation,date_trunc('minute',clock_timestamp()),1)
 on conflict(actor_id,operation) do update set window_at=excluded.window_at,
 hits=case when multiplayer_api_limits.window_at=excluded.window_at then multiplayer_api_limits.hits+1 else 1 end returning hits into n;
 return n<=lim;
end $$;

create or replace function public.distribution_multiplayer_snapshot(p_actor uuid,p_id uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare l public.multiplayer_lobbies; players jsonb; sid text; begin
 perform public.account_assert_allowed(p_actor);
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

create or replace function public.distribution_multiplayer_start(p_actor uuid,p_id uuid,p_automatic boolean default false) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare l public.multiplayer_lobbies; n integer; roster jsonb; dep uuid; sid text; begin
 perform public.account_assert_allowed(p_actor);
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

create or replace function public.distribution_multiplayer_create(p_actor uuid,p_game uuid,p_access text,p_request uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.game_versions; l public.multiplayer_lobbies; policy text; begin
 perform public.account_assert_allowed(p_actor);
 if p_actor is null then raise exception 'unauthorized'; end if;
 if p_access not in ('public','private') or p_request is null then raise exception 'invalid_request'; end if;
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

create or replace function public.distribution_multiplayer_mutate(p_actor uuid,p_id uuid,p_action text,p_ready boolean default false) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare l public.multiplayer_lobbies; n integer; sid text; begin
 perform public.account_assert_allowed(p_actor);
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

create or replace function public.distribution_multiplayer_list(p_actor uuid,p_game uuid,p_after uuid default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform public.account_assert_allowed(p_actor);
 return (select coalesce(jsonb_agg(row),'[]') from (
  select l.id,l.game_id as "gameId",l.version_id as "gameVersionId",l.max_players as "maxPlayers",count(m.actor_id)::integer as "currentPlayers"
  from public.multiplayer_lobbies l left join public.multiplayer_lobby_members m on m.lobby_id=l.id
  join public.games g on g.id=l.game_id and g.is_published
  join public.game_versions v on v.id=l.version_id and v.status='published'
  where p_actor is not null and l.game_id=p_game and l.access='public' and l.status='waiting' and l.expires_at>clock_timestamp() and l.waiting_until>clock_timestamp()
   and (p_after is null or l.id>p_after)
  group by l.id having count(m.actor_id)<l.max_players order by l.id limit 25
 ) row);
end $$;

create or replace function public.distribution_multiplayer_lookup(p_actor uuid,p_game uuid,p_code text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$ declare target uuid; begin
 perform public.account_assert_allowed(p_actor);
 select id into target from public.multiplayer_lobbies where game_id=p_game and code=p_code and access='private';
 if target is null then raise exception 'lobby_not_found'; end if;
 return public.distribution_multiplayer_mutate(p_actor,target,'join_code');
end $$;

create or replace function public.distribution_admin_builds(p_actor uuid,p_id uuid default null,p_offset integer default 0) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden'; end if;
 if p_offset<0 or p_offset>100000 then raise exception 'invalid_request'; end if;
 if p_id is not null then
   result:=public.distribution_review_snapshot(p_id);
   if result is null then raise exception 'upload_not_found'; end if;
   return result;
 end if;
 return coalesce((select jsonb_agg(public.distribution_review_snapshot(x.id) order by x.created_at desc,x.id)
   from (select id,created_at from public.game_build_uploads order by created_at desc,id limit 50 offset p_offset) x),'[]');
end $$;

create or replace function public.distribution_review_action(p_actor uuid,p_id uuid,p_action text,p_checklist jsonb default '{}',p_reason text default null,p_submission uuid default null) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; v public.game_versions; r public.game_build_reviews; game uuid;
begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden'; end if;
 select game_id into game from public.game_build_uploads where id=p_id;
 if not found then raise exception 'upload_not_found'; end if;

 perform id from public.games where id=game for update;
 select * into u from public.game_build_uploads where id=p_id for update;
 insert into public.game_build_reviews(upload_id) values(p_id) on conflict do nothing;
 select * into r from public.game_build_reviews where upload_id=p_id for update;
 select * into v from public.game_versions where id=u.version_id and game_id=u.game_id and version=u.version for update;
 if p_action='link_submission' then
   if p_submission is not null and not exists(select 1 from public.game_submissions where id=p_submission) then raise exception 'invalid_request'; end if;
   update public.game_build_reviews set submission_id=p_submission,updated_at=now() where upload_id=p_id;
 elsif p_action='review' then
   if u.status<>'completed' or v.id is null or v.status not in ('draft','in_review') or r.decision in ('rejected','archived','published') then raise exception 'invalid_state'; end if;
   if p_checklist is distinct from '{"tested":true,"content":true,"metadata":true,"behavior":true}'::jsonb then raise exception 'invalid_request'; end if;
   if v.status='draft' then update public.game_versions set status='in_review' where id=v.id; end if;
   update public.game_build_reviews set checklist=p_checklist,reviewed_at=now(),decision='reviewed',updated_at=now() where upload_id=p_id;
 elsif p_action='publish' then
   if u.status<>'completed' or v.id is null then raise exception 'invalid_state'; end if;

   if v.status='published' and r.decision='published' then return public.distribution_review_snapshot(p_id); end if;
   if r.decision<>'reviewed' or r.reviewed_at is null or v.status<>'in_review'
     or r.checklist is distinct from '{"tested":true,"content":true,"metadata":true,"behavior":true}'::jsonb then raise exception 'invalid_state'; end if;
   update public.game_versions set status='approved' where id=v.id;
   update public.game_versions set status='published' where id=v.id;
   perform public.set_active_game_version(u.game_id,v.id);
   update public.game_build_reviews set decision='published',updated_at=now() where upload_id=p_id;
 elsif p_action in ('reject','archive') then
   if length(btrim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'invalid_request'; end if;
   if u.status='validating' then raise exception 'invalid_state'; end if;
   if p_action='reject' and v.status in ('published','archived','approved') then raise exception 'invalid_state'; end if;
   if v.id is not null then
     if p_action='archive' then
       if (select active_version_id=v.id from public.games where id=u.game_id) then perform public.set_active_game_version(u.game_id,null); end if;
       if v.status<>'archived' then update public.game_versions set status='archived' where id=v.id; end if;
     else
       if v.status='draft' then update public.game_versions set status='in_review' where id=v.id; end if;
       if v.status<>'rejected' then update public.game_versions set status='rejected' where id=v.id; end if;
     end if;
   else
     update public.game_build_uploads set status='failed',error_code='review_rejected',updated_at=now() where id=p_id;
   end if;
   update public.game_build_reviews set decision=case when p_action='archive' then 'archived' else 'rejected' end,reason=btrim(p_reason),updated_at=now() where upload_id=p_id;
 else raise exception 'invalid_request'; end if;
 insert into public.game_build_review_events(upload_id,actor,action) values(p_id,p_actor,p_action);
 return public.distribution_review_snapshot(p_id);
end $$;

create or replace function public.distribution_developer_review(p_actor uuid,p_id uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; result jsonb;
begin
 perform public.account_assert_allowed(p_actor);
 u:=public.distribution_get_upload(p_actor,p_id);
 result:=public.distribution_review_snapshot(p_id);
 return jsonb_build_object('technicalStatus',u.status,'versionStatus',result->'versionStatus',
   'decision',result->'review'->'decision','reason',result->'review'->'reason');
end $$;

create or replace function public.distribution_register_game(p_actor uuid,p_request uuid,p_title text) returns uuid
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare game uuid;
begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from auth.users where id=p_actor) then raise exception 'unauthorized'; end if;
 if length(btrim(p_title)) not between 1 and 160 or p_title is null or p_request is null then raise exception 'invalid_request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 select game_id into game from public.game_developer_registrations where actor=p_actor and request_id=p_request;
 if found then return game; end if;
 if (select count(*) from public.game_developer_registrations where actor=p_actor and created_at>now()-interval '1 day')>=5 then raise exception 'quota_exceeded'; end if;
 game:=gen_random_uuid();

 insert into public.games(id,title,slug,game_type,multiplayer_game_id,game_url,is_published)
 values(game,btrim(p_title),'game-'||game::text,'multiplayer_chibasko',game::text,null,false);
 insert into public.game_developer_members(game_id,user_id,role) values(game,p_actor,'owner');
 insert into public.game_developer_registrations(actor,request_id,game_id) values(p_actor,p_request,game);
 return game;
end $$;

create or replace function public.distribution_developer_catalog(p_actor uuid,p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from auth.users where id=p_actor) then raise exception 'unauthorized'; end if;
 if p_offset<0 or p_offset>100000 then raise exception 'invalid_request'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'title',x.title) order by x.title,x.id)
 from (select g.id,g.title from public.games g where public.distribution_can_upload(p_actor,g.id) order by g.title,g.id limit 50 offset p_offset) x),'[]');
end $$;

create or replace function public.distribution_submit_editorial(p_actor uuid,p_upload uuid,p_title text,p_description text,p_categories uuid[],p_website text) returns uuid
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; submission uuid; categories text[]; contact text; studio text;
begin
 perform public.account_assert_allowed(p_actor);
 u:=public.distribution_get_upload(p_actor,p_upload);
 if u.created_by is distinct from p_actor then raise exception 'forbidden'; end if;
 if u.status not in ('queued','validating','completed') then raise exception 'invalid_state'; end if;
 if length(btrim(p_title)) not between 1 and 160 or p_title is null
 or length(btrim(p_description)) not between 1 and 10000 or p_description is null
 or coalesce(cardinality(p_categories),0)>8 or length(coalesce(p_website,''))>2048 then raise exception 'invalid_request'; end if;
 if p_website is not null and p_website<>'' and p_website !~ '^https://[^/@[:space:]]+([/?#]|$)' then raise exception 'invalid_request'; end if;
 select array_agg(name order by name) into categories from public.categories where id=any(p_categories);
 if coalesce(cardinality(categories),0)<>coalesce(cardinality(p_categories),0) then raise exception 'invalid_request'; end if;
 select id into submission from public.game_submissions where build_upload_id=p_upload;
 if found then return submission; end if;
 select email into contact from auth.users where id=p_actor;
 select username into studio from public.profiles where id=p_actor;
 insert into public.game_submissions(build_upload_id,name_or_studio,email,game_title,demo_url,game_type,description,short_description,long_description,category_names,developer_website,ownership_confirmed)
 values(p_upload,coalesce(studio,'Développeur Chibasko Games'),coalesce(contact,''),btrim(p_title),'','web_build',btrim(p_description),left(btrim(p_description),180),btrim(p_description),coalesce(categories,'{}'),nullif(p_website,''),true)
 returning id into submission;
 insert into public.game_build_reviews(upload_id,submission_id) values(p_upload,submission)
 on conflict(upload_id) do update set submission_id=excluded.submission_id,updated_at=now();
 return submission;
end $$;

create or replace function public.distribution_developer_builds(p_actor uuid,p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from auth.users where id=p_actor) then raise exception 'unauthorized'; end if;
 if p_offset<0 or p_offset>100000 then raise exception 'invalid_request'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'gameId',x.game_id,'title',x.title,'version',x.version,'createdAt',x.created_at,
 'technicalStatus',x.status,'versionStatus',x.version_status,'decision',coalesce(x.decision,'pending'),'reason',x.reason,'editorialComplete',x.submission_id is not null) order by x.created_at desc,x.id)
 from (select u.id,u.game_id,g.title,u.version,u.created_at,u.status,v.status version_status,r.decision,r.reason,s.id submission_id
 from public.game_build_uploads u join public.games g on g.id=u.game_id
 left join public.game_versions v on v.id=u.version_id and v.game_id=u.game_id and u.status='completed'
 left join public.game_build_reviews r on r.upload_id=u.id
 left join public.game_submissions s on s.build_upload_id=u.id
 where u.created_by=p_actor and public.distribution_can_upload(p_actor,u.game_id)
 order by u.created_at desc,u.id limit 50 offset p_offset) x),'[]');
end $$;

create or replace function public.distribution_managed_catalog(p_actor uuid,p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
begin
 perform public.account_assert_allowed(p_actor);
 if p_actor is null then raise exception 'unauthorized'; end if;
 if p_offset<0 or p_offset>100000 then raise exception 'invalid_request'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'title',x.title) order by x.title,x.id)
 from (select g.id,g.title from public.games g
 where (exists(select 1 from public.game_developer_members m where m.game_id=g.id and m.user_id=p_actor)
  or (exists(select 1 from public.admin_users where user_id=p_actor)
   and exists(select 1 from public.game_platform_management p where p.game_id=g.id and p.authority_id='chibasko_games')))
 and (not exists(select 1 from public.game_developer_registrations r where r.game_id=g.id)
  or exists(select 1 from public.game_versions v where v.game_id=g.id and v.status='published'))
 order by g.title,g.id limit 50 offset p_offset) x),'[]');
end $$;

create or replace function public.distribution_editorial_context(p_actor uuid,p_upload uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads;
begin
 perform public.account_assert_allowed(p_actor);
 u:=public.distribution_get_upload(p_actor,p_upload);
 if u.created_by is distinct from p_actor then raise exception 'forbidden'; end if;
 if u.status not in ('queued','validating','completed') then raise exception 'invalid_state'; end if;
 return jsonb_build_object('submissionId',(select id from public.game_submissions where build_upload_id=u.id),
   'gameId',u.game_id,'version',u.version,'kind',coalesce((select submission_kind from public.game_submissions where build_upload_id=u.id),
   case when exists(select 1 from public.game_developer_registrations r join public.games g on g.id=r.game_id
     where r.game_id=u.game_id and r.actor=p_actor and not g.is_published)
     and not exists(select 1 from public.game_versions where game_id=u.game_id and status='published') then 'new' else 'update' end));
end $$;

create or replace function public.distribution_submit_catalogue(p_actor uuid,p_upload uuid,p_kind text,p_metadata jsonb,p_cover text default null) returns uuid
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; g public.games; sid uuid; ids uuid[]; released date;
begin
 perform public.account_assert_allowed(p_actor);
 perform public.distribution_editorial_context(p_actor,p_upload);
 u:=public.distribution_get_upload(p_actor,p_upload);
 select * into g from public.games where id=u.game_id;
 if p_kind is null or p_kind not in ('new','update') or jsonb_typeof(p_metadata) is distinct from 'object' then raise exception 'invalid_request'; end if;
 if p_kind='new' then
   if not exists(select 1 from public.game_developer_registrations where game_id=u.game_id and actor=p_actor)
     or g.is_published then raise exception 'forbidden'; end if;
   if (p_metadata - array['title','studio','releaseDate','description','categories','mobile','technology','website'])<>'{}'::jsonb
     or jsonb_typeof(p_metadata->'mobile') is distinct from 'boolean'
     or jsonb_typeof(p_metadata->'categories') is distinct from 'array'
     or jsonb_array_length(p_metadata->'categories') not between 1 and 8
     or length(btrim(coalesce(p_metadata->>'studio',''))) not between 1 and 160
     or length(btrim(coalesce(p_metadata->>'technology',''))) not between 1 and 120
     or coalesce(p_metadata->>'releaseDate','') !~ '^\d{4}-\d{2}-\d{2}$'
     or p_cover is null or p_cover !~ '^https://assets\.chibaskogames\.fr/game-thumbnails/[0-9a-f-]{36}\.(jpg|png|webp|gif|avif|svg)$'
   then raise exception 'invalid_request'; end if;
   begin released:=(p_metadata->>'releaseDate')::date;
     select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_metadata->'categories');
   exception when others then raise exception 'invalid_request'; end;
   sid:=public.distribution_submit_editorial(p_actor,p_upload,p_metadata->>'title',p_metadata->>'description',ids,p_metadata->>'website');

   if (select submission_kind from public.game_submissions where id=sid) is null then
     update public.game_submissions set submission_kind='new',name_or_studio=btrim(p_metadata->>'studio'),
       release_date=released,technology=btrim(p_metadata->>'technology'),cover_image_url=p_cover,category_ids=ids,
       mobile_compatibility=case when (p_metadata->>'mobile')::boolean then 'Oui' else 'Non' end where id=sid;
   end if;
 else
   if p_metadata<>'{}'::jsonb or p_cover is not null then raise exception 'invalid_request'; end if;
   if exists(select 1 from public.game_developer_registrations where game_id=g.id)
     and not exists(select 1 from public.game_versions where game_id=g.id and status='published') then raise exception 'invalid_state'; end if;
   sid:=public.distribution_submit_editorial(p_actor,p_upload,g.title,coalesce(nullif(g.description,''),'Nouvelle version du jeu.'),'{}',null);
   update public.game_submissions set submission_kind='update' where id=sid and submission_kind is null;
 end if;
 return sid;
end $$;

create or replace function public.distribution_owned_draft(p_actor uuid,p_game uuid) returns public.game_submission_drafts
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d public.game_submission_drafts;
begin
 perform public.account_assert_allowed(p_actor);
 select d0.* into d from public.game_submission_drafts d0 join public.games g on g.id=d0.game_id
 where d0.game_id=p_game and d0.created_by=p_actor and not g.is_published
 and exists(select 1 from public.game_developer_members m where m.game_id=g.id and m.user_id=p_actor)
 and not exists(select 1 from public.game_versions v where v.game_id=g.id and v.status='published');
 if not found then raise exception 'draft_not_found'; end if;
 return d;
end $$;

create or replace function public.distribution_developer_drafts(p_actor uuid,p_game uuid default null,p_offset integer default 0) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 perform public.account_assert_allowed(p_actor);
 if p_actor is null then raise exception 'unauthorized'; end if;
 if p_offset<0 or p_offset>100000 then raise exception 'invalid_request'; end if;
 if p_game is not null then perform public.distribution_owned_draft(p_actor,p_game);return public.distribution_draft_snapshot(p_game); end if;
 return coalesce((select jsonb_agg(public.distribution_draft_snapshot(x.game_id) order by x.updated_at desc,x.game_id)
 from(select d.game_id,d.updated_at from public.game_submission_drafts d join public.games g on g.id=d.game_id
 where d.created_by=p_actor and not g.is_published
 and exists(select 1 from public.game_developer_members m where m.game_id=g.id and m.user_id=p_actor)
 and not exists(select 1 from public.game_versions v where v.game_id=g.id and v.status='published')
 order by d.updated_at desc,d.game_id limit 50 offset p_offset) x),'[]');
end $$;

create or replace function public.distribution_save_draft(p_actor uuid,p_game uuid,p_revision bigint,p_metadata jsonb,p_version text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d public.game_submission_drafts;
begin
 perform public.account_assert_allowed(p_actor);
 perform public.distribution_owned_draft(p_actor,p_game);
 select * into d from public.game_submission_drafts where game_id=p_game for update;
 if exists(select 1 from public.game_submissions where build_upload_id=d.upload_id) then raise exception 'draft_submitted'; end if;
 if p_metadata is null or jsonb_typeof(p_metadata)<>'object' or octet_length(p_metadata::text)>65536
 or (p_metadata-array['title','studio','releaseDate','description','categories','mobile','technology'])<>'{}'::jsonb
 or p_version is null or length(p_version)>64 then raise exception 'invalid_request'; end if;

 if d.metadata=p_metadata and d.version=p_version then return public.distribution_draft_snapshot(p_game); end if;
 if p_revision is distinct from d.revision then raise exception 'draft_conflict'; end if;
 if d.upload_id is not null and p_version<>d.version then raise exception 'invalid_state'; end if;
 update public.game_submission_drafts set metadata=p_metadata,version=p_version,revision=revision+1,updated_at=now() where game_id=p_game;
 return public.distribution_draft_snapshot(p_game);
end $$;

create or replace function public.distribution_save_draft_upload(p_actor uuid,p_game uuid,p_request uuid,p_file jsonb,p_hashes jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d public.game_submission_drafts; item record; u public.game_build_uploads;
begin
 perform public.account_assert_allowed(p_actor);
 perform public.distribution_owned_draft(p_actor,p_game);
 select * into d from public.game_submission_drafts where game_id=p_game for update;
 if p_request is distinct from d.request_id then raise exception 'draft_conflict'; end if;
 if exists(select 1 from public.game_submissions where build_upload_id=d.upload_id) then raise exception 'draft_submitted'; end if;
 if jsonb_typeof(p_file) is distinct from 'object' or (p_file-array['name','size','lastModified'])<>'{}'::jsonb
 or jsonb_typeof(p_file->'name') is distinct from 'string' or length(p_file->>'name') not between 1 and 255
 or coalesce(p_file->>'size','') !~ '^[1-9][0-9]{0,15}$' or coalesce(p_file->>'lastModified','') !~ '^[0-9]{1,16}$'
 or jsonb_typeof(p_hashes) is distinct from 'object' or octet_length(p_hashes::text)>65536 then raise exception 'invalid_request'; end if;
 for item in select * from jsonb_each_text(p_hashes) loop
   if item.key !~ '^[1-9][0-9]{0,3}$' or item.value !~ '^[a-f0-9]{64}$' then raise exception 'invalid_request'; end if;
 end loop;
 if d.upload_id is not null then
   select * into u from public.game_build_uploads where id=d.upload_id and game_id=p_game and created_by=p_actor;
   if u.status not in ('created','uploading','finalizing','queued','validating','completed') then raise exception 'invalid_state'; end if;
   if (p_file->>'size')::bigint<>u.expected_size then raise exception 'invalid_request'; end if;
 end if;
 update public.game_submission_drafts set file_info=p_file,part_hashes=part_hashes||p_hashes,updated_at=now() where game_id=p_game;
 return public.distribution_draft_snapshot(p_game);
end $$;

create or replace function public.distribution_restart_draft_upload(p_actor uuid,p_game uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d public.game_submission_drafts; u public.game_build_uploads;
begin
 perform public.account_assert_allowed(p_actor);
 perform public.distribution_owned_draft(p_actor,p_game);
 select * into d from public.game_submission_drafts where game_id=p_game for update;
 select * into u from public.game_build_uploads where id=d.upload_id;
 if u.id is null or not (u.status in ('failed','expired') or u.status in ('created','uploading','finalizing') and u.expires_at<=now()) then raise exception 'invalid_state'; end if;
 if exists(select 1 from public.game_submissions where build_upload_id=u.id) then raise exception 'draft_submitted'; end if;
 update public.game_submission_drafts set upload_id=null,request_id=gen_random_uuid(),file_info=null,part_hashes='{}',updated_at=now() where game_id=p_game;
 return public.distribution_draft_snapshot(p_game);
end $$;

create or replace function public.distribution_developer_profile(p_actor uuid,p_profile jsonb default null) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare p public.developer_contacts;
begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from auth.users where id=p_actor) then raise exception 'unauthorized'; end if;
 if p_profile is not null then
  if jsonb_typeof(p_profile)<>'object' or (p_profile-array['firstName','lastName','contactEmail','publicName','website','otherContact'])<>'{}' then raise exception 'invalid_request'; end if;
  begin
   insert into public.developer_contacts(user_id,first_name,last_name,contact_email,public_name,website,other_contact)
   values(p_actor,btrim(p_profile->>'firstName'),btrim(p_profile->>'lastName'),btrim(p_profile->>'contactEmail'),btrim(p_profile->>'publicName'),nullif(btrim(p_profile->>'website'),''),nullif(btrim(p_profile->>'otherContact'),''))
   on conflict(user_id) do update set first_name=excluded.first_name,last_name=excluded.last_name,contact_email=excluded.contact_email,public_name=excluded.public_name,website=excluded.website,other_contact=excluded.other_contact,updated_at=now();
  exception when check_violation or not_null_violation then raise exception 'invalid_request'; end;
 end if;
 select * into p from public.developer_contacts where user_id=p_actor;
 if not found then return null; end if;
 return public.distribution_contact_json(p);
end $$;

create or replace function public.distribution_admin_developer_profile(p_actor uuid,p_upload uuid) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare p public.developer_contacts;
begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden'; end if;
 select c.* into p from public.developer_contacts c join public.game_build_uploads u on u.created_by=c.user_id where u.id=p_upload;
 if not found then return null; end if;
 return public.distribution_contact_json(p);
end $$;

create or replace function public.admin_save_game(
  p_actor uuid, p_game jsonb, p_categories uuid[],
  p_id uuid default null, p_expected_thumbnail text default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_game public.games%rowtype;
  v_previous_thumbnail text;
  v_categories uuid[] := coalesce(p_categories, '{}'::uuid[]);
  v_fields text[] := array['title','slug','game_type','game_url','multiplayer_game_id',
    'is_beta','is_published','thumbnail_url','description','developer_name',
    'release_date_text','mobile_compatible','technology','provider_name','source_page_url'];
begin
 perform public.account_assert_allowed(p_actor);
  perform user_id from public.admin_users where user_id = p_actor for key share;
  if not found then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if p_game is null or jsonb_typeof(p_game) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_game';
  end if;
  if exists(select 1 from jsonb_object_keys(p_game) k where not (k = any(v_fields)))
    or coalesce(jsonb_typeof(p_game->'title'),'null') <> 'string'
    or coalesce(jsonb_typeof(p_game->'slug'),'null') <> 'string'
    or btrim(p_game->>'title') = '' or btrim(p_game->>'slug') = '' then
    raise exception using errcode = '22023', message = 'invalid_game';
  end if;
  if exists(select 1 from jsonb_each(p_game) e where e.key not in ('is_beta','is_published')
      and jsonb_typeof(e.value) not in ('string','null'))
    or exists(select 1 from jsonb_each(p_game) e where e.key in ('is_beta','is_published')
      and jsonb_typeof(e.value) <> 'boolean') then
    raise exception using errcode = '22023', message = 'invalid_game';
  end if;
  if exists(select 1 from unnest(v_categories) c where c is null)
    or cardinality(v_categories) <> (select count(distinct c) from unnest(v_categories) c) then
    raise exception using errcode = '22023', message = 'invalid_categories';
  end if;
  if p_id is not null then
    select thumbnail_url into v_previous_thumbnail from public.games where id = p_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'game_not_found'; end if;
    if v_previous_thumbnail is distinct from p_expected_thumbnail then
      raise exception using errcode = '40001', message = 'game_changed';
    end if;
  end if;
  perform id from public.categories where id = any(v_categories) order by id for key share;
  if (select count(*) from public.categories where id = any(v_categories)) <> cardinality(v_categories) then
    raise exception using errcode = '22023', message = 'invalid_categories';
  end if;

  v_game := jsonb_populate_record(null::public.games, p_game);
  if p_id is null then
    insert into public.games(title,slug,game_type,game_url,multiplayer_game_id,is_beta,is_published,
      thumbnail_url,description,developer_name,release_date_text,mobile_compatible,technology,provider_name,source_page_url)
    values(v_game.title,v_game.slug,coalesce(v_game.game_type,'classic'),v_game.game_url,v_game.multiplayer_game_id,
      coalesce(v_game.is_beta,false),coalesce(v_game.is_published,true),v_game.thumbnail_url,v_game.description,
      v_game.developer_name,v_game.release_date_text,v_game.mobile_compatible,v_game.technology,v_game.provider_name,v_game.source_page_url)
    returning * into v_game;
  else
    update public.games set title=v_game.title,slug=v_game.slug,game_type=coalesce(v_game.game_type,'classic'),
      game_url=v_game.game_url,multiplayer_game_id=v_game.multiplayer_game_id,is_beta=coalesce(v_game.is_beta,false),
      is_published=coalesce(v_game.is_published,true),thumbnail_url=v_game.thumbnail_url,description=v_game.description,
      developer_name=v_game.developer_name,release_date_text=v_game.release_date_text,mobile_compatible=v_game.mobile_compatible,
      technology=v_game.technology,provider_name=v_game.provider_name,source_page_url=v_game.source_page_url
    where id=p_id returning * into v_game;
    delete from public.game_categories where game_id=p_id;
  end if;
  insert into public.game_categories(game_id,category_id) select v_game.id,c from unnest(v_categories) c;
  return jsonb_build_object('game',to_jsonb(v_game),'previousThumbnail',v_previous_thumbnail);
end;
$$;

create or replace function public.distribution_account_request(p_actor uuid,p_target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.game_account_deletions; fingerprint text;
begin
 perform public.account_assert_allowed(p_actor);
 if p_actor is null or p_target is null or (p_actor<>p_target and not exists(select 1 from public.admin_users where user_id=p_actor)) then
  raise exception using errcode='42501',message='forbidden';
 end if;
 fingerprint:=encode(sha256(convert_to(p_target::text,'UTF8')),'hex');
 if p_actor<>p_target then
  perform user_id from public.admin_users where user_id=p_actor for key share;
  if not found then raise exception using errcode='42501',message='forbidden'; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_target::text,719));
 select * into j from public.game_account_deletions where subject_hash=fingerprint for update;
 if found and j.state<>'cancelled' then return jsonb_build_object('id',j.id,'state',j.state); end if;
 perform id from auth.users where id=p_target for update;
 if not found then raise exception using errcode='P0002',message='account_not_found'; end if;
 if exists(select 1 from public.admin_users where user_id=p_target) and (select count(*) from public.admin_users)<2 then raise exception 'last_admin'; end if;
 insert into public.game_account_deletions(subject_hash,target_user_id,requested_by,state)
 values(fingerprint,p_target,p_actor,case when exists(
  select 1 from public.games g where (g.is_published or exists(select 1 from public.game_versions v where v.game_id=g.id and v.published_at is not null))
  and (exists(select 1 from public.game_developer_members m where m.game_id=g.id and m.user_id=p_target and m.role='owner')
   or exists(select 1 from public.game_developer_registrations r where r.game_id=g.id and r.actor=p_target))
 ) then 'review_required' else 'pending' end)
 on conflict(subject_hash) do update set target_user_id=excluded.target_user_id,requested_by=excluded.requested_by,state=excluded.state,
  review_reference=null,approved_games=null,reviewed_by=null,attempts=0,attention_required=false,next_attempt_at=now(),last_error=null
 where game_account_deletions.state='cancelled' returning * into j;
 return jsonb_build_object('id',j.id,'state',j.state);
end $$;

create or replace function public.distribution_account_review(p_actor uuid,p_id uuid,p_reference text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.game_account_deletions;
begin
 perform public.account_assert_allowed(p_actor);
 perform user_id from public.admin_users where user_id=p_actor for key share;
 if not found then raise exception using errcode='42501',message='forbidden'; end if;
 select * into strict j from public.game_account_deletions where id=p_id for update;
 if p_reference is not null then
  if j.state not in ('pending','review_required') or p_reference !~ '^[A-Za-z0-9_./-]{1,160}$' then raise exception 'invalid_request'; end if;
  update public.game_account_deletions set review_reference=p_reference,reviewed_by=p_actor,state='pending',attention_required=false,next_attempt_at=now(),
   approved_games=array(select g.id from public.games g where (g.is_published or exists(select 1 from public.game_versions v where v.game_id=g.id and v.published_at is not null))
    and (exists(select 1 from public.game_developer_members m where m.game_id=g.id and m.user_id=j.target_user_id and m.role='owner')
     or exists(select 1 from public.game_developer_registrations r where r.game_id=g.id and r.actor=j.target_user_id)) order by g.id)
   where id=p_id;
 else
  update public.game_account_deletions set attention_required=false,attempts=0,next_attempt_at=now(),state=case when state='review_required' and last_error='storage_owned_objects' then 'pending' else state end where id=p_id;
 end if;
 return jsonb_build_object('id',p_id,'state',(select state from public.game_account_deletions where id=p_id));
end $$;

create or replace function public.distribution_account_list(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception using errcode='42501',message='forbidden'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'state',j.state,'createdAt',j.created_at,
  'attentionRequired',j.attention_required,'reason',j.last_error) order by j.created_at,j.id)
  from (select * from public.game_account_deletions where state not in ('completed','cancelled') order by created_at,id limit 50) j),'[]');
end $$;

create or replace function public.distribution_account_status(p_actor uuid,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare j public.game_account_deletions;
begin
 perform public.account_assert_allowed(p_actor);
 select * into strict j from public.game_account_deletions where id=p_id;
 if p_actor is null or (p_actor is distinct from j.target_user_id and not exists(select 1 from public.admin_users where user_id=p_actor)) then raise exception using errcode='42501',message='forbidden'; end if;
 return jsonb_build_object('id',j.id,'state',j.state,'attentionRequired',j.attention_required,'reason',j.last_error);
end $$;

create or replace function public.distribution_account_cancel(p_actor uuid,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j public.game_account_deletions;
begin
 perform public.account_assert_allowed(p_actor);
 select * into strict j from public.game_account_deletions where id=p_id for update;
 if p_actor is null or (p_actor is distinct from j.target_user_id and not exists(select 1 from public.admin_users where user_id=p_actor)) then raise exception using errcode='42501',message='forbidden'; end if;
 if j.state not in ('pending','review_required') or j.lease_until>now() then raise exception 'invalid_state'; end if;
 update public.game_account_deletions set state='cancelled',target_user_id=null,lease_token=null,lease_until=null where id=p_id;
end $$;

create or replace function public.catalogue_admin_users(p_actor uuid,p_offset integer default 0,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_offset is null or p_offset<0 or p_offset>2100000 or p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid_page' using errcode='22023'; end if;
 with page as(select p.id,p.username,p.display_name,p.avatar_url,p.bio,p.created_at,u.email
 from public.profiles p left join auth.users u on u.id=p.id order by p.created_at desc,p.id offset p_offset limit p_limit)
 select jsonb_build_object('users',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id) from page),'[]'::jsonb),'total',(select count(*) from public.profiles)) into result;
 return result;
end $$;

create or replace function public.catalogue_recent_history(p_user uuid,p_limit integer default 6) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 perform public.account_assert_allowed(p_user);
 if current_user<>'service_role' and auth.uid() is distinct from p_user then raise exception 'forbidden' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_limit' using errcode='22023'; end if;
 with latest as(
 select distinct on(h.game_id) h.id,h.game_id,h.played_at from public.play_history h
 where h.user_id=p_user and exists(select 1 from public.games g where g.id=h.game_id and g.is_published)
 order by h.game_id,h.played_at desc,h.id),
 page as(select * from latest order by played_at desc,id limit p_limit),
 projected as(select h.id history_id,h.played_at,
 jsonb_build_object('id',g.id,'title',g.title,'slug',g.slug,'game_url',g.game_url,'thumbnail_url',g.thumbnail_url,'description',g.description,'developer_name',g.developer_name,'technology',g.technology,'created_at',g.created_at,'game_type',g.game_type,'active_version_id',g.active_version_id,'is_published',g.is_published,'is_beta',g.is_beta,'multiplayer_game_id',g.multiplayer_game_id,'views_count',g.views_count,'play_count',g.play_count,'mobile_compatible',g.mobile_compatible,'release_date_text',g.release_date_text,'provider_name',g.provider_name,'source_page_url',g.source_page_url,'catalogue_source',g.catalogue_source) game
 from page h join public.games g on g.id=h.game_id)
 select coalesce(jsonb_agg(jsonb_build_object('historyId',history_id,'played_at',played_at,'game',game) order by played_at desc,history_id),'[]'::jsonb) into result from projected;
 return result;
end $$;

create or replace function public.admin_console_users(p_actor uuid,p_search text default '',p_role text default 'all',p_offset integer default 0,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden' using errcode='42501';end if;
 if p_search is null or length(p_search)>80 or p_role is null or p_role not in ('all','admin','developer')
  or p_offset is null or p_offset<0 or p_offset>2100000 or p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid_page' using errcode='22023';end if;
 with members as (
  select p.id,p.username,p.display_name,p.avatar_url,p.bio,p.created_at,u.email,
   exists(select 1 from public.admin_users a where a.user_id=p.id) as is_admin,
   exists(select 1 from public.game_developer_members m where m.user_id=p.id and m.role in ('owner','editor')) as is_developer
  from public.profiles p left join auth.users u on u.id=p.id
  where strpos(lower(p.username),lower(btrim(p_search)))>0
 ), filtered as (
  select * from members where p_role='all' or (p_role='admin' and is_admin) or (p_role='developer' and is_developer)
 ), page as (
  select id,username,display_name,avatar_url,bio,created_at,email,jsonb_build_object('admin',is_admin,'developer',is_developer) as roles
  from filtered order by created_at desc,id offset p_offset limit p_limit
 ) select jsonb_build_object('users',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id) from page),'[]'::jsonb),
 'total',(select count(*) from filtered)) into result;
 return result;
end $$;

create or replace function public.admin_console_overview(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden' using errcode='42501';end if;
 return jsonb_build_object(
  'games',(select count(*) from public.games),
  'publishedGames',(select count(*) from public.games where is_published),
  'users',(select count(*) from public.profiles),
  'buildsAwaitingReview',(select count(*) from public.game_build_uploads u join public.game_versions v on v.id=u.version_id where u.status='completed' and v.status in ('draft','in_review','approved') and exists(select 1 from public.game_submissions s where s.build_upload_id=u.id)),
  'buildsAwaitingValidation',(select count(*) from public.game_build_uploads where status in ('queued','validating')),
  'deletionsAwaitingReview',(select count(*) from public.game_account_deletions where state='review_required'),
  'deletionsBlocked',(select count(*) from public.game_account_deletions where attention_required and state not in ('completed','cancelled')),
  'notificationsBlocked',(select count(*) from public.game_submission_notifications where sent_at is null and last_error='attention_required')
 );
end $$;

create or replace function public.admin_console_deletions(p_actor uuid,p_state text default 'all',p_offset integer default 0,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden' using errcode='42501';end if;
 if p_state is null or p_state not in ('all','review_required','pending','prepared','cleanup_pending','attention')
  or p_offset is null or p_offset<0 or p_offset>2100000 or p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid_page' using errcode='22023';end if;
 with filtered as (
  select * from public.game_account_deletions where state not in ('completed','cancelled')
  and (p_state='all' or state=p_state or (p_state='attention' and attention_required))
 ), page as (
  select * from filtered order by attention_required desc,(state='review_required') desc,created_at,id offset p_offset limit p_limit
 ) select jsonb_build_object('deletions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'state',state,'createdAt',created_at,'attentionRequired',attention_required,'reason',last_error)
 order by attention_required desc,(state='review_required') desc,created_at,id) from page),'[]'::jsonb),'total',(select count(*) from filtered)) into result;
 return result;
end $$;

create or replace function public.social_change(p_action text,p_target uuid,p_operation uuid,p_relation uuid default null) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' set statement_timeout='10s' as $$
declare v_actor uuid:=auth.uid(); lo uuid; hi uuid; current_relation public.social_relationships;
 previous public.social_operations; replayed boolean:=false; total integer; period timestamptz;
begin
 if auth.uid() is not null and not public.social_account_active(auth.uid()) then raise exception 'social_inactive';end if;
 perform public.account_assert_allowed(auth.uid());
 if v_actor is null then raise exception 'social_unauthorized';end if;
 if p_target is null or v_actor=p_target or p_operation is null or p_action is null
 or p_action not in ('request','accept','reject','cancel','remove','block','unblock') then raise exception 'social_invalid';end if;
 lo:=least(v_actor,p_target);hi:=greatest(v_actor,p_target);


 perform id from auth.users where id in (lo,hi) order by id for key share;
 if not public.social_account_active(v_actor) then raise exception 'social_inactive';end if;
 if not exists(select 1 from public.profiles where id=p_target) then raise exception 'social_unavailable';end if;

 perform pg_advisory_xact_lock(hashtextextended('social-v_actor:'||v_actor::text,0));
 perform pg_advisory_xact_lock(hashtextextended('social-pair:'||lo::text||':'||hi::text,0));
 select * into previous from public.social_operations where social_operations.actor=v_actor and operation_id=p_operation and created_at>=now()-interval '24 hours';
 if found then
  if previous.target<>p_target or previous.action<>p_action or previous.relation_id is distinct from p_relation then raise exception 'social_conflict';end if;
  replayed:=true;
 end if;
 if not replayed then
  select * into current_relation from public.social_relationships where user_low=lo and user_high=hi for update;
  if p_action='block' then
   insert into public.social_blocks(blocker,blocked) values(v_actor,p_target) on conflict do nothing;
   delete from public.social_relationships where user_low=lo and user_high=hi;
  elsif p_action='unblock' then
   if p_relation is null or exists(select 1 from public.social_blocks where blocker=v_actor and blocked=p_target and id<>p_relation) then raise exception 'social_conflict';end if;
   delete from public.social_blocks where blocker=v_actor and blocked=p_target and id=p_relation;
  else
   if not public.social_profile_visible(p_target) then raise exception 'social_unavailable';end if;
   if p_action in ('request','accept') and not public.social_account_active(p_target) then raise exception 'social_unavailable';end if;
   if p_action='request' then
    if current_relation.id is null then
     if exists(select 1 from public.social_request_cooldowns where social_request_cooldowns.actor=v_actor and target=p_target and sent_at>now()-interval '7 days') then raise exception 'social_rate_limited';end if;
     select count(*) into total from public.social_relationships where requester=v_actor and state='pending';
     if total>=50 then raise exception 'social_rate_limited';end if;
     period:=date_trunc('day',now(),'UTC');
     select hits into total from public.social_request_limits where social_request_limits.actor=v_actor and day_at=period;
     if coalesce(total,0)>=30 then raise exception 'social_rate_limited';end if;
     insert into public.social_request_limits values(v_actor,period,1) on conflict on constraint social_request_limits_pkey do update
      set day_at=excluded.day_at,hits=case when social_request_limits.day_at=excluded.day_at then social_request_limits.hits+1 else 1 end;
     insert into public.social_request_cooldowns values(v_actor,p_target,clock_timestamp()) on conflict on constraint social_request_cooldowns_pkey do update set sent_at=excluded.sent_at;
     insert into public.social_relationships(user_low,user_high,requester,state) values(lo,hi,v_actor,'pending');
    end if;
   else
    if current_relation.id is null or p_relation is distinct from current_relation.id then raise exception 'social_conflict';end if;
    if p_action in ('accept','reject') and (current_relation.state<>'pending' or current_relation.requester=v_actor) then raise exception 'social_conflict';end if;
    if p_action='cancel' and (current_relation.state<>'pending' or current_relation.requester<>v_actor) then raise exception 'social_conflict';end if;
    if p_action='remove' and current_relation.state<>'accepted' then raise exception 'social_conflict';end if;
    if p_action='accept' then
     update public.social_relationships set state='accepted',created_at=clock_timestamp() where id=current_relation.id;
    else delete from public.social_relationships where id=current_relation.id;end if;
   end if;
  end if;


  delete from public.social_operations where social_operations.actor=v_actor and (created_at<now()-interval '24 hours'
   or operation_id in (select operation_id from public.social_operations where social_operations.actor=v_actor order by created_at desc,operation_id offset 127));
  delete from public.social_request_cooldowns where social_request_cooldowns.actor=v_actor and sent_at<now()-interval '7 days';
  insert into public.social_operations(actor,operation_id,target,action,relation_id) values(v_actor,p_operation,p_target,p_action,p_relation);
 end if;

 select * into current_relation from public.social_relationships where user_low=lo and user_high=hi;
 return jsonb_build_object('replayed',replayed,'relationId',current_relation.id,'state',
  case when not public.social_profile_visible(p_target) then 'blocked'
   when current_relation.state='accepted' then 'friends'
   when current_relation.state='pending' then case when current_relation.requester=v_actor then 'outgoing' else 'incoming' end else 'none' end);
end $$;

create or replace function public.social_list(p_kind text,p_before timestamptz default null,p_cursor uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='10s' as $$
declare v_actor uuid:=auth.uid(); result jsonb;
begin
 if auth.uid() is not null and not public.social_account_active(auth.uid()) then raise exception 'social_inactive';end if;
 perform public.account_assert_allowed(auth.uid());
 if v_actor is null then raise exception 'social_unauthorized';end if;
 if not public.social_account_active(v_actor) then raise exception 'social_inactive';end if;
 if p_kind is null or p_kind not in ('friends','incoming','outgoing','blocked') or (p_before is null)<>(p_cursor is null) then raise exception 'social_invalid';end if;
 with entries as (
  select r.id,r.created_at,case when r.user_low=v_actor then r.user_high else r.user_low end as peer
  from public.social_relationships r where (r.user_low=v_actor or r.user_high=v_actor)
   and ((p_kind='friends' and r.state='accepted') or (p_kind='incoming' and r.state='pending' and r.requester<>v_actor)
    or (p_kind='outgoing' and r.state='pending' and r.requester=v_actor))
  union all
  select b.id,b.created_at,b.blocked from public.social_blocks b where p_kind='blocked' and b.blocker=v_actor
 ), batch as (
  select e.id,e.created_at,p.id as peer,p.username,p.avatar_url from entries e join public.profiles p on p.id=e.peer
  where (p_kind='blocked' or public.social_profile_visible(e.peer))
   and (p_before is null or (e.created_at,e.id)<(p_before,p_cursor))
  order by e.created_at desc,e.id desc limit 21
 ), page as (select * from batch order by created_at desc,id desc limit 20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'createdAt',p.created_at,
   'profile',jsonb_build_object('id',p.peer,'username',p.username,'avatar_url',p.avatar_url,'roles',jsonb_build_object(
    'admin',exists(select 1 from public.admin_users a where a.user_id=p.peer),
    'developer',exists(select 1 from public.game_developer_members d where d.user_id=p.peer and d.role in ('owner','editor'))))) order by p.created_at desc,p.id desc) from page p),'[]'::jsonb),
  'nextCursor',case when (select count(*) from batch)>20 then (select jsonb_build_object('createdAt',created_at,'id',id) from page order by created_at,id limit 1) else null end) into result;
 return result;
end $$;

create or replace function public.social_relation(p_target uuid) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='10s' as $$
declare v_actor uuid:=auth.uid(); relation public.social_relationships;
begin
 if auth.uid() is not null and not public.social_account_active(auth.uid()) then raise exception 'social_inactive';end if;
 perform public.account_assert_allowed(auth.uid());
 if v_actor is null then raise exception 'social_unauthorized';end if;
 if p_target is null then raise exception 'social_invalid';end if;
 if not public.social_account_active(v_actor) then raise exception 'social_inactive';end if;
 if v_actor=p_target then return jsonb_build_object('state','self','relationId',null);end if;
 if not public.social_profile_visible(p_target) or not public.social_account_active(p_target) then
  return jsonb_build_object('state','unavailable','relationId',null);
 end if;
 select * into relation from public.social_relationships where user_low=least(v_actor,p_target) and user_high=greatest(v_actor,p_target);
 return jsonb_build_object('relationId',relation.id,'state',case when relation.state='accepted' then 'friends'
  when relation.state='pending' then case when relation.requester=v_actor then 'outgoing' else 'incoming' end else 'none' end);
end $$;

create or replace function public.social_notifications_count() returns integer
language plpgsql stable security definer set search_path='' set statement_timeout='10s' as $$
declare v_actor uuid:=auth.uid();result integer;
begin
 if auth.uid() is not null and not public.social_account_active(auth.uid()) then raise exception 'social_inactive';end if;
 perform public.account_assert_allowed(auth.uid());
 if v_actor is null then raise exception 'social_unauthorized';end if;
 if not public.social_account_active(v_actor) then raise exception 'social_inactive';end if;
 select count(*) into result from (select n.id from public.social_notifications n where n.recipient=v_actor
  and n.read_at is null and n.expires_at>now() and public.social_profile_visible(n.sender)
  and public.social_account_active(n.sender) and public.social_notification_current(n.relation_id,n.sender,v_actor,n.kind) limit 10) q;
 return result;
end $$;

create or replace function public.social_navigation() returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='10s' as $$
declare v_actor uuid:=auth.uid();count_unread integer;
begin
 if auth.uid() is not null and not public.social_account_active(auth.uid()) then raise exception 'social_inactive';end if;
 perform public.account_assert_allowed(auth.uid());
 count_unread:=public.social_notifications_count();
 return jsonb_build_object('avatarUrl',(select avatar_url from public.profiles where id=v_actor),
  'isAdmin',exists(select 1 from public.admin_users where user_id=v_actor),'unreadCount',count_unread);
end $$;

create or replace function public.social_notifications_page(p_kind text default 'all',p_before timestamptz default null,p_cursor uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='10s' as $$
declare v_actor uuid:=auth.uid();result jsonb;count_unread integer;
begin
 if auth.uid() is not null and not public.social_account_active(auth.uid()) then raise exception 'social_inactive';end if;
 perform public.account_assert_allowed(auth.uid());
 count_unread:=public.social_notifications_count();
 if p_kind is null or p_kind not in ('all','shares') or (p_before is null)<>(p_cursor is null) then raise exception 'social_invalid';end if;
 with eligible as materialized (
  select n.*,public.social_notification_current(n.relation_id,n.sender,v_actor,n.kind) as current_event
  from public.social_notifications n where n.recipient=v_actor and n.expires_at>now()
  and public.social_profile_visible(n.sender) and public.social_account_active(n.sender)
 ), batch as (
  select * from eligible where (p_kind='all' or kind='game_shared')
   and (p_before is null or (created_at,id)<(p_before,p_cursor)) order by created_at desc,id desc limit 21
 ), page as (select * from batch order by created_at desc,id desc limit 20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
   'id',n.id,'createdAt',n.created_at,'kind',n.kind,'read',n.read_at is not null or not n.current_event,
   'actionable',n.current_event and n.kind='friend_request','relationId',n.relation_id,
   'sender',jsonb_build_object('id',p.id,'username',p.username),
   'game',case when g.id is not null and n.current_event then jsonb_build_object('slug',g.slug,'title',g.title) else null end
  ) order by n.created_at desc,n.id desc) from page n join public.public_profiles p on p.id=n.sender
  left join public.games g on g.id=n.game_id and g.is_published),'[]'::jsonb),
  'nextCursor',case when (select count(*) from batch)>20 then (select jsonb_build_object('createdAt',created_at,'id',id) from page order by created_at,id limit 1) else null end,
  'unreadCount',count_unread,
  'readIds',coalesce((select jsonb_agg(id) from eligible where read_at is null and current_event),'[]'::jsonb)) into result;
 return result;
end $$;

create or replace function public.social_notifications_read(p_ids uuid[]) returns integer
language plpgsql security definer set search_path='' set lock_timeout='5s' set statement_timeout='10s' as $$
begin
 if auth.uid() is not null and not public.social_account_active(auth.uid()) then raise exception 'social_inactive';end if;
 perform public.account_assert_allowed(auth.uid());
 perform public.social_notifications_count();
 if p_ids is null or cardinality(p_ids)>200 or array_position(p_ids,null) is not null then raise exception 'social_invalid';end if;
 update public.social_notifications set read_at=clock_timestamp() where recipient=auth.uid() and id=any(p_ids) and read_at is null;
 return public.social_notifications_count();
end $$;

create or replace function public.social_share_friends(p_search text default '',p_before timestamptz default null,p_cursor uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='10s' as $$
declare v_actor uuid:=auth.uid();result jsonb;
begin
 if auth.uid() is not null and not public.social_account_active(auth.uid()) then raise exception 'social_inactive';end if;
 perform public.account_assert_allowed(auth.uid());
 perform public.social_notifications_count();
 if p_search is null or length(p_search)>32 or (p_before is null)<>(p_cursor is null) then raise exception 'social_invalid';end if;
 with batch as (
  select r.id,r.created_at,p.id as peer,p.username,p.avatar_url from public.social_relationships r
  join public.public_profiles p on p.id=case when r.user_low=v_actor then r.user_high else r.user_low end
  where (r.user_low=v_actor or r.user_high=v_actor) and r.state='accepted' and public.social_account_active(p.id)
   and starts_with(lower(p.username),lower(ltrim(p_search,'@')))
   and (p_before is null or (r.created_at,r.id)<(p_before,p_cursor)) order by r.created_at desc,r.id desc limit 21
 ), page as (select * from batch order by created_at desc,id desc limit 20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'createdAt',created_at,
  'profile',jsonb_build_object('id',peer,'username',username,'avatar_url',avatar_url)) order by created_at desc,id desc) from page),'[]'::jsonb),
  'nextCursor',case when (select count(*) from batch)>20 then (select jsonb_build_object('createdAt',created_at,'id',id) from page order by created_at,id limit 1) else null end) into result;
 return result;
end $$;

create or replace function public.social_share_game(p_target uuid,p_game uuid,p_operation uuid) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' set statement_timeout='10s' as $$
declare v_actor uuid:=auth.uid();lo uuid;hi uuid;relation uuid;previous public.social_operations;period date:=(now() at time zone 'UTC')::date;
begin
 if auth.uid() is not null and not public.social_account_active(auth.uid()) then raise exception 'social_inactive';end if;
 perform public.account_assert_allowed(auth.uid());
 if v_actor is null then raise exception 'social_unauthorized';end if;
 if p_target is null or p_game is null or p_operation is null or v_actor=p_target then raise exception 'social_invalid';end if;
 lo:=least(v_actor,p_target);hi:=greatest(v_actor,p_target);
 perform 1 from auth.users where id in (lo,hi) order by id for key share;
 perform pg_advisory_xact_lock(hashtextextended('social-v_actor:'||v_actor::text,0));
 perform pg_advisory_xact_lock(hashtextextended('social-pair:'||lo::text||':'||hi::text,0));
 if not public.social_account_active(v_actor) then raise exception 'social_inactive';end if;
 if not public.social_account_active(p_target) or not public.social_profile_visible(p_target) then raise exception 'social_unavailable';end if;
 select id into relation from public.social_relationships where user_low=lo and user_high=hi and state='accepted';
 if relation is null then raise exception 'social_unavailable';end if;
 perform 1 from public.games where id=p_game and is_published for share;
 if not found then raise exception 'social_unavailable';end if;
 select * into previous from public.social_operations where social_operations.actor=v_actor and operation_id=p_operation;
 if found then
  if previous.action<>'share' or previous.target<>p_target or previous.game_id is distinct from p_game then raise exception 'social_conflict';end if;
  return jsonb_build_object('sent',true,'replayed',true);
 end if;
 if exists(select 1 from public.social_share_cooldowns where social_share_cooldowns.actor=v_actor and target=p_target and game_id=p_game and sent_at>now()-interval '24 hours')
  or exists(select 1 from public.social_share_limits where social_share_limits.actor=v_actor and day_at=period and hits>=20) then raise exception 'social_rate_limited';end if;
 insert into public.social_share_limits values(v_actor,period,1) on conflict on constraint social_share_limits_pkey do update
  set day_at=excluded.day_at,hits=case when social_share_limits.day_at=excluded.day_at then social_share_limits.hits+1 else 1 end;
 insert into public.social_share_cooldowns values(v_actor,p_target,p_game,clock_timestamp()) on conflict on constraint social_share_cooldowns_pkey do update set sent_at=excluded.sent_at;
 perform public.social_notification_insert(p_target,v_actor,'game_shared',p_operation,relation,p_game);
 delete from public.social_operations where social_operations.actor=v_actor and (created_at<now()-interval '24 hours'
  or operation_id in (select operation_id from public.social_operations where social_operations.actor=v_actor order by created_at desc,operation_id offset 127));
 insert into public.social_operations(actor,operation_id,target,action,game_id) values(v_actor,p_operation,p_target,'share',p_game);
 return jsonb_build_object('sent',true,'replayed',false);
end $$;

create or replace function public.distribution_moderation_submit(p_actor uuid,p_input jsonb,p_client text,p_fingerprint text) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' set statement_timeout='10s' as $$
declare op uuid;target uuid;kind text;category text;description text;legal_notice boolean;sensitive boolean;previous public.moderation_receipts;record public.moderation_cases;locator text;
begin
 perform public.account_assert_allowed(p_actor);
 if p_client is null or p_client!~'^[a-f0-9]{64}$' or p_fingerprint is null or p_fingerprint!~'^[a-f0-9]{64}$' then raise exception 'invalid_request';end if;
 op:=(p_input->>'operationId')::uuid;kind:=p_input->>'kind';
 if coalesce(p_input->>'target','')~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then target:=(p_input->>'target')::uuid;
 elsif kind='player' then select id into target from public.profiles where lower(username)=lower(ltrim(p_input->>'target','@'));
 else select id into target from public.games where slug=p_input->>'target';end if;
 category:=p_input->>'category';description:=btrim(p_input->>'description');
 legal_notice:=category='illegal';sensitive:=coalesce((p_input->>'sensitiveException')::boolean,false);
 if op is null or kind is null or kind not in ('player','game') or category is null
  or category not in ('harassment','spam','impersonation','inappropriate','security','illegal','other')
  or (kind='game' and category='harassment') or (kind='player' and category='security')
  or description is null or length(description) not between 20 and 5000
  or (legal_notice and coalesce((p_input->>'goodFaith')::boolean,false) is not true)
  or (sensitive and not legal_notice) or length(coalesce(p_input->>'contactName',''))>160 or length(coalesce(p_input->>'contactEmail',''))>254
  or ((p_actor is null or legal_notice) and not sensitive and (length(btrim(coalesce(p_input->>'contactName','')))<2 or coalesce(p_input->>'contactEmail','')!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')) then raise exception 'invalid_request';end if;
 if p_actor is not null then
  perform 1 from auth.users where id=p_actor for key share;
  if not exists(select 1 from public.profiles where id=p_actor) or public.distribution_account_pending(p_actor) then raise exception 'unauthorized';end if;
 end if;
 if kind='player' and p_actor=target then raise exception 'invalid_request';end if;
 perform pg_advisory_xact_lock(hashtextextended('moderation-client:'||p_client,0));
 select * into previous from public.moderation_receipts where operation=op;
 if found then
  if previous.client_hash<>p_client or previous.fingerprint<>p_fingerprint then raise exception 'idempotency_conflict';end if;
  select * into record from public.moderation_cases where id=previous.case_id;
  return jsonb_build_object('id',record.id,'number',record.number,'replayed',true);
 end if;
 select * into previous from public.moderation_receipts where client_hash=p_client and fingerprint=p_fingerprint and created_at>now()-interval '24 hours' order by created_at desc limit 1;
 if found then
  select * into record from public.moderation_cases where id=previous.case_id;
  return jsonb_build_object('id',record.id,'number',record.number,'replayed',true);
 end if;
 if target is null then raise exception 'invalid_request';end if;
 if kind='player' then
  perform 1 from public.profiles where id=target for key share;
  if not found then raise exception 'invalid_request';end if;
  locator:='/players/'||target::text;
 else
  select '/games/'||slug into locator from public.games where id=target and is_published for share;
  if not found then raise exception 'game_not_found';end if;
 end if;

 if (select count(*) from public.moderation_receipts where client_hash=p_client and created_at>now()-interval '1 minute')>=30
  or (not legal_notice and (select count(*) from public.moderation_receipts where client_hash=p_client and created_at>now()-interval '24 hours')>=20) then raise exception 'rate_limited';end if;
 insert into public.moderation_cases(reporter,target_kind,target_user,target_game,target_locator,category,description,contact_name,contact_email,legal_notice,good_faith,sensitive_exception)
 values(p_actor,kind,case when kind='player' then target end,case when kind='game' then target end,locator,category,description,
  nullif(btrim(p_input->>'contactName'),''),nullif(lower(btrim(p_input->>'contactEmail')),''),legal_notice,coalesce((p_input->>'goodFaith')::boolean,false),sensitive) returning * into record;
 insert into public.moderation_receipts(operation,client_hash,fingerprint,case_id) values(op,p_client,p_fingerprint,record.id);
 insert into public.moderation_events(case_id,actor,version,state) values(record.id,p_actor,1,'open');
 insert into public.moderation_mail(case_id,kind,version) values(record.id,'admin',1);
 if legal_notice and record.contact_email is not null then insert into public.moderation_mail(case_id,kind,version) values(record.id,'receipt',1);end if;
 return jsonb_build_object('id',record.id,'number',record.number,'replayed',false);
end $$;

create or replace function public.distribution_moderation_admin(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' set statement_timeout='10s' as $$
declare record public.moderation_cases;requested uuid;new_state text;days integer;page integer;result jsonb;q text;status text;kind text;search_id uuid;search_number bigint;
begin
 perform public.account_assert_allowed(p_actor);
 perform 1 from auth.users where id=p_actor for key share;
 if not found then raise exception 'forbidden';end if;
 if not exists(select 1 from public.admin_users where user_id=p_actor) or not public.social_account_active(p_actor) then raise exception 'forbidden';end if;
 requested:=nullif(p_input->>'id','')::uuid;
 if p_input->>'action'='update' then
  new_state:=p_input->>'state';days:=(p_input->>'retentionDays')::integer;
  if new_state is null or new_state not in ('review','dismissed','resolved') or days is null or days not between 1 and 3650
   or length(coalesce(p_input->>'note',''))>5000 or length(coalesce(p_input->>'justification',''))>5000
   or (new_state in ('dismissed','resolved') and length(btrim(coalesce(p_input->>'justification','')))<10) then raise exception 'invalid_request';end if;
  select * into record from public.moderation_cases where id=requested for update;
  if not found then raise exception 'invalid_request';end if;
  if p_input->>'version' is null or record.version<>(p_input->>'version')::integer then raise exception 'idempotency_conflict';end if;
  if record.privacy_review and new_state in ('dismissed','resolved') and coalesce((p_input->>'privacyReviewed')::boolean,false) is not true then raise exception 'invalid_request';end if;
  if p_input ? 'redactedDescription' and length(btrim(coalesce(p_input->>'redactedDescription',''))) not between 20 and 5000 then raise exception 'invalid_request';end if;
  if (p_input ? 'redactedDescription' or coalesce((p_input->>'redactNotes')::boolean,false)) and length(btrim(coalesce(p_input->>'note','')))<10 then raise exception 'invalid_request';end if;
  if coalesce((p_input->>'redactNotes')::boolean,false) then update public.moderation_events set note=null,justification=null where case_id=requested;end if;
  if p_input ? 'redactedDescription' or coalesce((p_input->>'redactNotes')::boolean,false) then
   update public.moderation_mail set message=null,state=case when state='sent' then 'sent' else 'attention_required' end,lease=null,lease_until=null where case_id=requested;
  end if;
  update public.moderation_cases set description=coalesce(p_input->>'redactedDescription',description),privacy_review=case when coalesce((p_input->>'privacyReviewed')::boolean,false) then false else privacy_review end,state=new_state,version=version+1,justification=nullif(btrim(p_input->>'justification'),''),updated_at=clock_timestamp(),
   closed_at=case when new_state in ('dismissed','resolved') then now() end,
   expires_at=case when new_state in ('dismissed','resolved') then now()+make_interval(days=>days) end where id=requested returning * into record;
  insert into public.moderation_events(case_id,actor,actor_reference,version,state,justification,note,redacted) values(record.id,p_actor,p_actor,record.version,new_state,record.justification,nullif(btrim(p_input->>'note'),''),p_input ? 'redactedDescription' or coalesce((p_input->>'redactNotes')::boolean,false));
  if record.legal_notice and record.contact_email is not null and new_state in ('dismissed','resolved') then
   insert into public.moderation_mail(case_id,kind,version) values(record.id,'decision',record.version);
  end if;
 end if;
 if requested is not null then
  select to_jsonb(c)-'search_document'||jsonb_build_object('reporter_name',(select username from public.profiles where id=c.reporter),
   'target_view',case when c.target_kind='player' then (select jsonb_build_object('username',p.username,'bio',p.bio) from public.profiles p where p.id=c.target_user)
    else (select jsonb_build_object('title',g.title,'published',g.is_published) from public.games g where g.id=c.target_game) end,
   'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.version) from public.moderation_events e where e.case_id=c.id),'[]'::jsonb),
   'mail',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'state',m.state,'attempts',m.attempts)) from public.moderation_mail m where m.case_id=c.id),'[]'::jsonb)) into result from public.moderation_cases c where c.id=requested;
  return result;
 end if;
 page:=coalesce((p_input->>'page')::integer,1);q:=btrim(coalesce(p_input->>'search',''));status:=coalesce(p_input->>'state','');kind:=coalesce(p_input->>'kind','');
 if page not between 1 and 10000 or length(q)>100 or status not in ('','open','review','dismissed','resolved') or kind not in ('','player','game') then raise exception 'invalid_request';end if;
 if q~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then search_id:=q::uuid;elsif q~'^[0-9]{1,18}$' then search_number:=q::bigint;end if;
 with batch as (
  select id,number,target_kind,category,state,created_at,reporter,(select username from public.profiles where id=c.reporter) as reporter_name,privacy_review from public.moderation_cases c
  where (status='' or c.state=status) and (kind='' or c.target_kind=kind)
   and (q='' or c.id=search_id or c.number=search_number or (search_id is null and search_number is null and c.search_document@@plainto_tsquery('simple',q)))
   order by created_at desc,id desc offset (page-1)*20 limit 21
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc) from (select * from batch order by created_at desc,id desc limit 20) x),'[]'::jsonb),'hasMore',(select count(*) from batch)>20,'page',page) into result;
 return result;
end $$;

create function public.distribution_moderation_measure(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' set statement_timeout='15s' as $$
declare subject_row public.moderation_subjects;event_row public.moderation_measures;target uuid:=(p_input->>'target')::uuid;
 v_kind text:=p_input->>'kind';v_action text:=p_input->>'action';request_id uuid:=(p_input->>'operationId')::uuid;
 until_at timestamptz:=(p_input->>'endsAt')::timestamptz;linked_case uuid:=(p_input->>'caseId')::uuid;
 policy_days integer:=(p_input->>'retentionDays')::integer;requested_subject uuid:=(p_input->>'subject')::uuid;expected integer:=(p_input->>'version')::integer;before_at timestamptz:=(p_input->>'before')::timestamptz;cursor_id uuid:=(p_input->>'cursor')::uuid;
begin
 perform public.account_assert_allowed(p_actor);
 perform id from auth.users where id=p_actor for key share;
 if not found or not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden';end if;
 if requested_subject is not null then
  if v_action is not null then raise exception 'invalid_request';end if;
  select * into subject_row from public.moderation_subjects where id=requested_subject;
  if not found then raise exception 'invalid_request';end if;
  target:=coalesce(subject_row.user_id,subject_row.game_id);v_kind:=subject_row.kind;
 elsif target is null or v_kind not in ('player','game') then raise exception 'invalid_request';end if;
 if v_action is not null then
  if request_id is null or expected is null or expected<0 or length(btrim(coalesce(p_input->>'reason',''))) not between 10 and 5000
   or length(coalesce(p_input->>'note',''))>5000 or v_action not in ('warn','suspend','ban','lift','unpublish','restore') then raise exception 'invalid_request';end if;
  if (v_kind='player' and v_action in ('unpublish','restore')) or (v_kind='game' and v_action not in ('unpublish','restore')) then raise exception 'invalid_request';end if;
  select * into event_row from public.moderation_measures where id=request_id;
  if found then
   if event_row.actor=p_actor and event_row.operation_hash=encode(sha256(convert_to((p_input-'retentionDays')::text,'UTF8')),'hex') then
    return jsonb_build_object('id',event_row.id,'version',event_row.version,'current',public.distribution_moderation_measure(p_actor,jsonb_build_object('subject',event_row.subject)));
   end if;
   raise exception 'idempotency_conflict';
  end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(case when v_kind='player' then 'account-moderation:' else 'game-moderation:' end||target::text,0));
 if v_kind='player' then
  perform id from auth.users where id=target for key share;
  if not found and requested_subject is null then raise exception 'account_not_found';end if;
  if v_action is not null and public.distribution_account_pending(target) then raise exception 'account_deletion_pending';end if;
  if v_action is not null and (target=p_actor or exists(select 1 from public.admin_users where user_id=target)) then raise exception 'forbidden';end if;
 else
  perform id from public.games where id=target for update;
  if not found and requested_subject is null then raise exception 'game_not_found';end if;
 end if;
 select * into subject_row from public.moderation_subjects where id=requested_subject or (v_kind='player' and user_id=target) or (v_kind='game' and game_id=target) for update;
 if v_action is not null then
  select * into event_row from public.moderation_measures where id=request_id;
  if found then
   if event_row.actor=p_actor and event_row.operation_hash=encode(sha256(convert_to((p_input-'retentionDays')::text,'UTF8')),'hex') then return jsonb_build_object('id',event_row.id,'version',event_row.version,'current',public.distribution_moderation_measure(p_actor,jsonb_build_object('subject',event_row.subject)));end if;
   raise exception 'idempotency_conflict';
  end if;
  if (v_action='suspend' and (until_at is null or until_at<=clock_timestamp()+interval '1 minute' or until_at>clock_timestamp()+interval '366 days'))
    or (v_action<>'suspend' and until_at is not null) then raise exception 'invalid_request';end if;
  perform pg_advisory_xact_lock(hashtextextended('moderation-decisions:'||p_actor::text,0));
  if (select count(*) from public.moderation_measures where actor=p_actor and created_at>clock_timestamp()-interval '1 minute')>=30 then raise exception 'rate_limited';end if;
  if coalesce(subject_row.version,0)<>expected then raise exception 'request_conflict';end if;
  if linked_case is not null and not exists(select 1 from public.moderation_cases c where c.id=linked_case
    and ((v_kind='player' and c.target_user=target) or (v_kind='game' and c.target_game=target))) then raise exception 'invalid_request';end if;
  policy_days:=coalesce(policy_days,subject_row.retention_days);
  if policy_days is null or policy_days not between 1 and 3650 then raise exception 'invalid_request';end if;
  if subject_row.id is null then
   insert into public.moderation_subjects(id,kind,user_id,game_id,retention_days,retain_until) values(gen_random_uuid(),v_kind,case when v_kind='player' then target end,case when v_kind='game' then target end,policy_days,clock_timestamp()+make_interval(days=>policy_days)) returning * into subject_row;
  end if;
  if v_action='suspend' and subject_row.measure='ban' then raise exception 'invalid_state';end if;
  if v_action='suspend' and subject_row.measure='suspend' and subject_row.ends_at>clock_timestamp() and until_at<=subject_row.ends_at then raise exception 'invalid_state';end if;
  if v_action='lift' and (subject_row.measure is null or (subject_row.measure='suspend' and subject_row.ends_at<=clock_timestamp())) then raise exception 'invalid_state';end if;
  if v_action='unpublish' and not exists(select 1 from public.games where id=target and is_published) then raise exception 'invalid_state';end if;
  if v_action='restore' then
   if subject_row.measure is distinct from 'unpublish' then raise exception 'invalid_state';end if;
   if exists(select 1 from public.games g where g.id=target and (g.active_version_id is not null or g.catalogue_source='developer_submission')
    and not exists(select 1 from public.game_versions v where v.id=g.active_version_id and v.game_id=g.id and v.status='published')) then raise exception 'version_not_found';end if;
  end if;
  update public.moderation_subjects set version=version+1,retention_days=policy_days,
   retain_until=(case when v_action in ('lift','restore') then clock_timestamp() else greatest(clock_timestamp(),until_at,subject_row.ends_at) end)+make_interval(days=>policy_days),
   measure=case when v_action='warn' then measure when v_action in ('lift','restore') then null else v_action end,
   ends_at=case when v_action='suspend' then until_at when v_action='warn' then ends_at else null end where id=subject_row.id returning * into subject_row;
  insert into public.moderation_measures(id,subject,case_id,actor,actor_reference,operation_hash,version,action,reason,note,ends_at,retention_days)
   values(request_id,subject_row.id,linked_case,p_actor,p_actor,encode(sha256(convert_to((p_input-'retentionDays')::text,'UTF8')),'hex'),subject_row.version,v_action,btrim(p_input->>'reason'),nullif(btrim(p_input->>'note'),''),until_at,policy_days) returning * into event_row;
  if v_kind='player' and v_action in ('suspend','ban') then
   update public.game_launch_sessions set revoked_at=coalesce(revoked_at,clock_timestamp()) where issued_by=target;
   update public.game_connection_tickets set revoked_at=coalesce(revoked_at,clock_timestamp()) where launch_id in(select id from public.game_launch_sessions where issued_by=target);
   update public.game_online_participants set removed_at=coalesce(removed_at,clock_timestamp()) where actor_id=target;
   delete from public.game_preview_sessions where issued_by=target;
  elsif v_kind='game' then
   perform set_config('chibasko.moderation_game_change',target::text,true);
   update public.games set is_published=(v_action='restore') where id=target;
   if v_action='unpublish' then
    update public.game_launch_sessions set revoked_at=coalesce(revoked_at,clock_timestamp()) where audience='published' and version_id in(select id from public.game_versions where game_id=target);
   end if;
  end if;
  return jsonb_build_object('id',event_row.id,'version',subject_row.version,'current',public.distribution_moderation_measure(p_actor,jsonb_build_object('subject',subject_row.id)));
 end if;
 return jsonb_build_object('version',coalesce(subject_row.version,0),'blocked',coalesce((target is not null and (subject_row.measure in ('ban','unpublish') or (subject_row.measure='suspend' and subject_row.ends_at>clock_timestamp()))),false),'measure',subject_row.measure,'endsAt',subject_row.ends_at,
  'protected',(v_kind='player' and exists(select 1 from public.admin_users where user_id=target)),
  'published',case when v_kind='game' then (select is_published from public.games where id=target) end,
  'name',case when v_kind='player' then (select username from public.profiles where id=target) else (select title from public.games where id=target) end,
  'reports',coalesce((select jsonb_agg(x order by x.created_at desc,x.id desc) from
   (select c.id,c.number,c.state,c.category,c.created_at from public.moderation_cases c
    where (v_kind='player' and c.target_user=target) or (v_kind='game' and c.target_game=target)
     or c.id in(select m.case_id from public.moderation_measures m where m.subject=subject_row.id)
    order by c.created_at desc,c.id desc limit 10) x),'[]'::jsonb),
  'history',coalesce((select jsonb_agg(x order by x.created_at desc,x.id desc) from
   (select m.id,m.action,m.reason,m.note,m.ends_at,m.created_at,m.actor_reference,m.case_id,m.archived_at,m.retention_days,
    (select coalesce(jsonb_agg(jsonb_build_object('kind',n.kind,'state',n.state,'attempts',n.attempts)),'[]') from public.moderation_measure_mail n where n.measure_id=m.id) as mail,
    (select to_jsonb(a) from public.moderation_appeals a where a.measure=m.id) as appeal
    from public.moderation_measures m where m.subject=subject_row.id and (before_at is null or (m.created_at,m.id)<(before_at,cursor_id))
    order by m.created_at desc,m.id desc limit 20) x),'[]'::jsonb));
end $$;
revoke all on function public.distribution_moderation_measure(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.distribution_moderation_measure(uuid,jsonb) to service_role;

create function public.distribution_moderation_appeals(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare item public.moderation_appeals;subject_row public.moderation_subjects;action_row public.moderation_measures;
begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden';end if;
 if p_input ? 'id' then
  select m.* into action_row from public.moderation_measures m join public.moderation_appeals a on a.measure=m.id where a.id=(p_input->>'id')::uuid;
  select * into subject_row from public.moderation_subjects where id=action_row.subject;
  perform pg_advisory_xact_lock(hashtextextended((case when subject_row.kind='game' then 'game-moderation:' else 'account-moderation:' end)||coalesce(subject_row.user_id,subject_row.game_id)::text,0));
  select * into item from public.moderation_appeals where id=(p_input->>'id')::uuid for update;
  if not found or item.version is distinct from (p_input->>'version')::integer or item.state<>'pending' then raise exception 'request_conflict';end if;
  if p_input->>'state' not in ('accepted','rejected') or length(btrim(coalesce(p_input->>'decision',''))) not between 10 and 5000 then raise exception 'invalid_request';end if;
  if coalesce((p_input->>'lift')::boolean,false) then
   if p_input->>'state'<>'accepted' or coalesce(subject_row.user_id,subject_row.game_id) is null then raise exception 'invalid_request';end if;
   perform public.distribution_moderation_measure(p_actor,jsonb_build_object('kind',subject_row.kind,'target',coalesce(subject_row.user_id,subject_row.game_id),'action',case when subject_row.kind='player' then 'lift' else 'restore' end,'version',p_input->'subjectVersion',
    'operationId',p_input->'operationId','reason',p_input->>'decision','note','Levée explicitement décidée lors du réexamen.'));
  end if;
  update public.moderation_subjects set retain_until=greatest(clock_timestamp(),ends_at)+make_interval(days=>retention_days) where id=subject_row.id;
  update public.moderation_appeals set state=p_input->>'state',decision=btrim(p_input->>'decision'),reviewer=p_actor,reviewer_reference=p_actor,reviewed_at=clock_timestamp(),version=version+1 where id=item.id;
 end if;
 return coalesce((select jsonb_agg(x order by x.created_at,x.id) from
  (select a.*,m.reason,m.action,s.user_id,s.game_id,s.kind,s.id as subject,s.version as subject_version,p.username,(select title from public.games where id=s.game_id) as game_title from public.moderation_appeals a join public.moderation_measures m on m.id=a.measure
   join public.moderation_subjects s on s.id=m.subject left join public.profiles p on p.id=a.author
   where a.state='pending' and (not p_input ? 'before' or (a.created_at,a.id)>((p_input->>'before')::timestamptz,(p_input->>'cursor')::uuid)) order by a.created_at,a.id limit 20) x),'[]'::jsonb);
end $$;
revoke all on function public.distribution_moderation_appeals(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.distribution_moderation_appeals(uuid,jsonb) to service_role;

create function public.moderation_game_publication_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.is_published and exists(select 1 from public.moderation_subjects where game_id=new.id and measure='unpublish')
  and current_setting('chibasko.moderation_game_change',true) is distinct from new.id::text then raise exception 'game_not_available';end if;
 return new;
end $$;
revoke all on function public.moderation_game_publication_guard() from public,anon,authenticated,service_role;
create trigger moderation_game_publication_guard before insert or update of is_published on public.games for each row execute function public.moderation_game_publication_guard();

-- Les JWT existants ne contournent pas les politiques restrictives des tables privées.
do $$declare t record;begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relname not in ('games','admin_users')
   and has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') loop
  execute format('create policy moderation_account_boundary on public.%I as restrictive for all to authenticated using((select public.account_access())) with check((select public.account_access()))',t.relname);
 end loop;
end $$;

create table public.moderation_measure_mail(like public.moderation_mail including defaults including constraints);
alter table public.moderation_measure_mail add primary key(id);
create index moderation_measure_mail_claim on public.moderation_measure_mail(next_attempt_at,created_at,id) where state='pending';
alter table public.moderation_measure_mail alter column case_id drop not null;
alter table public.moderation_measure_mail add foreign key(case_id) references public.moderation_cases(id) on delete set null;
alter table public.moderation_measure_mail add column measure_id uuid references public.moderation_measures(id);
alter table public.moderation_measure_mail add column recipient uuid references auth.users(id) on delete cascade;
alter table public.moderation_measure_mail add column notice jsonb not null;
create unique index moderation_measure_mail_recipient on public.moderation_measure_mail(measure_id,recipient,kind) where recipient is not null;
create index moderation_measure_mail_measure on public.moderation_measure_mail(measure_id);
create unique index moderation_measure_mail_admin on public.moderation_measure_mail(measure_id,kind) where kind='admin';
alter table public.moderation_measure_mail enable row level security;
revoke all on public.moderation_measure_mail from public,anon,authenticated,service_role;
grant select on public.moderation_measure_mail to service_role;

create function public.moderation_measure_notify() returns trigger
language plpgsql security definer set search_path='' as $$
declare subject_row public.moderation_subjects;recipient_id uuid;title text;body text;
begin
 select * into strict subject_row from public.moderation_subjects where id=new.subject;
 title:=case new.action when 'warn' then 'Avertissement' when 'suspend' then 'Suspension temporaire' when 'ban' then 'Bannissement' when 'lift' then 'Levée de sanction' when 'unpublish' then 'Dépublication du jeu' else 'Restauration du jeu' end;
 body:='Décision administrative Chibasko Games : '||title||E'\nRéférence : '||new.id::text||E'\n\n'||new.reason||
  case when new.ends_at is not null then E'\n\nFin de suspension (UTC) : '||to_char(new.ends_at at time zone 'UTC','YYYY-MM-DD HH24:MI') else '' end;
 for recipient_id in select subject_row.user_id where subject_row.kind='player' and subject_row.user_id is not null
  union select user_id from public.game_developer_members where game_id=subject_row.game_id and role='owner' loop
  insert into public.moderation_measure_mail(case_id,measure_id,recipient,kind,version,notice)
   values(new.case_id,new.id,recipient_id,'decision',new.version,jsonb_build_object('title',title,'text',body));
 end loop;
 return new;
end $$;
revoke all on function public.moderation_measure_notify() from public,anon,authenticated,service_role;
create trigger moderation_measure_notify after insert on public.moderation_measures for each row execute function public.moderation_measure_notify();

create function public.moderation_appeal_notify() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into public.moderation_measure_mail(measure_id,kind,version,notice)
   values(new.measure,'admin',1,jsonb_build_object('title','Recours à examiner','text','Un recours attend un réexamen administratif. Référence : '||new.id::text));
 elsif old.state='pending' and new.state<>'pending' and new.author is not null then
  insert into public.moderation_measure_mail(measure_id,recipient,kind,version,notice)
   values(new.measure,new.author,'receipt',new.version,jsonb_build_object('title','Décision sur le recours','text',new.decision));
 end if;
 return new;
end $$;
revoke all on function public.moderation_appeal_notify() from public,anon,authenticated,service_role;
create trigger moderation_appeal_notify after insert or update on public.moderation_appeals for each row execute function public.moderation_appeal_notify();

create function public.distribution_moderation_claim_measure_mail() returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare job public.moderation_measure_mail;recipient_email text;result jsonb;
begin
 update public.moderation_measure_mail set state='attention_required',lease=null,lease_until=null where id in
  (select id from public.moderation_measure_mail where state='pending' and (lease_until is null or lease_until<=now())
   and (attempts>=8 or first_attempt_at<=now()-interval '22 hours') order by created_at,id limit 100 for update skip locked);
 select * into job from public.moderation_measure_mail where state='pending' and next_attempt_at<=now() and (lease_until is null or lease_until<=now()) order by next_attempt_at,created_at,id limit 1 for update skip locked;
 if not found then return null;end if;
 update public.moderation_measure_mail set lease=gen_random_uuid(),lease_until=now()+interval '90 seconds',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()) where id=job.id returning * into job;
 select email into recipient_email from auth.users where id=job.recipient;
 return jsonb_build_object('id',job.id,'lease',job.lease,'kind',job.kind,'stream','measure','notice',job.notice,'message',job.message,
  'adminPath',case when coalesce(s.user_id,s.game_id) is null then '/admin/moderation?subject='||s.id::text else '/admin/moderation?target='||coalesce(s.user_id,s.game_id)::text||'&kind='||s.kind end,
  'case',jsonb_build_object('id',coalesce(job.case_id,job.measure_id),'number',m.version,'category','other','target_kind',s.kind,'contact_email',case when s.kind='game' then coalesce((select contact_email from public.developer_contacts where user_id=job.recipient),recipient_email) else recipient_email end))
  from public.moderation_measures m join public.moderation_subjects s on s.id=m.subject where m.id=job.measure_id;
end $$;
revoke all on function public.distribution_moderation_claim_measure_mail() from public,anon,authenticated;
grant execute on function public.distribution_moderation_claim_measure_mail() to service_role;

create function public.distribution_moderation_prepare_measure_mail(p_id uuid,p_lease uuid,p_message jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 update public.moderation_measure_mail set message=coalesce(message,p_message) where id=p_id and lease=p_lease and lease_until>now() and state='pending' returning message into result;
 if not found then raise exception 'lease_lost';end if;return result;
end $$;
revoke all on function public.distribution_moderation_prepare_measure_mail(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.distribution_moderation_prepare_measure_mail(uuid,uuid,jsonb) to service_role;

create function public.distribution_moderation_finish_measure_mail(p_id uuid,p_lease uuid,p_success boolean,p_permanent boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.moderation_measure_mail set state=case when p_success then 'sent' when p_permanent or attempts>=8 then 'attention_required' else 'pending' end,
  message=case when p_success then null else message end,notice=case when p_success then '{}'::jsonb else notice end,
  lease=null,lease_until=null,next_attempt_at=now()+make_interval(secs=>least(3600,300*(2^greatest(attempts-1,0))::integer))
  where id=p_id and lease=p_lease and lease_until>now() and state='pending';
 if not found then raise exception 'lease_lost';end if;
end $$;
revoke all on function public.distribution_moderation_finish_measure_mail(uuid,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.distribution_moderation_finish_measure_mail(uuid,uuid,boolean,boolean) to service_role;

-- Un seul flux de livraison et le même plafond de deux messages par cycle.
alter function public.distribution_moderation_claim_mail() rename to distribution_moderation_claim_report_mail;
create sequence public.moderation_delivery_rotation;
revoke all on sequence public.moderation_delivery_rotation from public,anon,authenticated,service_role;
create function public.distribution_moderation_claim_mail() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if nextval('public.moderation_delivery_rotation')%2=0 then
  return coalesce(public.distribution_moderation_claim_report_mail(),public.distribution_moderation_claim_measure_mail());
 end if;
 return coalesce(public.distribution_moderation_claim_measure_mail(),public.distribution_moderation_claim_report_mail());
end
$$;
revoke all on function public.distribution_moderation_claim_mail() from public,anon,authenticated;
grant execute on function public.distribution_moderation_claim_mail() to service_role;


create or replace function public.social_account_active(p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=p_actor
  and to_jsonb(u)->>'deleted_at' is null
  and coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity'::timestamptz)<=now())
 and public.account_actor_allowed(p_actor) and not public.distribution_account_pending(p_actor)
$$;

create or replace function public.distribution_check_launch(p_capability_hash text) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog,public as $$
declare s public.game_launch_sessions; v public.game_versions; visible boolean; begin
 select * into s from public.game_launch_sessions where capability_hash=p_capability_hash;
 perform public.account_assert_allowed(s.issued_by);
 if s.audience='published' then perform pg_advisory_xact_lock_shared(hashtextextended('game-moderation:'||(s.safe_context->>'gameId'),0));end if;
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



create function public.distribution_moderation_archive() returns integer
language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare subject_row public.moderation_subjects;ids uuid[];total integer:=0;begin
 for subject_row in select s.* from public.moderation_subjects s
  where s.retain_until<=clock_timestamp()
   and not coalesce((s.user_id is not null and (s.measure='ban' or (s.measure='suspend' and s.ends_at>clock_timestamp()))),false)
   and not coalesce((s.game_id is not null and s.measure='unpublish'),false)
   and exists(select 1 from public.moderation_measures m where m.subject=s.id and m.archived_at is null)
  order by s.retain_until,s.id limit 10 for update skip locked
 loop
  if exists(select 1 from public.moderation_appeals a join public.moderation_measures m on m.id=a.measure where m.subject=subject_row.id and a.state='pending')
   or exists(select 1 from public.moderation_measure_mail d join public.moderation_measures m on m.id=d.measure_id where m.subject=subject_row.id and d.state='pending') then continue;end if;
  select array_agg(id) into ids from (select m.id from public.moderation_measures m where m.subject=subject_row.id and m.archived_at is null order by m.version limit 50) batch;
  update public.moderation_measures set reason='Justification archivée selon la politique de conservation.',note=null,archived_at=clock_timestamp() where id=any(ids);
  update public.moderation_appeals set description='Texte du recours archivé selon la politique de conservation.',decision='Décision archivée.',archived_at=clock_timestamp() where measure=any(ids) and state<>'pending';
  update public.moderation_measure_mail set notice='{}',message=null where id in(select id from public.moderation_measure_mail where measure_id=any(ids) and state<>'pending' limit 100);
  total:=total+coalesce(cardinality(ids),0);
 end loop;
 return total;
end $$;
revoke all on function public.distribution_moderation_archive() from public,anon,authenticated;
grant execute on function public.distribution_moderation_archive() to service_role;
create index moderation_subjects_expiration on public.moderation_subjects(retain_until,id);

create or replace function public.distribution_moderation_cleanup() returns integer
language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare total integer;begin
 if not pg_try_advisory_xact_lock(hashtextextended('moderation-cleanup',0)) then return 0;end if;
 delete from public.moderation_cases where id in(select c.id from public.moderation_cases c where state in ('dismissed','resolved') and expires_at<=now()
  and not exists(select 1 from public.moderation_measures mm join public.moderation_subjects ms on ms.id=mm.subject where mm.case_id=c.id and ((ms.user_id is not null and (ms.measure='ban' or (ms.measure='suspend' and ms.ends_at>now()))) or (ms.game_id is not null and ms.measure='unpublish') or (mm.archived_at is null and ms.retain_until>now()) or exists(select 1 from public.moderation_appeals a where a.measure=mm.id and a.state='pending')))
  and not exists(select 1 from public.moderation_mail m where m.case_id=c.id and m.lease_until>now()) order by expires_at,id limit 100 for update skip locked);
 get diagnostics total=row_count;
 perform public.distribution_moderation_archive();
 delete from public.moderation_receipts where operation in(select operation from public.moderation_receipts where created_at<=now()-interval '24 hours' order by created_at limit 500);
 return total;
end $$;
create function public.moderation_admin_role_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform public.account_assert_allowed(new.user_id);
 return new;
end $$;
revoke all on function public.moderation_admin_role_guard() from public,anon,authenticated,service_role;
create trigger moderation_admin_role_guard before insert or update on public.admin_users for each row execute function public.moderation_admin_role_guard();

create function public.moderation_profile_write_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare administrator text;
begin
 if current_setting('role',true)='service_role' then
  administrator:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-chibasko-admin-actor';
  if administrator~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' and exists(select 1 from public.admin_users where user_id=administrator::uuid) then
   perform public.account_assert_allowed(administrator::uuid);
  else perform public.account_assert_allowed(new.id);end if;
 end if;
 return new;
end $$;
revoke all on function public.moderation_profile_write_guard() from public,anon,authenticated,service_role;
create trigger moderation_profile_write_guard before insert or update on public.profiles for each row execute function public.moderation_profile_write_guard();

create function public.distribution_moderation_cleanup_lobbies() returns void
language plpgsql security definer set search_path='' set statement_timeout='3s' as $$
declare lobby public.multiplayer_lobbies;
begin
 if not exists(select 1 from public.moderation_subjects where measure='ban' or (measure='suspend' and ends_at>clock_timestamp())) then return;end if;
 for lobby in select l.* from public.multiplayer_lobbies l where l.status<>'closed'
  and exists(select 1 from public.multiplayer_lobby_members m join public.moderation_subjects s on s.user_id=m.actor_id where m.lobby_id=l.id and (s.measure='ban' or (s.measure='suspend' and s.ends_at>clock_timestamp())))
  order by l.id limit 100 for update skip locked loop
  delete from public.multiplayer_lobby_members m where m.lobby_id=lobby.id and exists(select 1 from public.moderation_subjects s where s.user_id=m.actor_id and (s.measure='ban' or (s.measure='suspend' and s.ends_at>clock_timestamp())));
  update public.multiplayer_lobbies set leader_actor=case when exists(select 1 from public.multiplayer_lobby_members where lobby_id=lobby.id and actor_id=lobby.leader_actor) then lobby.leader_actor else (select m.actor_id from public.multiplayer_lobby_members m where m.lobby_id=lobby.id order by m.joined_at,m.actor_id limit 1) end,
   status=case when exists(select 1 from public.multiplayer_lobby_members where lobby_id=lobby.id) then status else 'closed' end,
   revision=revision+1 where id=lobby.id;
 end loop;
end $$;
revoke all on function public.distribution_moderation_cleanup_lobbies() from public,anon,authenticated;
grant execute on function public.distribution_moderation_cleanup_lobbies() to service_role;


create or replace function public.distribution_prepare_online_session(p_version uuid,p_deployment uuid,p_participants jsonb) returns text
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare sid text; capacity jsonb; item jsonb; begin
 select manifest#>'{capabilities,online,players}' into capacity from public.game_versions where id=p_version;
 if capacity is null or jsonb_typeof(p_participants)<>'array'
  or jsonb_array_length(p_participants) not between (capacity->>'min')::integer and (capacity->>'max')::integer
  or jsonb_array_length(p_participants)>4096 then raise exception 'invalid_online_roster'; end if;
 if not exists(select 1 from public.game_server_deployments where id=p_deployment and status='active') then raise exception 'invalid_deployment'; end if;
 insert into public.game_online_sessions(version_id,deployment_id) values(p_version,p_deployment) returning id into sid;
 for item in select * from jsonb_array_elements(p_participants) order by value->>'actorId' loop
  perform public.account_assert_allowed((item->>'actorId')::uuid);
  insert into public.game_online_participants(session_id,actor_id,display_name) values(sid,(item->>'actorId')::uuid,item->>'displayName');
 end loop;
 return sid;
end $$;

create or replace function public.distribution_cleanup_multiplayer() returns void
language plpgsql security invoker set search_path=pg_catalog,public set statement_timeout='5s' as $$
declare l public.multiplayer_lobbies; session_ref text;
begin
 perform public.distribution_moderation_cleanup_lobbies();
 for l in select * from public.multiplayer_lobbies where status<>'closed' and (expires_at<=clock_timestamp() or (status='waiting' and waiting_until<=clock_timestamp())) order by id for update skip locked limit 100 loop
  for session_ref in select session_id from public.multiplayer_lobby_rounds where lobby_id=l.id and finished_at is null loop perform public.distribution_close_online_session(session_ref); end loop;
  update public.multiplayer_lobbies set status='closed',revision=revision+1 where id=l.id;
 end loop;
 delete from public.multiplayer_lobbies where id in(select id from public.multiplayer_lobbies where status='closed' and expires_at<clock_timestamp()-interval '7 days' order by expires_at,id for update skip locked limit 100);
 delete from public.multiplayer_api_limits where ctid in(select ctid from public.multiplayer_api_limits where window_at<clock_timestamp()-interval '1 hour' for update skip locked limit 100);
end $$;
create or replace function public.distribution_renew_launch(p_id uuid,p_control_hash text,p_seconds integer) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.game_launch_sessions; v public.game_versions; begin
 if p_seconds not between 60 and 1800 then raise exception 'invalid_launch_request'; end if;
 select * into s from public.game_launch_sessions where id=p_id and control_hash=p_control_hash;
 perform public.account_assert_allowed(s.issued_by);
 if s.audience='published' then perform pg_advisory_xact_lock_shared(hashtextextended('game-moderation:'||(s.safe_context->>'gameId'),0));end if;
 select * into s from public.game_launch_sessions where id=p_id and control_hash=p_control_hash for update;
 if not found or s.revoked_at is not null or s.expires_at<=clock_timestamp()
  or s.created_at+interval '24 hours'<=clock_timestamp() then raise exception 'launch_expired'; end if;
 select * into strict v from public.game_versions where id=s.version_id;
 -- Les droits courants sont revérifiés pour les prévisualisations et publications.
 perform public.distribution_authorize_launch(s.issued_by,v.game_id,s.version_id,s.audience,s.execution);
 update public.game_launch_sessions
 set expires_at=least(clock_timestamp()+make_interval(secs=>p_seconds),s.created_at+interval '24 hours')
 where id=s.id returning * into s;
 return jsonb_build_object('id',s.id,'version_id',s.version_id,'generation',s.generation,
  'expires_at',s.expires_at,'safe_context',s.safe_context);
end $$;
create or replace function public.distribution_issue_connection_ticket(p_launch uuid,p_control_hash text,p_generation uuid,p_ticket_hash text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare l public.game_launch_sessions; s public.game_online_sessions; p public.game_online_participants; d public.game_server_deployments; issued timestamptz; expiry timestamptz; begin
 select * into l from public.game_launch_sessions where id=p_launch and control_hash=p_control_hash;
 perform public.account_assert_allowed(l.issued_by);
 if l.audience='published' then perform pg_advisory_xact_lock_shared(hashtextextended('game-moderation:'||(l.safe_context->>'gameId'),0));end if;
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
 -- Une réponse START perdue peut être reprise ; seul le dernier ticket émis reste utilisable.
 update public.game_connection_tickets set revoked_at=coalesce(revoked_at,clock_timestamp()) where launch_id=l.id;
 issued:=clock_timestamp();expiry:=least(issued+interval '3 minutes',l.expires_at);
 insert into public.game_connection_tickets(ticket_hash,session_id,participant_id,launch_id,generation,created_at,expires_at)
 values(p_ticket_hash,s.id,p.id,l.id,l.generation,issued,expiry);
 return jsonb_build_object('execution','online','online',jsonb_build_object('onlineSessionId',s.id,'participantId',p.id,
  'server',jsonb_build_object('endpoint',d.endpoint,'expiresAt',expiry)));
end $$;
create or replace function public.distribution_exchange_preview(p_session uuid,p_ticket_hash text,p_cookie_hash text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.game_preview_sessions; v public.game_versions; begin
 select * into s from public.game_preview_sessions where id=p_session and ticket_hash=p_ticket_hash;
 perform public.account_assert_allowed(s.issued_by);
select * into s from public.game_preview_sessions where id=p_session and ticket_hash=p_ticket_hash for update;
 if not found or s.ticket_expires_at<=now() or s.expires_at<=now() then raise exception 'preview_expired'; end if;
 if s.consumed_at is not null then raise exception 'preview_replayed'; end if;
 select * into v from public.game_versions where id=s.version_id;
 if v.status not in ('draft','in_review','approved') then raise exception 'version_not_previewable'; end if;
 if not public.distribution_preview_allowed(s.issued_by,v.game_id,v.status) then raise exception 'preview_forbidden'; end if;
 update public.game_preview_sessions set consumed_at=now(),cookie_hash=p_cookie_hash where id=p_session;
 return jsonb_build_object('id',s.id,'version_id',s.version_id,'execution',s.execution,'expires_at',s.expires_at);
end $$;
create or replace function public.distribution_exchange_connection_ticket(p_credential_hash text,p_ticket_hash text,p_request uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare c public.game_server_credentials; t public.game_connection_tickets; s public.game_online_sessions;
 p public.game_online_participants; l public.game_launch_sessions; v public.game_versions; d public.game_server_deployments;
 count_attempts integer; result jsonb; begin
 -- Les échecs restent des valeurs pour conserver les compteurs anti-abus.
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
 select * into l from public.game_launch_sessions where id=t.launch_id;
 begin
 perform public.account_assert_allowed(l.issued_by);
 if l.audience='published' then perform pg_advisory_xact_lock_shared(hashtextextended('game-moderation:'||(l.safe_context->>'gameId'),0));end if;
 exception when others then return jsonb_build_object('error',jsonb_build_object('code','invalid_ticket'));end;
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

create or replace function public.distribution_maintenance_health() returns jsonb
language sql security definer set search_path='' set statement_timeout='5s' as $$
select jsonb_build_object(
 'notifications_pending',(select count(*) from (select 1 from public.game_submission_notifications where sent_at is null limit 1001) x),
 'notifications_attention',(select count(*) from (select 1 from public.game_submission_notifications where sent_at is null and last_error='attention_required' limit 1001) x),
 'notifications_oldest_seconds',coalesce((select greatest(0,extract(epoch from now()-min(created_at)))::bigint from public.game_submission_notifications where sent_at is null),0),
 'accounts_pending',(select count(*) from (select 1 from public.game_account_deletions where state not in('cancelled','completed') limit 1001) x),
 'accounts_attention',(select count(*) from (select 1 from public.game_account_deletions where attention_required and state not in('cancelled','completed') limit 1001) x),
 'accounts_review',(select count(*) from (select 1 from public.game_account_deletions where state='review_required' limit 1001) x),
 'expired_uploads',(select count(*) from (select 1 from public.game_build_uploads where (status in('created','uploading','finalizing') and expires_at<=now()) or (status='validating' and lease_until<=now()) limit 1001) x),
 'expired_contacts',(select count(*) from (select 1 from public.contact_dispatches where expires_at<=now() limit 1001) x)) || jsonb_build_object(
 'moderation_pending',(select count(*) from (select id from public.moderation_mail where state='pending' union all select id from public.moderation_measure_mail where state='pending' limit 1001) x),
 'moderation_attention',(select count(*) from (select id from public.moderation_mail where state='attention_required' union all select id from public.moderation_measure_mail where state='attention_required' limit 1001) x),
 'moderation_oldest_seconds',coalesce(greatest(0,extract(epoch from clock_timestamp()-least(
  (select created_at from public.moderation_mail where state='pending' order by created_at limit 1),
  (select created_at from public.moderation_measure_mail where state='pending' order by created_at limit 1))))::bigint,0));
$$;

create index moderation_mail_age on public.moderation_mail(created_at) where state='pending';
create index moderation_measure_mail_age on public.moderation_measure_mail(created_at) where state='pending';
create index moderation_mail_attention on public.moderation_mail(state) where state='attention_required';
create index moderation_measure_mail_attention on public.moderation_measure_mail(state) where state='attention_required';
notify pgrst,'reload schema';
commit;
