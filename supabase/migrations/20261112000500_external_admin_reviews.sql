begin;
create function public.distribution_admin_external_reviews(p_actor uuid,p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
begin
  perform public.account_assert_allowed(p_actor);
  if p_actor is null or not exists(select 1 from public.admin_users where user_id=p_actor)
    then raise exception 'forbidden'; end if;
  if p_offset is null or p_offset not between 0 and 100000 then raise exception 'invalid_request'; end if;

  return coalesce((select jsonb_agg(to_jsonb(x) order by x."createdAt" desc,x.id desc) from (
    select r.id,r.submitted_url as url,r.submitted_origin as origin,r.submitted_at as "createdAt",
      s.game_title as title,s.name_or_studio as developer,s.status,
      g.external_revision_id is not distinct from r.id as current,
      g.is_published and g.external_revision_id is not distinct from r.id as published,
      not exists(select 1 from public.game_external_revisions newer
        where newer.game_id=r.game_id and (newer.submitted_at,newer.id)>(r.submitted_at,r.id)) as latest,
      coalesce(history.events,'[]'::jsonb) as history
    from public.game_external_revisions r
    join public.games g on g.id=r.game_id
    join public.game_submissions s on s.id=r.submission_id
    left join lateral (
      select jsonb_agg(jsonb_build_object('action',e.action,'reason',e.reason,
        'origin',e.reviewed_origin,'at',e.created_at,'actor',e.actor_id) order by e.id desc) as events
      from (select * from public.game_external_review_events where revision_id=r.id order by id desc limit 50) e
    ) history on true
    order by r.submitted_at desc,r.id desc limit 50 offset p_offset
  ) x),'[]'::jsonb);
end;
$$;
revoke all on function public.distribution_admin_external_reviews(uuid,integer) from public,anon,authenticated;
grant execute on function public.distribution_admin_external_reviews(uuid,integer) to service_role;
commit;
