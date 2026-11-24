begin;
set local lock_timeout='5s';

-- Les anciens motifs n'étaient pas journalisés ; ils restent indéterminés.
alter table public.game_build_review_events add column reason text check(length(reason)<=2000);
create function public.distribution_capture_review_reason() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if new.action in ('correction_requested','review','reject','archive','publish') then
  select reason into new.reason from public.game_build_reviews where upload_id=new.upload_id;
 end if;
 return new;
end $$;
do $$ declare definition text; begin
 select pg_get_functiondef('public.distribution_admin_external_reviews(uuid,integer)'::regprocedure) into definition;
 definition:=replace(definition,'distribution_admin_external_reviews(p_actor uuid, p_offset integer DEFAULT 0)','distribution_admin_external_review_detail(p_actor uuid, p_revision uuid)');
 definition:=replace(definition,'if p_offset is null or p_offset not between 0 and 100000 then','if p_revision is null then');
 definition:=replace(definition,'order by r.submitted_at desc,r.id desc limit 50 offset p_offset','where r.id=p_revision order by r.submitted_at desc,r.id desc');
 if position('distribution_admin_external_review_detail' in definition)=0 then raise exception 'unknown_external_contract'; end if;
 execute definition;
end $$;
revoke all on function public.distribution_admin_external_review_detail(uuid,uuid) from public,anon,authenticated;
grant execute on function public.distribution_admin_external_review_detail(uuid,uuid) to service_role;
revoke all on function public.distribution_capture_review_reason() from public,anon,authenticated;
create trigger capture_review_reason before insert on public.game_build_review_events
for each row execute function public.distribution_capture_review_reason();

