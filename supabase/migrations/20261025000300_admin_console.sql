begin;
set local lock_timeout='5s';

create function public.admin_console_users(p_actor uuid,p_search text default '',p_role text default 'all',p_offset integer default 0,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden' using errcode='42501';end if;
 if p_search is null or length(p_search)>80 or p_role is null or p_role not in ('all','admin','developer')
  or p_offset is null or p_offset<0 or p_offset>2100000 or p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid_page' using errcode='22023';end if;
 with members as (
  select p.id,p.username,p.display_name,p.avatar_url,p.bio,p.created_at,u.email,
   exists(select 1 from public.admin_users a where a.user_id=p.id) as is_admin,
   exists(select 1 from public.game_developer_members m where m.user_id=p.id and m.role in ('owner','editor')) as is_developer
  from public.profiles p left join auth.users u on u.id=p.id
  where strpos(lower(p.username),lower(btrim(p_search)))>0
 ), filtered as (
  select * from members where p_role='all' or (p_role='admin' and is_admin) or (p_role='developer' and is_developer)
 ), page as (
  select id,username,display_name,avatar_url,bio,created_at,email,jsonb_build_object('admin',is_admin,'developer',is_developer) as roles
  from filtered order by created_at desc,id offset p_offset limit p_limit
 ) select jsonb_build_object('users',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id) from page),'[]'::jsonb),
 'total',(select count(*) from filtered)) into result;
 return result;
end $$;

create function public.admin_console_overview(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden' using errcode='42501';end if;
 return jsonb_build_object(
  'games',(select count(*) from public.games),
  'publishedGames',(select count(*) from public.games where is_published),
  'users',(select count(*) from public.profiles),
  'buildsAwaitingReview',(select count(*) from public.game_build_uploads u join public.game_versions v on v.id=u.version_id where u.status='completed' and v.status in ('draft','in_review','approved') and exists(select 1 from public.game_submissions s where s.build_upload_id=u.id)),
  'buildsAwaitingValidation',(select count(*) from public.game_build_uploads where status in ('queued','validating')),
  'deletionsAwaitingReview',(select count(*) from public.game_account_deletions where state='review_required'),
  'deletionsBlocked',(select count(*) from public.game_account_deletions where attention_required and state not in ('completed','cancelled')),
  'notificationsBlocked',(select count(*) from public.game_submission_notifications where sent_at is null and last_error='attention_required')
 );
end $$;
create function public.admin_console_deletions(p_actor uuid,p_state text default 'all',p_offset integer default 0,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden' using errcode='42501';end if;
 if p_state is null or p_state not in ('all','review_required','pending','prepared','cleanup_pending','attention')
  or p_offset is null or p_offset<0 or p_offset>2100000 or p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid_page' using errcode='22023';end if;
 with filtered as (
  select * from public.game_account_deletions where state not in ('completed','cancelled')
  and (p_state='all' or state=p_state or (p_state='attention' and attention_required))
 ), page as (
  select * from filtered order by attention_required desc,(state='review_required') desc,created_at,id offset p_offset limit p_limit
 ) select jsonb_build_object('deletions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'state',state,'createdAt',created_at,'attentionRequired',attention_required,'reason',last_error)
 order by attention_required desc,(state='review_required') desc,created_at,id) from page),'[]'::jsonb),'total',(select count(*) from filtered)) into result;
 return result;
end $$;
revoke all on function public.admin_console_users(uuid,text,text,integer,integer),public.admin_console_overview(uuid),public.admin_console_deletions(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.admin_console_users(uuid,text,text,integer,integer),public.admin_console_overview(uuid),public.admin_console_deletions(uuid,text,integer,integer) to service_role;
commit;
