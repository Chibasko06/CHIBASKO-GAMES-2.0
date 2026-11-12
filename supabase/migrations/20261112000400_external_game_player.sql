begin;

-- The revision and decision journal are private. Return only the launch projection.
create function public.distribution_external_preview(p_actor uuid,p_revision uuid)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare revision public.game_external_revisions;
begin
  perform public.account_assert_allowed(p_actor);
  select * into revision from public.game_external_revisions r where r.id=p_revision
    and p_actor is not null and (
      exists(select 1 from public.admin_users a where a.user_id=p_actor)
      or (r.developer_id=p_actor and exists(select 1 from public.game_developer_members m
        where m.game_id=r.game_id and m.user_id=p_actor and m.role='owner'))
    );
  if not found then raise exception 'game_not_found'; end if;
  return jsonb_build_object('kind','external','revisionId',revision.id,'url',revision.submitted_url);
end;
$$;

create function public.distribution_external_public_launch(p_game uuid)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare game public.games; revision public.game_external_revisions;
begin
  select * into game from public.games where id=p_game;
  if not found or game.is_published is distinct from true then return jsonb_build_object('kind','unavailable'); end if;
  if game.external_revision_id is null then
    if exists(select 1 from public.game_external_revisions r where r.game_id=p_game) then
      return jsonb_build_object('kind','unavailable');
    end if;
    return jsonb_build_object('kind','legacy');
  end if;
  select * into revision from public.game_external_revisions r
    where r.id=game.external_revision_id and r.game_id=p_game;
  if not found or game.game_url is distinct from revision.submitted_url
    or game.active_version_id is not null or game.game_type is distinct from 'classic'
    or game.multiplayer_game_id is not null
    or not exists(select 1 from public.game_submissions s where s.id=revision.submission_id and s.status='accepted')
    or not exists(select 1 from public.game_external_review_events e
      where e.revision_id=revision.id and e.action='approve' and e.reviewed_origin=revision.submitted_origin)
    or (select e.action from public.game_external_review_events e where e.revision_id=revision.id
      order by e.id desc limit 1) is distinct from 'publish'
  then return jsonb_build_object('kind','unavailable'); end if;
  return jsonb_build_object('kind','external','revisionId',revision.id,'url',revision.submitted_url);
end;
$$;
revoke all on function public.distribution_external_preview(uuid,uuid),
  public.distribution_external_public_launch(uuid) from public,anon,authenticated;
grant execute on function public.distribution_external_preview(uuid,uuid),
  public.distribution_external_public_launch(uuid) to service_role;
commit;
