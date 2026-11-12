begin;
create function public.distribution_submit_external(p_actor uuid,p_game uuid,p_revision uuid,p_url text,p_origin text,p_cover text default null)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.games; d public.game_submission_drafts; previous public.game_external_revisions;
  contact public.developer_contacts; m jsonb; sid uuid; action text; categories uuid[];
begin
  perform public.account_assert_allowed(p_actor);
  select * into g from public.games where id=p_game for update;
  if not found or not exists(select 1 from public.game_developer_members
    where game_id=p_game and user_id=p_actor and role='owner') then raise exception 'draft_not_found'; end if;
  if p_revision is null or p_origin is null or p_url is null or length(p_url)>2048
    or p_origin !~ '^https://[a-z0-9.-]+$' or left(p_url,length(p_origin)+1)<>p_origin||'/'
    then raise exception 'invalid_request'; end if;
  select * into previous from public.game_external_revisions where id=p_revision;
  if found then
    if previous.game_id=p_game and previous.developer_id=p_actor and previous.submitted_url=p_url
      and previous.submitted_origin=p_origin then return previous.submission_id; end if;
    raise exception 'request_conflict';
  end if;
  perform public.distribution_api_limit(p_actor,120);
  select * into contact from public.developer_contacts where user_id=p_actor;
  if not found then raise exception 'developer_profile_required'; end if;
  select * into previous from public.game_external_revisions where game_id=p_game
    order by submitted_at desc,id desc limit 1;
  if previous.id is not null then
    select e.action into action from public.game_external_review_events e
      where e.revision_id=previous.id order by e.id desc limit 1;
    if action is null or action not in ('correction','reject','publish','suspend','withdraw')
      then raise exception 'invalid_state'; end if;
  end if;

  if g.external_revision_id is null then
    d:=public.distribution_owned_draft(p_actor,p_game);
    if g.active_version_id is not null or exists(select 1 from public.game_build_uploads
      where game_id=p_game and status not in ('failed','expired')) then raise exception 'invalid_state'; end if;
    m:=d.metadata;
    if length(btrim(coalesce(m->>'title',''))) not between 1 and 160
      or length(btrim(coalesce(m->>'studio',''))) not between 1 and 160
      or length(btrim(coalesce(m->>'description',''))) not between 1 and 10000
      or length(btrim(coalesce(m->>'technology',''))) not between 1 and 120
      or coalesce(m->>'releaseDate','') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(m->>'mobile','') not in ('true','false','desktop','mobile','both')
      or jsonb_typeof(m->'categories') is distinct from 'array'
      or p_cover is null or p_cover !~ '^https://assets\.chibaskogames\.fr/game-thumbnails/[0-9a-f-]{36}\.(jpg|png|webp|gif|avif|svg)$'
      then raise exception 'invalid_request'; end if;
    select array_agg(value::uuid) into categories from jsonb_array_elements_text(m->'categories');
    if coalesce(cardinality(categories),0) not between 1 and 8
      or exists(select 1 from unnest(categories) c where not exists(select 1 from public.categories where id=c))
      then raise exception 'invalid_request'; end if;
    insert into public.game_submissions(name_or_studio,email,game_title,demo_url,game_type,description,
      short_description,long_description,ownership_confirmed,submission_kind,release_date,technology,
      cover_image_url,category_ids,mobile_compatibility)
    values(m->>'studio',contact.contact_email,m->>'title',p_url,'classic',m->>'description',
      left(m->>'description',180),m->>'description',true,'new',(m->>'releaseDate')::date,m->>'technology',
      p_cover,categories,case m->>'mobile' when 'true' then 'Oui' when 'false' then 'Non' else 'platform:'||(m->>'mobile') end)
    returning id into sid;
  else
    if p_cover is not null then raise exception 'invalid_request'; end if;
    insert into public.game_submissions(name_or_studio,email,game_title,demo_url,game_type,description,ownership_confirmed,submission_kind)
      values(contact.public_name,contact.contact_email,g.title,p_url,'classic',coalesce(g.description,''),true,'update')
      returning id into sid;
  end if;
  insert into public.game_external_revisions(id,submission_id,game_id,developer_id,submitted_url,submitted_origin,submitted_at)
    values(p_revision,sid,p_game,p_actor,p_url,p_origin,clock_timestamp());
  return sid;
end;
$$;

create function public.distribution_developer_external(p_actor uuid,p_offset integer default 0)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  perform public.account_assert_allowed(p_actor);
  if p_actor is null or p_offset not between 0 and 100000 then raise exception 'invalid_request'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x."createdAt" desc,x.id desc) from (
      select r.id,r.game_id as "gameId",s.game_title as title,r.submitted_url as url,
        r.submitted_at as "createdAt",s.status,e.action,e.reason,
        (g.external_revision_id is not null) as "updateOnly",
        not exists(select 1 from public.game_external_revisions newer where newer.game_id=r.game_id
          and (newer.submitted_at,newer.id)>(r.submitted_at,r.id)) as latest
      from public.game_external_revisions r join public.game_submissions s on s.id=r.submission_id
      join public.games g on g.id=r.game_id
      left join lateral (select action,reason from public.game_external_review_events where revision_id=r.id order by id desc limit 1) e on true
      where r.developer_id=p_actor and exists(select 1 from public.game_developer_members m
        where m.game_id=r.game_id and m.user_id=p_actor and m.role='owner')
      order by r.submitted_at desc,r.id desc limit 50 offset p_offset
    ) x
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.distribution_submit_external(uuid,uuid,uuid,text,text,text),
  public.distribution_developer_external(uuid,integer) from public,anon,authenticated;
grant execute on function public.distribution_submit_external(uuid,uuid,uuid,text,text,text),
  public.distribution_developer_external(uuid,integer) to service_role;

-- The older administrative endpoint cannot change the state of an external dossier
-- independently of the revision decision.
create function public.distribution_guard_external_dossier() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare revision uuid; latest_action text;
begin
  select id into revision from public.game_external_revisions where submission_id=old.id;
  if revision is null then return new; end if;
  if new.demo_url is distinct from old.demo_url or new.build_upload_id is not null then
    raise exception 'external_revision_immutable';
  end if;
  if new.status is distinct from old.status then
    select action into latest_action from public.game_external_review_events
      where revision_id=revision order by id desc limit 1;
    if new.status is distinct from (case latest_action
      when 'approve' then 'accepted' when 'reject' then 'rejected'
      when 'correction' then 'reviewing' when 'withdraw' then 'archived' else old.status end)
    then raise exception 'external_review_conflict'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.distribution_guard_external_dossier() from public,anon,authenticated;
create trigger distribution_guard_external_dossier
before update of demo_url,build_upload_id,status on public.game_submissions
for each row execute function public.distribution_guard_external_dossier();
commit;
