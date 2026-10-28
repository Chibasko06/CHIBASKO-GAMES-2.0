begin;
set local lock_timeout='5s';
lock table public.profiles in share row exclusive mode;

create function public.valid_public_username(p_username text) returns boolean
language sql immutable strict set search_path='' as $$
 select p_username ~ '^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$'
 and p_username not in ('admin','administrator','administrateur','moderator','moderateur','support','system','api','login','register','deleted','chibasko','chibaskogames','chibasko-games');
$$;
revoke all on function public.valid_public_username(text) from public;
grant execute on function public.valid_public_username(text) to anon,authenticated,service_role;

-- Les pseudos incompatibles et collisions doivent être arbitrés avant migration.
do $$ begin
 if exists(select 1 from public.profiles where not public.valid_public_username(lower(btrim(username))) or username is null)
 then raise exception 'public_username_preflight_invalid';end if;
 if exists(select 1 from public.profiles group by lower(btrim(username)) having count(*)>1)
 then raise exception 'public_username_preflight_collision';end if;
end $$;
update public.profiles set username=lower(btrim(username)) where username<>lower(btrim(username));
alter table public.profiles add constraint profiles_public_username_check
 check(public.valid_public_username(username));

-- L’empreinte réserve les anciens identifiants sans conserver leur propriétaire après suppression.
create table public.profile_username_reservations (
 username_hash bytea primary key check(octet_length(username_hash)=32),
 profile_id uuid references public.profiles(id) on delete set null deferrable initially deferred
);
create index profile_username_reservations_owner_idx on public.profile_username_reservations(profile_id) where profile_id is not null;
alter table public.profile_username_reservations enable row level security;
revoke all on public.profile_username_reservations from public,anon,authenticated,service_role;
insert into public.profile_username_reservations(username_hash,profile_id)
 select sha256(convert_to(username,'UTF8')),id from public.profiles;

create function public.reserve_profile_username() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 new.username:=lower(btrim(new.username));
 if not coalesce(public.valid_public_username(new.username),false) then
  raise exception 'invalid_public_username' using errcode='23514',constraint='profiles_public_username_check';
 end if;
 insert into public.profile_username_reservations as reservation(username_hash,profile_id)
 values(sha256(convert_to(new.username,'UTF8')),new.id)
 on conflict(username_hash) do update set profile_id=excluded.profile_id
 where reservation.profile_id=excluded.profile_id;
 if not found then raise exception 'public_username_unavailable' using errcode='23505',constraint='profile_username_reservations_pkey';end if;
 return new;
end $$;
revoke all on function public.reserve_profile_username() from public,anon,authenticated,service_role;
create trigger profiles_reserve_username before insert or update of username on public.profiles
 for each row execute function public.reserve_profile_username();

create or replace function public.normalize_profile_username(raw_value text) returns text
language plpgsql set search_path='' as $$
declare value text;
begin
 value:=left(trim(both '-' from regexp_replace(lower(coalesce(raw_value,'')),'[^a-z0-9_-]+','-','g')),32);
 value:=regexp_replace(value,'(^[-_]+|[-_]+$)','','g');
 if length(value)<3 then value:='joueur'||case when value<>'' then '-'||value else '' end;end if;
 if not public.valid_public_username(value) then value:='joueur-'||left(value,25);end if;
 return value;
end $$;
revoke all on function public.normalize_profile_username(text) from public;
grant execute on function public.normalize_profile_username(text) to service_role;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
declare base text; candidate text; attempt integer;
begin
 base:=public.normalize_profile_username(coalesce(new.raw_user_meta_data->>'user_name',new.raw_user_meta_data->>'username',split_part(coalesce(new.email,''),'@',1)));
 for attempt in 0..8 loop
  candidate:=case when attempt=0 then base else left(base,15)||'-'||left(encode(sha256(convert_to(new.id::text||':'||attempt::text,'UTF8')),'hex'),16) end;
  begin
   insert into public.profiles(id,username,display_name,avatar_url,bio)
   values(new.id,candidate,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),nullif(new.raw_user_meta_data->>'full_name',''),candidate),null,
    coalesce(nullif(btrim(new.raw_user_meta_data->>'bio'),''),nullif(btrim(new.raw_user_meta_data->>'onboarding_bio'),'')));
   return new;
  exception when unique_violation then null;
  end;
 end loop;
 raise exception 'public_username_allocation_failed';
end $$;
revoke all on function public.handle_new_user() from public,anon,authenticated,service_role;

create function public.public_profile_resolve(p_identifier text) returns jsonb
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
  from public.profiles p where p.id=target);
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
  from public.profiles p where (p_id is null or p.id=p_id)
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
commit;
