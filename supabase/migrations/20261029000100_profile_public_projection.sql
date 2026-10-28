begin;
set local lock_timeout='5s';

-- La table personnelle reste distincte de la projection publique, y compris
-- lorsque les lectures passent par une fonction SECURITY DEFINER.
-- Le propriétaire de la vue autorise uniquement cette projection ; les futures
-- restrictions de visibilité devront être portées ici et conservées par les RPC.
create view public.public_profiles with (security_barrier=true, security_invoker=false) as
 select id,username,avatar_url,bio,created_at from public.profiles;
revoke all on public.public_profiles from public,anon,authenticated,service_role;
grant select on public.public_profiles to anon,authenticated,service_role;

create or replace function public.public_profile_resolve(p_identifier text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare target uuid; normalized text;
begin
 if p_identifier is null or length(p_identifier)>64 then return null;end if;
 if p_identifier ~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then target:=p_identifier::uuid;
 else
  normalized:=lower(case when left(p_identifier,1)='@' then substr(p_identifier,2) else p_identifier end);
  if not public.valid_public_username(normalized) then return null;end if;
  select profile_id into target from public.profile_username_reservations where username_hash=sha256(convert_to(normalized,'UTF8'));
 end if;
 return (select jsonb_build_object('id',p.id,'username',p.username,'avatar_url',p.avatar_url,'bio',p.bio,'created_at',p.created_at,
  'roles',jsonb_build_object('admin',exists(select 1 from public.admin_users a where a.user_id=p.id),
   'developer',exists(select 1 from public.game_developer_members d where d.user_id=p.id and d.role in ('owner','editor'))))
  from public.public_profiles p where p.id=target);
end $$;
revoke all on function public.public_profile_resolve(text) from public;
grant execute on function public.public_profile_resolve(text) to anon,authenticated,service_role;
create or replace function public.public_profiles_page(p_search text default '',p_page integer default 1,p_role text default 'all',p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_search is null or length(p_search)>80 or p_page is null or p_page<1 or p_page>100000
  or p_role is null or p_role not in ('all','developer','admin') then raise exception 'invalid_request'; end if;
 with members as (
  select p.id,p.username,p.avatar_url,p.bio,p.created_at,
   exists(select 1 from public.admin_users a where a.user_id=p.id) as is_admin,
   exists(select 1 from public.game_developer_members d where d.user_id=p.id and d.role in ('owner','editor')) as is_developer
  from public.public_profiles p where (p_id is null or p.id=p_id)
   and strpos(lower(p.username),lower(regexp_replace(btrim(p_search),'^@','')))>0
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

create or replace function public.get_game_reviews(p_game_id uuid)
returns table (
  id uuid,
  user_id uuid,
  username text,
  avatar_url text,
  rating integer,
  comment text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    reviews.id,
    reviews.user_id,
    profiles.username,
    profiles.avatar_url,
    reviews.rating,
    reviews.comment,
    reviews.created_at,
    reviews.updated_at
  from public.game_reviews as reviews
  join public.public_profiles as profiles on profiles.id = reviews.user_id
  where reviews.game_id = p_game_id
  order by reviews.updated_at desc, reviews.created_at desc;
$$;

revoke all on function public.get_game_reviews(uuid) from public;
grant execute on function public.get_game_reviews(uuid) to anon,authenticated,service_role;

commit;
