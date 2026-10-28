begin;
set local lock_timeout='5s';

create table public.social_relationships (
 id uuid primary key default gen_random_uuid(),
 user_low uuid not null references public.profiles(id) on delete cascade,
 user_high uuid not null references public.profiles(id) on delete cascade,
 requester uuid not null references public.profiles(id) on delete cascade,
 state text not null check(state in ('pending','accepted')),
 created_at timestamptz not null default clock_timestamp(),
 check(user_low<user_high),check(requester in (user_low,user_high)),unique(user_low,user_high)
);
create index social_relationships_low_page on public.social_relationships(user_low,state,created_at desc,id desc);
create index social_relationships_high_page on public.social_relationships(user_high,state,created_at desc,id desc);
create index social_relationships_requester on public.social_relationships(requester,state);
create table public.social_blocks (
 id uuid not null default gen_random_uuid() unique,
 blocker uuid not null references public.profiles(id) on delete cascade,
 blocked uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 primary key(blocker,blocked),check(blocker<>blocked)
);
create index social_blocks_reverse on public.social_blocks(blocked,blocker);
create index social_blocks_page on public.social_blocks(blocker,created_at desc,id desc);
create table public.social_request_limits (
 actor uuid primary key references public.profiles(id) on delete cascade,
 day_at timestamptz not null,hits integer not null check(hits between 1 and 30)
);
create table public.social_request_cooldowns (
 actor uuid not null references public.profiles(id) on delete cascade,
 target uuid not null references public.profiles(id) on delete cascade,
 sent_at timestamptz not null,primary key(actor,target),check(actor<>target)
);
create index social_request_cooldowns_target on public.social_request_cooldowns(target);
create table public.social_operations (
 actor uuid not null references public.profiles(id) on delete cascade,
 operation_id uuid not null,target uuid not null references public.profiles(id) on delete cascade,
 action text not null,relation_id uuid,created_at timestamptz not null default clock_timestamp(),
 primary key(actor,operation_id)
);
create index social_operations_expiry on public.social_operations(actor,created_at desc,operation_id);
create index social_operations_target on public.social_operations(target);

do $$ declare name text;begin
 foreach name in array array['social_relationships','social_blocks','social_request_limits','social_request_cooldowns','social_operations'] loop
  execute format('alter table public.%I enable row level security',name);
  execute format('revoke all on public.%I from public,anon,authenticated',name);
  execute format('grant select,insert,update,delete on public.%I to service_role',name);
 end loop;
end $$;
-- Les listes et écritures passent exclusivement par des RPC à identité imposée.
-- Les tables n'ont aucune politique publique, même pour les participants.

