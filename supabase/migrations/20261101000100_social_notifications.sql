begin;
set local lock_timeout='5s';

create table public.social_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient uuid not null references public.profiles(id) on delete cascade,
 sender uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('friend_request','friend_accepted','game_shared')),
 event_id uuid not null, relation_id uuid,
 game_id uuid references public.games(id) on delete set null,
 created_at timestamptz not null default clock_timestamp(),read_at timestamptz,
 expires_at timestamptz not null default (clock_timestamp()+interval '30 days'),
 check(recipient<>sender),unique(sender,kind,event_id)
);
create index social_notifications_page on public.social_notifications(recipient,created_at desc,id desc);
create index social_notifications_unread on public.social_notifications(recipient,created_at desc,id desc) where read_at is null;
create index social_notifications_expiry on public.social_notifications(expires_at,id);
create index social_notifications_sender on public.social_notifications(sender);
create index social_notifications_game on public.social_notifications(game_id);
create table public.social_share_limits (
 actor uuid primary key references public.profiles(id) on delete cascade,
 day_at date not null,hits integer not null check(hits between 1 and 20)
);
create table public.social_share_cooldowns (
 actor uuid not null references public.profiles(id) on delete cascade,
 target uuid not null references public.profiles(id) on delete cascade,
 game_id uuid not null references public.games(id) on delete cascade,
 sent_at timestamptz not null, primary key(actor,target,game_id)
);
create index social_share_cooldowns_target on public.social_share_cooldowns(target);
create index social_share_cooldowns_game on public.social_share_cooldowns(game_id);
create index social_share_cooldowns_expiry on public.social_share_cooldowns(sent_at);
alter table public.social_operations add column game_id uuid references public.games(id) on delete set null;
create index social_operations_game on public.social_operations(game_id);
do $$ declare name text;begin
 foreach name in array array['social_notifications','social_share_limits','social_share_cooldowns'] loop
  execute format('alter table public.%I enable row level security',name);
  execute format('revoke all on public.%I from public,anon,authenticated',name);
  execute format('grant select,insert,update,delete on public.%I to service_role',name);
 end loop;
end $$;

-- La référence historique ne suit pas une nouvelle relation entre les mêmes comptes.
create function public.social_notification_current(p_relation uuid,p_sender uuid,p_recipient uuid,p_kind text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.social_relationships r where r.id=p_relation
  and r.user_low=least(p_sender,p_recipient) and r.user_high=greatest(p_sender,p_recipient)
  and ((p_kind='friend_request' and r.state='pending' and r.requester=p_sender)
    or (p_kind in ('friend_accepted','game_shared') and r.state='accepted')))
