begin;
set local lock_timeout='5s';

create index game_developer_members_profile_idx on public.game_developer_members(user_id,game_id);

-- Projection de présentation : aucun rôle ne peut être écrit par cet accès public.
create function public.public_profiles_page(p_search text default '',p_page integer default 1,p_role text default 'all',p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_search is null or length(p_search)>80 or p_page is null or p_page<1 or p_page>100000
  or p_role is null or p_role not in ('all','developer','admin') then raise exception 'invalid_request'; end if;
 with members as (
  select p.id,p.username,p.avatar_url,p.bio,p.created_at,
   exists(select 1 from public.admin_users a where a.user_id=p.id) as is_admin,
   exists(select 1 from public.game_developer_members d where d.user_id=p.id and d.role in ('owner','editor')) as is_developer
  from public.profiles p where (p_id is null or p.id=p_id)
   and strpos(lower(p.username),lower(btrim(p_search)))>0
 ), matches as (
  select * from members where p_role='all' or (p_role='admin' and is_admin) or (p_role='developer' and is_developer)
 ), page as (
  select id,username,avatar_url,bio,created_at,jsonb_build_object('admin',is_admin,'developer',is_developer) as roles
  from matches order by lower(username),id limit 24 offset ((p_page-1)*24)
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by lower(x.username),x.id) from page x),'[]'::jsonb),
  'total',(select count(*) from matches)) into result;
 return result;
end $$;
revoke all on function public.public_profiles_page(text,integer,text,uuid) from public;
grant execute on function public.public_profiles_page(text,integer,text,uuid) to anon,authenticated,service_role;
commit;
