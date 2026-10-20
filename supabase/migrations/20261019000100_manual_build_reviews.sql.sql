begin;
set local lock_timeout='5s';

-- Human decisions belong to the upload, never to its immutable artifact payload.
create table public.game_build_reviews (
  upload_id uuid primary key references public.game_build_uploads(id),
  submission_id uuid references public.game_submissions(id) on delete set null,
  checklist jsonb not null default '{}',
  reviewed_at timestamptz,
  decision text not null default 'pending' check(decision in ('pending','reviewed','rejected','published','archived')),
  reason text check(length(reason)<=2000),
  updated_at timestamptz not null default now()
);
create table public.game_build_review_events (
  id bigint generated always as identity primary key,
  upload_id uuid not null references public.game_build_uploads(id),
  actor uuid references auth.users(id) on delete set null,
  action text not null,
  created_at timestamptz not null default now()
);
create index game_build_review_events_upload on public.game_build_review_events(upload_id,id);
create index game_build_uploads_review_order on public.game_build_uploads(created_at desc,id);
alter table public.game_build_reviews enable row level security;
alter table public.game_build_review_events enable row level security;
revoke all on public.game_build_reviews,public.game_build_review_events from public,anon,authenticated;
grant select,insert,update on public.game_build_reviews to service_role;
grant select,insert on public.game_build_review_events to service_role;
grant usage,select on sequence public.game_build_review_events_id_seq to service_role;

-- Explicit projection: no staging keys, leases, checkpoint, credentials or Auth IDs.
create function public.distribution_review_snapshot(p_id uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',u.id,'gameId',u.game_id,'game',g.title,
 'developer',coalesce(p.username,to_jsonb(g)->>'developer_name',''),'description',to_jsonb(g)->>'description',
 'version',u.version,'createdAt',u.created_at,'updatedAt',u.updated_at,'archiveSize',u.expected_size,
 'technicalStatus',u.status,'errorCode',case when u.error_code in
 ('validation_failed','validation_timeout','storage_error','database_error','service_unavailable','version_conflict','forbidden','upload_expired','review_rejected') then u.error_code when u.error_code is not null then 'validation_failed' end,
 'attempts',u.attempts,'gameVersionId',v.id,'versionStatus',v.status,'manifest',v.manifest,
 'validatedAt',v.validated_at,'publishedAt',v.published_at,'active',g.active_version_id=v.id,
 'review',jsonb_build_object('decision',coalesce(r.decision,'pending'),'checklist',coalesce(r.checklist,'{}'),
 'reviewedAt',r.reviewed_at,'reason',r.reason,'submissionId',r.submission_id),
 'submission',case when s.id is not null then jsonb_build_object('id',s.id,'title',s.game_title,'developer',s.name_or_studio,'description',s.description,'status',s.status) end,
 'history',coalesce((select jsonb_agg(jsonb_build_object('action',e.action,'at',e.created_at) order by e.id)
 from public.game_build_review_events e where e.upload_id=u.id),'[]'))
 from public.game_build_uploads u join public.games g on g.id=u.game_id
 left join public.profiles p on p.id=u.created_by
 left join public.game_versions v on v.id=u.version_id and v.game_id=u.game_id and v.version=u.version and u.status='completed'
 left join public.game_build_reviews r on r.upload_id=u.id
 left join public.game_submissions s on s.id=r.submission_id where u.id=p_id
$$;

create function public.distribution_admin_builds(p_actor uuid,p_id uuid default null,p_offset integer default 0) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare result jsonb;
begin
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

create function public.distribution_review_action(p_actor uuid,p_id uuid,p_action text,p_checklist jsonb default '{}',p_reason text default null,p_submission uuid default null) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; v public.game_versions; r public.game_build_reviews; game uuid;
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden'; end if;
 select game_id into game from public.game_build_uploads where id=p_id;
 if not found then raise exception 'upload_not_found'; end if;
 -- Serialize active-pointer changes across different versions of the same game.
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
   -- A repeated publication must not roll back a newer active version.
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

-- Service-only local command: recover only this upload's expired lease, no global dispatch.
create function public.distribution_review_job(p_id uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads;
begin
 select * into u from public.game_build_uploads where id=p_id for update;
 if not found then raise exception 'upload_not_found'; end if;
 if exists(select 1 from public.game_build_reviews where upload_id=p_id and decision in ('rejected','archived')) then raise exception 'invalid_state'; end if;
 if u.status='validating' and u.lease_until<now() then
   update public.game_build_uploads set status=case when attempts<(policy->>'maxAttempts')::integer then 'queued' else 'failed' end,
     lease_token=null,lease_until=null,error_code='validation_timeout',updated_at=now() where id=p_id returning * into u;
 end if;
 return jsonb_build_object('status',u.status,'gameVersionId',case when u.status='completed' then u.version_id end);
end $$;

create function public.distribution_developer_review(p_actor uuid,p_id uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; result jsonb;
begin
 u:=public.distribution_get_upload(p_actor,p_id);
 result:=public.distribution_review_snapshot(p_id);
 return jsonb_build_object('technicalStatus',u.status,'versionStatus',result->'versionStatus',
   'decision',result->'review'->'decision','reason',result->'review'->'reason');
end $$;

revoke all on function public.distribution_review_snapshot(uuid),public.distribution_admin_builds(uuid,uuid,integer),
 public.distribution_review_action(uuid,uuid,text,jsonb,text,uuid),public.distribution_review_job(uuid),public.distribution_developer_review(uuid,uuid) from public,anon,authenticated;
grant execute on function public.distribution_review_snapshot(uuid),public.distribution_admin_builds(uuid,uuid,integer),
 public.distribution_review_action(uuid,uuid,text,jsonb,text,uuid),public.distribution_review_job(uuid),public.distribution_developer_review(uuid,uuid) to service_role;
commit;