$$;
revoke all on function public.social_notification_current(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;

create function public.social_notification_insert(p_recipient uuid,p_sender uuid,p_kind text,p_event uuid,p_relation uuid,p_game uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('social-notifications:'||p_recipient::text,0));
 insert into public.social_notifications(recipient,sender,kind,event_id,relation_id,game_id)
 values(p_recipient,p_sender,p_kind,p_event,p_relation,p_game) on conflict do nothing;
 delete from public.social_notifications where id in (select id from public.social_notifications
  where recipient=p_recipient order by created_at desc,id desc offset 200);
end $$;
revoke all on function public.social_notification_insert(uuid,uuid,text,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.social_notify_relationship() returns trigger
language plpgsql security definer set search_path='' as $$
declare peer uuid;
begin
 peer:=case when new.requester=new.user_low then new.user_high else new.user_low end;
 if tg_op='INSERT' and new.state='pending' then
  perform public.social_notification_insert(peer,new.requester,'friend_request',new.id,new.id);
 elsif tg_op='UPDATE' and old.state='pending' and new.state='accepted' then
  perform public.social_notification_insert(new.requester,peer,'friend_accepted',new.id,new.id);
 end if;
 return new;
end $$;
revoke all on function public.social_notify_relationship() from public,anon,authenticated,service_role;
create trigger social_notify_relationship after insert or update of state on public.social_relationships for each row execute function public.social_notify_relationship();

create function public.social_notify_block() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 delete from public.social_notifications where (sender=new.blocker and recipient=new.blocked) or (sender=new.blocked and recipient=new.blocker);
 return new;
end $$;
revoke all on function public.social_notify_block() from public,anon,authenticated,service_role;
create trigger social_notify_block after insert on public.social_blocks for each row execute function public.social_notify_block();

create function public.social_notifications_count() returns integer
language plpgsql stable security definer set search_path='' set statement_timeout='10s' as $$
declare v_actor uuid:=auth.uid();result integer;
begin
 if v_actor is null then raise exception 'social_unauthorized';end if;
 if not public.social_account_active(v_actor) then raise exception 'social_inactive';end if;
 select count(*) into result from (select n.id from public.social_notifications n where n.recipient=v_actor
  and n.read_at is null and n.expires_at>now() and public.social_profile_visible(n.sender)
  and public.social_account_active(n.sender) and public.social_notification_current(n.relation_id,n.sender,v_actor,n.kind) limit 10) q;
 return result;
end $$;
revoke all on function public.social_notifications_count() from public,anon,service_role;
grant execute on function public.social_notifications_count() to authenticated;

create function public.social_navigation() returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='10s' as $$
declare v_actor uuid:=auth.uid();count_unread integer;
begin
 count_unread:=public.social_notifications_count();
 return jsonb_build_object('avatarUrl',(select avatar_url from public.profiles where id=v_actor),
  'isAdmin',exists(select 1 from public.admin_users where user_id=v_actor),'unreadCount',count_unread);
end $$;
revoke all on function public.social_navigation() from public,anon,service_role;
grant execute on function public.social_navigation() to authenticated;

create function public.social_notifications_page(p_kind text default 'all',p_before timestamptz default null,p_cursor uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='10s' as $$
declare v_actor uuid:=auth.uid();result jsonb;count_unread integer;
begin
 count_unread:=public.social_notifications_count();
 if p_kind is null or p_kind not in ('all','shares') or (p_before is null)<>(p_cursor is null) then raise exception 'social_invalid';end if;
 with eligible as materialized (
  select n.*,public.social_notification_current(n.relation_id,n.sender,v_actor,n.kind) as current_event
  from public.social_notifications n where n.recipient=v_actor and n.expires_at>now()
  and public.social_profile_visible(n.sender) and public.social_account_active(n.sender)
 ), batch as (
  select * from eligible where (p_kind='all' or kind='game_shared')
   and (p_before is null or (created_at,id)<(p_before,p_cursor)) order by created_at desc,id desc limit 21
 ), page as (select * from batch order by created_at desc,id desc limit 20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
   'id',n.id,'createdAt',n.created_at,'kind',n.kind,'read',n.read_at is not null or not n.current_event,
   'actionable',n.current_event and n.kind='friend_request','relationId',n.relation_id,
   'sender',jsonb_build_object('id',p.id,'username',p.username),
   'game',case when g.id is not null and n.current_event then jsonb_build_object('slug',g.slug,'title',g.title) else null end
  ) order by n.created_at desc,n.id desc) from page n join public.public_profiles p on p.id=n.sender
  left join public.games g on g.id=n.game_id and g.is_published),'[]'::jsonb),
  'nextCursor',case when (select count(*) from batch)>20 then (select jsonb_build_object('createdAt',created_at,'id',id) from page order by created_at,id limit 1) else null end,
  'unreadCount',count_unread,
  'readIds',coalesce((select jsonb_agg(id) from eligible where read_at is null and current_event),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.social_notifications_page(text,timestamptz,uuid) from public,anon,service_role;
grant execute on function public.social_notifications_page(text,timestamptz,uuid) to authenticated;

-- Le marquage groupé porte sur l'instantané reçu, jamais sur les arrivées concurrentes.
create function public.social_notifications_read(p_ids uuid[]) returns integer
language plpgsql security definer set search_path='' set lock_timeout='5s' set statement_timeout='10s' as $$
begin
 perform public.social_notifications_count();
 if p_ids is null or cardinality(p_ids)>200 or array_position(p_ids,null) is not null then raise exception 'social_invalid';end if;
 update public.social_notifications set read_at=clock_timestamp() where recipient=auth.uid() and id=any(p_ids) and read_at is null;
 return public.social_notifications_count();
end $$;
revoke all on function public.social_notifications_read(uuid[]) from public,anon,service_role;
grant execute on function public.social_notifications_read(uuid[]) to authenticated;

create function public.social_share_friends(p_search text default '',p_before timestamptz default null,p_cursor uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='10s' as $$
declare v_actor uuid:=auth.uid();result jsonb;
begin
 perform public.social_notifications_count();
 if p_search is null or length(p_search)>32 or (p_before is null)<>(p_cursor is null) then raise exception 'social_invalid';end if;
 with batch as (
  select r.id,r.created_at,p.id as peer,p.username,p.avatar_url from public.social_relationships r
  join public.public_profiles p on p.id=case when r.user_low=v_actor then r.user_high else r.user_low end
  where (r.user_low=v_actor or r.user_high=v_actor) and r.state='accepted' and public.social_account_active(p.id)
   and starts_with(lower(p.username),lower(ltrim(p_search,'@')))
   and (p_before is null or (r.created_at,r.id)<(p_before,p_cursor)) order by r.created_at desc,r.id desc limit 21
 ), page as (select * from batch order by created_at desc,id desc limit 20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'createdAt',created_at,
  'profile',jsonb_build_object('id',peer,'username',username,'avatar_url',avatar_url)) order by created_at desc,id desc) from page),'[]'::jsonb),
  'nextCursor',case when (select count(*) from batch)>20 then (select jsonb_build_object('createdAt',created_at,'id',id) from page order by created_at,id limit 1) else null end) into result;
 return result;