create function public.distribution_developer_workspace(p_actor uuid,p_game uuid default null,p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 perform public.account_assert_allowed(p_actor);
 if p_actor is null then raise exception 'unauthorized'; end if;
 if p_offset is null or p_offset not between 0 and 100000 then raise exception 'invalid_request'; end if;
 if p_game is not null and not public.distribution_can_upload(p_actor,p_game) then raise exception 'forbidden'; end if;
 select jsonb_build_object('games',coalesce(jsonb_agg(to_jsonb(x) order by x.title,x.id),'[]'::jsonb)) into result from (
  select g.id,g.title,g.is_published as "isPublished",g.active_version_id as "activeVersionId",g.external_revision_id as "externalRevisionId",
   coalesce(g.views_count,0) as "recordedViews",
   (select count(*) from public.favorites f where f.game_id=g.id) as favorites,
   (select count(*) from public.game_reviews r where r.game_id=g.id) as reviews,
   (select count(*) from public.game_build_uploads u where u.game_id=g.id) as "buildCount",
   (select count(*) from public.game_external_revisions r where r.game_id=g.id) as "revisionCount",
   coalesce((select r.decision='pending' and r.reason is not null from public.game_build_uploads u left join public.game_build_reviews r on r.upload_id=u.id where u.game_id=g.id order by u.created_at desc,u.id limit 1),false)
    or coalesce((select e.action='correction' from (select id from public.game_external_revisions where game_id=g.id order by submitted_at desc,id desc limit 1) r left join lateral(select action from public.game_external_review_events where revision_id=r.id order by id desc limit 1)e on true),false) as "correctionRequired",
   (select case when exists(select 1 from public.game_submissions s where s.build_upload_id=d.upload_id) or exists(select 1 from public.game_external_revisions r where r.game_id=g.id) then 'submitted' when d.upload_id is null then 'draft' else 'in_progress' end from public.game_submission_drafts d where d.game_id=g.id) as "draftState"
  from public.games g where public.distribution_can_upload(p_actor,g.id) and (p_game is null or g.id=p_game)
  order by g.title,g.id limit 50 offset (case when p_game is null then p_offset else 0 end)
 ) x;
 if p_game is null then return result; end if;
 return result || jsonb_build_object(
  'builds',coalesce((select jsonb_agg(to_jsonb(x) order by x."createdAt" desc,x.id) from (
   select u.id,u.version,u.version_id as "versionId",u.created_at as "createdAt",u.status as "technicalStatus",coalesce(r.decision,'pending') as decision,r.reason,
    s.id as "submissionId",v.status as "versionStatus",
    coalesce((select jsonb_agg(jsonb_build_object('action',e.action,'reason',e.reason,'at',e.created_at) order by e.id desc)
     from (select * from public.game_build_review_events where upload_id=u.id and action in ('review','publish','reject','archive','correction_requested','corrected_build_prepared') order by id desc limit 50) e),'[]'::jsonb) as history
   from public.game_build_uploads u left join public.game_build_reviews r on r.upload_id=u.id
   left join public.game_submissions s on s.build_upload_id=u.id left join public.game_versions v on v.id=u.version_id
   where u.game_id=p_game order by u.created_at desc,u.id limit 100 offset p_offset
  ) x),'[]'::jsonb),
  'external',coalesce((select jsonb_agg(to_jsonb(x) order by x."createdAt" desc,x.id) from (
   select r.id,r.submitted_url as url,r.submitted_at as "createdAt",s.status,
    (select e.action from public.game_external_review_events e where e.revision_id=r.id order by e.id desc limit 1) as action,
    coalesce((select jsonb_agg(jsonb_build_object('action',e.action,'reason',e.reason,'at',e.created_at) order by e.id desc)
     from (select * from public.game_external_review_events where revision_id=r.id order by id desc limit 50) e),'[]'::jsonb) as history
   from public.game_external_revisions r join public.game_submissions s on s.id=r.submission_id
   where r.game_id=p_game order by r.submitted_at desc,r.id limit 100 offset p_offset
  ) x),'[]'::jsonb));
end $$;
revoke all on function public.distribution_developer_workspace(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.distribution_developer_workspace(uuid,uuid,integer) to service_role;

-- Une seule définition alimente le compteur et la liste paginée.
create function public.distribution_review_queue_items(p_kind text)
returns table(id uuid,title text,hosting text,version text,status text,created_at timestamptz)
language sql stable security invoker set search_path=pg_catalog,public as $$
 select u.id,s.game_title,'r2',u.version,u.status,u.created_at
 from public.game_build_uploads u join public.game_submissions s on s.build_upload_id=u.id
 left join public.game_build_reviews r on r.upload_id=u.id
 where (p_kind='validation' and u.status in ('queued','validating')) or
  (p_kind='review' and u.status in ('completed','failed','expired') and coalesce(r.decision,'pending') in ('pending','reviewed') and (r.decision='reviewed' or r.reason is null))
 union all
 select r.id,s.game_title,'external',r.id::text,s.status,r.submitted_at
 from public.game_external_revisions r join public.game_submissions s on s.id=r.submission_id
 left join lateral(select e.action from public.game_external_review_events e where e.revision_id=r.id order by e.id desc limit 1) last on true
 where p_kind='review' and s.status in ('pending','reviewing','accepted') and coalesce(last.action,'pending') in ('pending','approve')
 and not exists(select 1 from public.game_external_revisions n where n.game_id=r.game_id and (n.submitted_at,n.id)>(r.submitted_at,r.id));
$$;
create function public.distribution_admin_review_queue(p_actor uuid,p_kind text,p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
begin
 perform public.account_assert_allowed(p_actor);
 if p_actor is null or not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden'; end if;
 if p_kind is null or p_kind not in ('review','validation') or p_offset is null or p_offset not between 0 and 100000 then raise exception 'invalid_request'; end if;
 return jsonb_build_object('total',(select count(*) from public.distribution_review_queue_items(p_kind)),
  'items',coalesce((select jsonb_agg(to_jsonb(x) order by created_at,id) from (select * from public.distribution_review_queue_items(p_kind) order by created_at,id limit 50 offset p_offset)x),'[]'::jsonb));
end $$;
revoke all on function public.distribution_review_queue_items(text),public.distribution_admin_review_queue(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.distribution_review_queue_items(text),public.distribution_admin_review_queue(uuid,text,integer) to service_role;
do $$ declare definition text; begin
 select pg_get_functiondef('public.admin_console_overview(uuid)'::regprocedure) into definition;
 definition:=regexp_replace(definition,'''buildsAwaitingReview'',\(select count\(\*\).*?\),\s*''buildsAwaitingValidation'',\(select count\(\*\).*?\),',
  '''buildsAwaitingReview'',(select count(*) from public.distribution_review_queue_items(''review'')),''buildsAwaitingValidation'',(select count(*) from public.distribution_review_queue_items(''validation'')),','s');
 if position('distribution_review_queue_items' in definition)=0 then raise exception 'unknown_overview_contract'; end if;
 execute definition;
end $$;
commit;