create function public.social_profile_visible(p_target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is null or not exists(select 1 from public.social_blocks b
  where (b.blocker=auth.uid() and b.blocked=p_target) or (b.blocker=p_target and b.blocked=auth.uid()))
$$;
revoke all on function public.social_profile_visible(uuid) from public;
grant execute on function public.social_profile_visible(uuid) to anon,authenticated,service_role;
create or replace view public.public_profiles with (security_barrier=true,security_invoker=false) as
 select id,username,avatar_url,bio,created_at from public.profiles where public.social_profile_visible(id);
create policy social_reviews_visibility on public.game_reviews as restrictive for select to authenticated
 using(public.social_profile_visible(user_id));
create policy social_reactions_visibility on public.game_reactions as restrictive for select to authenticated
 using(public.social_profile_visible(user_id));

create function public.social_account_active(p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=p_actor
  and to_jsonb(u)->>'deleted_at' is null
  and coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity'::timestamptz)<=now())
 and not public.distribution_account_pending(p_actor)
$$;
revoke all on function public.social_account_active(uuid) from public,anon,authenticated,service_role;

create function public.social_change(p_action text,p_target uuid,p_operation uuid,p_relation uuid default null) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' set statement_timeout='10s' as $$
declare v_actor uuid:=auth.uid(); lo uuid; hi uuid; current_relation public.social_relationships;
 previous public.social_operations; replayed boolean:=false; total integer; period timestamptz;
begin
 if v_actor is null then raise exception 'social_unauthorized';end if;
 if p_target is null or v_actor=p_target or p_operation is null or p_action is null
 or p_action not in ('request','accept','reject','cancel','remove','block','unblock') then raise exception 'social_invalid';end if;
 lo:=least(v_actor,p_target);hi:=greatest(v_actor,p_target);
 -- La suppression du compte prend FOR UPDATE sur auth.users : aucune relation
 -- ne peut apparaître après son transfert et sa purge transactionnelle.
 perform id from auth.users where id in (lo,hi) order by id for key share;
 if not public.social_account_active(v_actor) then raise exception 'social_inactive';end if;
 if not exists(select 1 from public.profiles where id=p_target) then raise exception 'social_unavailable';end if;
 -- Sérialise aussi les quotas et les reçus d'un acteur visant plusieurs paires.
 perform pg_advisory_xact_lock(hashtextextended('social-v_actor:'||v_actor::text,0));
 perform pg_advisory_xact_lock(hashtextextended('social-pair:'||lo::text||':'||hi::text,0));
 select * into previous from public.social_operations where social_operations.actor=v_actor and operation_id=p_operation and created_at>=now()-interval '24 hours';
 if found then
  if previous.target<>p_target or previous.action<>p_action or previous.relation_id is distinct from p_relation then raise exception 'social_conflict';end if;
  replayed:=true;
 end if;
 if not replayed then
  select * into current_relation from public.social_relationships where user_low=lo and user_high=hi for update;
  if p_action='block' then
   insert into public.social_blocks(blocker,blocked) values(v_actor,p_target) on conflict do nothing;
   delete from public.social_relationships where user_low=lo and user_high=hi;
  elsif p_action='unblock' then
   if p_relation is null or exists(select 1 from public.social_blocks where blocker=v_actor and blocked=p_target and id<>p_relation) then raise exception 'social_conflict';end if;
   delete from public.social_blocks where blocker=v_actor and blocked=p_target and id=p_relation;
  else
   if not public.social_profile_visible(p_target) then raise exception 'social_unavailable';end if;
   if p_action in ('request','accept') and not public.social_account_active(p_target) then raise exception 'social_unavailable';end if;
   if p_action='request' then
    if current_relation.id is null then
     if exists(select 1 from public.social_request_cooldowns where social_request_cooldowns.actor=v_actor and target=p_target and sent_at>now()-interval '7 days') then raise exception 'social_rate_limited';end if;
     select count(*) into total from public.social_relationships where requester=v_actor and state='pending';
     if total>=50 then raise exception 'social_rate_limited';end if;
     period:=date_trunc('day',now(),'UTC');
     select hits into total from public.social_request_limits where social_request_limits.actor=v_actor and day_at=period;
     if coalesce(total,0)>=30 then raise exception 'social_rate_limited';end if;
     insert into public.social_request_limits values(v_actor,period,1) on conflict on constraint social_request_limits_pkey do update
      set day_at=excluded.day_at,hits=case when social_request_limits.day_at=excluded.day_at then social_request_limits.hits+1 else 1 end;
     insert into public.social_request_cooldowns values(v_actor,p_target,clock_timestamp()) on conflict on constraint social_request_cooldowns_pkey do update set sent_at=excluded.sent_at;
     insert into public.social_relationships(user_low,user_high,requester,state) values(lo,hi,v_actor,'pending');
    end if;
   else
    if current_relation.id is null or p_relation is distinct from current_relation.id then raise exception 'social_conflict';end if;
    if p_action in ('accept','reject') and (current_relation.state<>'pending' or current_relation.requester=v_actor) then raise exception 'social_conflict';end if;
    if p_action='cancel' and (current_relation.state<>'pending' or current_relation.requester<>v_actor) then raise exception 'social_conflict';end if;
    if p_action='remove' and current_relation.state<>'accepted' then raise exception 'social_conflict';end if;
    if p_action='accept' then
     update public.social_relationships set state='accepted',created_at=clock_timestamp() where id=current_relation.id;
    else delete from public.social_relationships where id=current_relation.id;end if;
   end if;
  end if;
  -- Fenêtre d'idempotence de 24 heures et au plus 128 reçus par acteur.
  -- La purge est opportuniste ; un compte inactif conserve son dernier lot borné.
  delete from public.social_operations where social_operations.actor=v_actor and (created_at<now()-interval '24 hours'
   or operation_id in (select operation_id from public.social_operations where social_operations.actor=v_actor order by created_at desc,operation_id offset 127));
  delete from public.social_request_cooldowns where social_request_cooldowns.actor=v_actor and sent_at<now()-interval '7 days';
  insert into public.social_operations(actor,operation_id,target,action,relation_id) values(v_actor,p_operation,p_target,p_action,p_relation);
 end if;
 -- Une reprise décrit l'état courant, jamais un résultat ancien contredit par un blocage.
 select * into current_relation from public.social_relationships where user_low=lo and user_high=hi;
 return jsonb_build_object('replayed',replayed,'relationId',current_relation.id,'state',
  case when not public.social_profile_visible(p_target) then 'blocked'
   when current_relation.state='accepted' then 'friends'
   when current_relation.state='pending' then case when current_relation.requester=v_actor then 'outgoing' else 'incoming' end else 'none' end);
end $$;
revoke all on function public.social_change(text,uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.social_change(text,uuid,uuid,uuid) to authenticated;

create function public.social_list(p_kind text,p_before timestamptz default null,p_cursor uuid default null) returns jsonb
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
   'profile',jsonb_build_object('id',p.peer,'username',p.username,'avatar_url',p.avatar_url)) order by p.created_at desc,p.id desc) from page p),'[]'::jsonb),
  'nextCursor',case when (select count(*) from batch)>20 then (select jsonb_build_object('createdAt',created_at,'id',id) from page order by created_at,id limit 1) else null end) into result;
 return result;
end $$;
revoke all on function public.social_list(text,timestamptz,uuid) from public,anon,service_role;
grant execute on function public.social_list(text,timestamptz,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
