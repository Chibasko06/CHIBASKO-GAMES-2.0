begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table public.game_public_deliveries (
 launch_id uuid primary key references public.game_launch_sessions(id) on delete cascade,
 game_id uuid not null references public.games(id) on delete restrict,
 version_id uuid not null references public.game_versions(id) on delete restrict,
 ticket_hash text not null unique check(ticket_hash ~ '^[a-f0-9]{64}$'),
 cookie_hash text unique check(cookie_hash ~ '^[a-f0-9]{64}$'),
 ticket_expires_at timestamptz not null,
 exchanged_at timestamptz,
 check ((cookie_hash is null)=(exchanged_at is null))
);
create index game_public_deliveries_active_version_idx on public.game_public_deliveries(game_id,version_id) where exchanged_at is not null;
alter table public.game_public_deliveries enable row level security;
revoke all on public.game_public_deliveries from public,anon,authenticated;
grant select,insert,update on public.game_public_deliveries to service_role;

create function public.distribution_issue_public_delivery(p_launch uuid,p_control_hash text,p_ticket_hash text) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.game_launch_sessions; g uuid;
begin
 if p_ticket_hash is null or p_ticket_hash!~'^[a-f0-9]{64}$' then raise exception 'invalid_request';end if;
 select * into s from public.game_launch_sessions where id=p_launch and control_hash=p_control_hash for update;
 if not found or s.audience<>'published' then raise exception 'forbidden';end if;
 perform public.distribution_check_launch(s.capability_hash);
 select game_id into strict g from public.game_versions where id=s.version_id;
 if exists(select 1 from public.game_public_deliveries where launch_id=p_launch) then raise exception 'invalid_state';end if;
 insert into public.game_public_deliveries(launch_id,game_id,version_id,ticket_hash,ticket_expires_at)
 values(p_launch,g,s.version_id,p_ticket_hash,least(s.expires_at,clock_timestamp()+interval '60 seconds'));
 -- Le ticket ne doit pas rester utilisable comme ancienne capacité de sous-domaine.
 update public.game_launch_sessions set capability_hash=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','') where id=p_launch;
end $$;

create function public.distribution_check_public_delivery(p_game uuid,p_cookie_hash text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d public.game_public_deliveries;s public.game_launch_sessions;
begin
 if p_cookie_hash is null then raise exception 'launch_expired';end if;
 select * into d from public.game_public_deliveries where game_id=p_game and cookie_hash=p_cookie_hash and exchanged_at is not null;
 if not found then raise exception 'launch_expired';end if;
 select * into strict s from public.game_launch_sessions where id=d.launch_id;
 return public.distribution_check_launch(s.capability_hash);
end $$;

create function public.distribution_exchange_public_delivery(p_game uuid,p_ticket_hash text,p_cookie_hash text,p_previous_hash text default null) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d public.game_public_deliveries;s public.game_launch_sessions;previous jsonb;result jsonb;
begin
 if p_cookie_hash is null or p_cookie_hash!~'^[a-f0-9]{64}$' then raise exception 'invalid_request';end if;
 -- Les chemins d'une origine stable ne peuvent pas désigner deux versions à la fois.
 -- Le verrou du jeu sérialise aussi les premiers échanges sans cookie précédent.
 perform pg_advisory_xact_lock_shared(hashtextextended('game-moderation:'||p_game::text,0));
 perform 1 from public.games where id=p_game for update;
 select * into d from public.game_public_deliveries where game_id=p_game and ticket_hash=p_ticket_hash for update;
 if not found or d.ticket_expires_at<=clock_timestamp() then raise exception 'launch_expired';end if;
 if d.exchanged_at is not null then raise exception 'ticket_replayed';end if;
 select * into strict s from public.game_launch_sessions where id=d.launch_id;
 result:=public.distribution_check_launch(s.capability_hash);
 if exists(select 1 from public.game_public_deliveries other
 join public.game_launch_sessions active on active.id=other.launch_id
 where other.game_id=p_game and other.version_id<>d.version_id and other.exchanged_at is not null
 and active.revoked_at is null and active.expires_at>clock_timestamp()) then raise exception 'delivery_version_conflict';end if;
 if p_previous_hash is not null then
  begin previous:=public.distribution_check_public_delivery(p_game,p_previous_hash);exception when raise_exception then if sqlerrm in ('launch_expired','version_not_found','preview_forbidden','version_not_previewable','account_restricted','account_deletion_pending') then previous:=null;else raise;end if;end;
  -- Une origine ne sert pas simultanément deux versions derrière les mêmes chemins.
  if previous is not null and previous->>'version_id'<>d.version_id::text then raise exception 'delivery_version_conflict';end if;
 end if;
 update public.game_public_deliveries set cookie_hash=p_cookie_hash,exchanged_at=clock_timestamp() where launch_id=d.launch_id;
 return result;
end $$;
do $$declare f record;begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in
 ('distribution_issue_public_delivery','distribution_check_public_delivery','distribution_exchange_public_delivery') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