end $$;
revoke all on function public.social_share_friends(text,timestamptz,uuid) from public,anon,service_role;
grant execute on function public.social_share_friends(text,timestamptz,uuid) to authenticated;

create function public.social_share_game(p_target uuid,p_game uuid,p_operation uuid) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' set statement_timeout='10s' as $$
declare v_actor uuid:=auth.uid();lo uuid;hi uuid;relation uuid;previous public.social_operations;period date:=(now() at time zone 'UTC')::date;
begin
 if v_actor is null then raise exception 'social_unauthorized';end if;
 if p_target is null or p_game is null or p_operation is null or v_actor=p_target then raise exception 'social_invalid';end if;
 lo:=least(v_actor,p_target);hi:=greatest(v_actor,p_target);
 perform 1 from auth.users where id in (lo,hi) order by id for key share;
 perform pg_advisory_xact_lock(hashtextextended('social-v_actor:'||v_actor::text,0));
 perform pg_advisory_xact_lock(hashtextextended('social-pair:'||lo::text||':'||hi::text,0));
 if not public.social_account_active(v_actor) then raise exception 'social_inactive';end if;
 if not public.social_account_active(p_target) or not public.social_profile_visible(p_target) then raise exception 'social_unavailable';end if;
 select id into relation from public.social_relationships where user_low=lo and user_high=hi and state='accepted';
 if relation is null then raise exception 'social_unavailable';end if;
 perform 1 from public.games where id=p_game and is_published for share;
 if not found then raise exception 'social_unavailable';end if;
 select * into previous from public.social_operations where social_operations.actor=v_actor and operation_id=p_operation;
 if found then
  if previous.action<>'share' or previous.target<>p_target or previous.game_id is distinct from p_game then raise exception 'social_conflict';end if;
  return jsonb_build_object('sent',true,'replayed',true);
 end if;
 if exists(select 1 from public.social_share_cooldowns where social_share_cooldowns.actor=v_actor and target=p_target and game_id=p_game and sent_at>now()-interval '24 hours')
  or exists(select 1 from public.social_share_limits where social_share_limits.actor=v_actor and day_at=period and hits>=20) then raise exception 'social_rate_limited';end if;
 insert into public.social_share_limits values(v_actor,period,1) on conflict on constraint social_share_limits_pkey do update
  set day_at=excluded.day_at,hits=case when social_share_limits.day_at=excluded.day_at then social_share_limits.hits+1 else 1 end;
 insert into public.social_share_cooldowns values(v_actor,p_target,p_game,clock_timestamp()) on conflict on constraint social_share_cooldowns_pkey do update set sent_at=excluded.sent_at;
 perform public.social_notification_insert(p_target,v_actor,'game_shared',p_operation,relation,p_game);
 delete from public.social_operations where social_operations.actor=v_actor and (created_at<now()-interval '24 hours'
  or operation_id in (select operation_id from public.social_operations where social_operations.actor=v_actor order by created_at desc,operation_id offset 127));
 insert into public.social_operations(actor,operation_id,target,action,game_id) values(v_actor,p_operation,p_target,'share',p_game);
 return jsonb_build_object('sent',true,'replayed',false);
end $$;
revoke all on function public.social_share_game(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.social_share_game(uuid,uuid,uuid) to authenticated;

create function public.distribution_cleanup_social_notifications() returns integer
language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare total integer;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('social-notifications-cleanup',0)) then return 0;end if;
 with expired as (select id from public.social_notifications where expires_at<=now() order by expires_at,id limit 500 for update skip locked)
 delete from public.social_notifications where id in (select id from expired);
 get diagnostics total=row_count;
 delete from public.social_share_cooldowns where (actor,target,game_id) in (select actor,target,game_id from public.social_share_cooldowns where sent_at<=now()-interval '24 hours' order by sent_at limit 500);
 delete from public.social_share_limits where actor in (select actor from public.social_share_limits where day_at<(now() at time zone 'UTC')::date order by day_at limit 500);
 return total;
end $$;
revoke all on function public.distribution_cleanup_social_notifications() from public,anon,authenticated;
grant execute on function public.distribution_cleanup_social_notifications() to service_role;
notify pgrst,'reload schema';
commit;
