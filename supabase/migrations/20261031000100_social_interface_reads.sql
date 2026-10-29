begin;
set local lock_timeout='5s';

-- Lecture d'une seule paire, sans mutation ni parcours des listes privées.
create function public.social_relation(p_target uuid) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='10s' as $$
declare v_actor uuid:=auth.uid(); relation public.social_relationships;
begin
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
revoke all on function public.social_relation(uuid) from public,anon,service_role;
grant execute on function public.social_relation(uuid) to authenticated;

create or replace function public.social_list(p_kind text,p_before timestamptz default null,p_cursor uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='10s' as $$
declare v_actor uuid:=auth.uid(); result jsonb;
begin
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
revoke all on function public.social_list(text,timestamptz,uuid) from public,anon,service_role;
grant execute on function public.social_list(text,timestamptz,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
