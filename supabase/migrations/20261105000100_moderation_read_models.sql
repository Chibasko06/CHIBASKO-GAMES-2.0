begin;
set local lock_timeout='5s';

create index moderation_measures_global_history on public.moderation_measures(created_at desc,id desc);
create index moderation_appeals_history on public.moderation_appeals(state,created_at desc,id desc);

create function public.moderation_measure_summary(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',m.id,'subject',m.subject,'action',m.action,'reason',left(m.reason,180),
  'created_at',m.created_at,'ends_at',m.ends_at,'archived_at',m.archived_at,'version',m.version,
  'actor_name',p.username,'actor_reference',m.actor_reference,'kind',s.kind,'target',coalesce(s.user_id,s.game_id),
  'name',coalesce(t.username,g.title),'current_version',s.version,
  'blocked',coalesce((s.user_id is not null and (s.measure='ban' or (s.measure='suspend' and s.ends_at>statement_timestamp()))) or (s.game_id is not null and s.measure='unpublish'),false),
  'protected',exists(select 1 from public.admin_users where user_id=s.user_id),
  'state',case when m.action='warn' then 'warning' when m.action in ('lift','restore') then 'recorded'
   when m.action='suspend' and m.ends_at<=coalesce(n.created_at,statement_timestamp()) then 'expired'
   when n.action in ('lift','restore') then 'lifted' when n.id is not null then 'replaced'
   when coalesce(s.user_id,s.game_id) is null then 'unavailable'
   when s.measure=m.action then 'active' else 'closed' end,
  'next',case when n.id is not null then jsonb_build_object('id',n.id,'action',n.action,'created_at',n.created_at) end)
 from public.moderation_measures m join public.moderation_subjects s on s.id=m.subject
 left join public.profiles p on p.id=m.actor left join public.profiles t on t.id=s.user_id left join public.games g on g.id=s.game_id
 left join lateral(select x.id,x.action,x.created_at from public.moderation_measures x
  where x.subject=m.subject and x.version>m.version and x.action<>'warn' order by x.version limit 1) n on true
 where m.id=p_id
$$;
revoke all on function public.moderation_measure_summary(uuid) from public,anon,authenticated,service_role;

create function public.distribution_moderation_browse(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare view_name text:=p_input->>'view';requested uuid:=(p_input->>'id')::uuid;
 v_kind text:=coalesce(p_input->>'kind','');v_action text:=coalesce(p_input->>'action','');v_status text:=coalesce(p_input->>'state','');
 q text:=lower(ltrim(btrim(coalesce(p_input->>'search','')),'@'));
 before_at timestamptz:=(p_input->>'before')::timestamptz;cursor_id uuid:=(p_input->>'cursor')::uuid;result jsonb;
begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden';end if;
 if view_name is null or view_name not in ('measures','appeals','deliveries') or v_kind not in ('','player','game') or length(q)>100
  or v_action not in ('','warn','suspend','ban','lift','unpublish','restore') or (before_at is null)<>(cursor_id is null)
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('view','id','kind','action','state','search','before','cursor')) then raise exception 'invalid_request';end if;
 if view_name='deliveries' then
  if requested is null or not exists(select 1 from public.moderation_measures where id=requested) then raise exception 'invalid_request';end if;
  with batch as(select d.id,d.kind,d.state,d.attempts,d.created_at,d.recipient,p.username as recipient_name
   from public.moderation_measure_mail d left join public.profiles p on p.id=d.recipient
   where d.measure_id=requested and (before_at is null or (d.created_at,d.id)<(before_at,cursor_id)) order by d.created_at desc,d.id desc limit 21)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc) from (select * from batch order by created_at desc,id desc limit 20) x),'[]'::jsonb),'hasMore',(select count(*) from batch)>20) into result;
 elsif view_name='measures' then
  if v_status not in ('','active','expired','lifted','warning','replaced','recorded','unavailable','closed') then raise exception 'invalid_request';end if;
  if requested is not null then
   select public.moderation_measure_summary(m.id)||jsonb_build_object('reason',m.reason,'note',m.note,'case_id',m.case_id,
    'case_number',(select number from public.moderation_cases where id=m.case_id),
    'appeal',(select jsonb_build_object('id',a.id,'state',a.state,'created_at',a.created_at,'reviewed_at',a.reviewed_at) from public.moderation_appeals a where a.measure=m.id))
   into result from public.moderation_measures m where m.id=requested;
  else
   with batch as(select m.created_at,m.id,public.moderation_measure_summary(m.id) as item
    from public.moderation_measures m join public.moderation_subjects s on s.id=m.subject
    left join public.profiles p on p.id=s.user_id left join public.games g on g.id=s.game_id
    where (v_kind='' or s.kind=v_kind) and (v_action='' or m.action=v_action)
     and (q='' or starts_with(lower(coalesce(p.username,g.title,'')),q))
     and (before_at is null or (m.created_at,m.id)<(before_at,cursor_id))
     and (v_status='' or public.moderation_measure_summary(m.id)->>'state'=v_status)
    order by m.created_at desc,m.id desc limit 21)
   select jsonb_build_object('items',coalesce((select jsonb_agg(item order by created_at desc,id desc) from (select * from batch order by created_at desc,id desc limit 20) x),'[]'::jsonb),'hasMore',(select count(*) from batch)>20) into result;
  end if;
 else
  if v_status not in ('','pending','accepted','rejected') or v_action<>'' then raise exception 'invalid_request';end if;
  if requested is not null then
   select jsonb_build_object('id',a.id,'version',a.version,'state',a.state,'description',a.description,'decision',a.decision,
    'created_at',a.created_at,'reviewed_at',a.reviewed_at,'archived_at',a.archived_at,'username',p.username,
    'author',a.author,'reviewer_name',r.username,'reviewer_reference',a.reviewer_reference,'measure',public.moderation_measure_summary(a.measure))
   into result from public.moderation_appeals a left join public.profiles p on p.id=a.author left join public.profiles r on r.id=a.reviewer where a.id=requested;
  else
   with batch as(select a.id,a.state,a.created_at,a.reviewed_at,p.username,left(a.description,180) as description,
    public.moderation_measure_summary(m.id) as measure
    from public.moderation_appeals a join public.moderation_measures m on m.id=a.measure join public.moderation_subjects s on s.id=m.subject
    left join public.profiles p on p.id=a.author left join public.profiles t on t.id=s.user_id left join public.games g on g.id=s.game_id
    where (v_status='' or a.state=v_status) and (v_kind='' or s.kind=v_kind)
     and (q='' or starts_with(lower(coalesce(p.username,'')),q) or starts_with(lower(coalesce(t.username,g.title,'')),q))
     and (before_at is null or (a.created_at,a.id)<(before_at,cursor_id)) order by a.created_at desc,a.id desc limit 21)
   select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc) from (select * from batch order by created_at desc,id desc limit 20) x),'[]'::jsonb),'hasMore',(select count(*) from batch)>20) into result;
  end if;
 end if;
 return result;
end $$;
revoke all on function public.distribution_moderation_browse(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.distribution_moderation_browse(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
