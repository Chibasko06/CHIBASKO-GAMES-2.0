begin;
set local lock_timeout = '5s';

alter table public.games add column external_revision_id uuid;
alter table public.games add constraint games_external_revision_fk
  foreign key (id, external_revision_id) references public.game_external_revisions(game_id, id);

create table public.game_external_review_events (
  id bigint generated always as identity primary key,
  revision_id uuid not null references public.game_external_revisions(id),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('approve','correction','reject','publish','suspend','withdraw')),
  reason text check (length(reason) <= 2000),
  reviewed_origin text,
  created_at timestamptz not null default now()
);
create index game_external_review_events_revision_idx
  on public.game_external_review_events(revision_id,id desc);
alter table public.game_external_review_events enable row level security;
revoke all on public.game_external_review_events from public,anon,authenticated,service_role;
grant select,insert on public.game_external_review_events to service_role;

-- Also protects catalogue writes through the existing generic admin editor.
create function public.distribution_guard_external_catalogue() returns trigger
language plpgsql security invoker set search_path = pg_catalog,public as $$
declare revision public.game_external_revisions; last_action text;
begin
  if new.external_revision_id is null then
    if tg_op = 'UPDATE' and old.external_revision_id is not null then
      raise exception 'external_revision_required';
    end if;
    return new;
  end if;
  select * into strict revision from public.game_external_revisions
    where id = new.external_revision_id and game_id = new.id;
  select action into last_action from public.game_external_review_events
    where revision_id = revision.id order by id desc limit 1;
  if new.game_url is distinct from revision.submitted_url
    or new.active_version_id is not null
    or new.game_type is distinct from 'classic'
    or new.multiplayer_game_id is not null
    or (new.is_published and last_action is distinct from 'publish') then
    raise exception 'external_catalogue_conflict';
  end if;
  return new;
end;
$$;
revoke all on function public.distribution_guard_external_catalogue() from public,anon,authenticated;
create trigger distribution_guard_external_catalogue
before insert or update of external_revision_id, game_url, active_version_id, game_type, multiplayer_game_id, is_published
on public.games for each row execute function public.distribution_guard_external_catalogue();

create function public.distribution_external_review(
  p_actor uuid, p_revision uuid, p_action text, p_reason text default null,
  p_reviewed_origin text default null, p_checked boolean default false
) returns void
language plpgsql security invoker set search_path = pg_catalog,public as $$
declare
  revision public.game_external_revisions;
  game public.games;
  dossier public.game_submissions;
  latest uuid;
  previous_action text;
begin
  perform public.account_assert_allowed(p_actor);
  if p_actor is null or not exists(select 1 from public.admin_users where user_id=p_actor) then
    raise exception 'forbidden';
  end if;
  select * into revision from public.game_external_revisions where id=p_revision;
  if not found then raise exception 'revision_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('game-moderation:' || revision.game_id::text,0));
  select * into strict game from public.games where id=revision.game_id for update;
  select * into strict dossier from public.game_submissions where id=revision.submission_id for update;
  select id into latest from public.game_external_revisions
    where game_id=game.id order by submitted_at desc,id desc limit 1;
  select action into previous_action from public.game_external_review_events
    where revision_id=revision.id order by id desc limit 1;

  if p_action in ('suspend','withdraw') then
    if game.external_revision_id is distinct from revision.id or previous_action not in ('publish','suspend')
      or previous_action is null or (p_action='suspend' and not game.is_published) then
      raise exception 'external_review_conflict';
    end if;
  else
    if latest is distinct from revision.id then raise exception 'external_review_conflict'; end if;
    case p_action
      when 'approve' then
        if previous_action is not null or dossier.status not in ('pending','reviewing')
          or p_checked is distinct from true or p_reviewed_origin is distinct from revision.submitted_origin then
          raise exception 'external_review_conflict';
        end if;
      when 'publish' then
        if previous_action is distinct from 'approve' or dossier.status <> 'accepted'
          or game.active_version_id is not null then raise exception 'external_review_conflict'; end if;
      when 'correction','reject' then
        if previous_action is not null or dossier.status not in ('pending','reviewing') then
          raise exception 'external_review_conflict';
        end if;
      else raise exception 'invalid_request';
    end case;
  end if;
  if p_action in ('correction','reject','suspend','withdraw')
    and nullif(btrim(p_reason),'') is null then raise exception 'invalid_request'; end if;

  insert into public.game_external_review_events(revision_id,actor_id,action,reason,reviewed_origin)
    values(revision.id,p_actor,p_action,nullif(btrim(p_reason),''),
      case when p_action='approve' then p_reviewed_origin end);
  if p_action='publish' then
    update public.games set external_revision_id=revision.id,game_url=revision.submitted_url,
      game_type='classic',multiplayer_game_id=null,is_published=true where id=game.id;
    if dossier.submission_kind='new' then
      if dossier.cover_image_url is null or dossier.release_date is null or dossier.technology is null
        or coalesce(cardinality(dossier.category_ids),0)=0 then raise exception 'invalid_state'; end if;
      update public.games set title=dossier.game_title,description=dossier.description,
        developer_name=dossier.name_or_studio,release_date_text=dossier.release_date::text,
        mobile_compatible=dossier.mobile_compatibility,technology=dossier.technology,
        thumbnail_url=dossier.cover_image_url,catalogue_source='developer_submission',provider_name=null
        where id=game.id;
      delete from public.game_categories where game_id=game.id;
      insert into public.game_categories(game_id,category_id)
        select game.id,unnest(dossier.category_ids);
    end if;
  elsif p_action in ('suspend','withdraw') then
    update public.games set is_published=false where id=game.id;
  end if;

  update public.game_submissions set status=case p_action
    when 'approve' then 'accepted' when 'reject' then 'rejected'
    when 'correction' then 'reviewing' when 'withdraw' then 'archived' else status end
    where id=dossier.id;
end;
$$;
revoke all on function public.distribution_external_review(uuid,uuid,text,text,text,boolean)
  from public,anon,authenticated;
grant execute on function public.distribution_external_review(uuid,uuid,text,text,text,boolean)
  to service_role;

commit;
