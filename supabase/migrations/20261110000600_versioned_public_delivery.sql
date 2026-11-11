begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create index game_public_deliveries_cookie_version_idx on public.game_public_deliveries(cookie_hash,game_id,version_id) where cookie_hash is not null;

-- Les chemins HTTP épinglent la version ; le cookie n'autorise que les versions
-- disposant encore d'une session de livraison valide dans son groupe.
create function public.distribution_check_versioned_public_delivery(p_game uuid,p_version uuid,p_cookie_hash text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.game_launch_sessions;
begin
 if p_cookie_hash is null or p_cookie_hash!~'^[a-f0-9]{64}$' then raise exception 'launch_expired';end if;
 select active.* into s from public.game_public_deliveries d
 join public.game_launch_sessions active on active.id=d.launch_id
 where d.game_id=p_game and d.version_id=p_version and d.cookie_hash=p_cookie_hash and d.exchanged_at is not null
 and active.revoked_at is null and active.expires_at>clock_timestamp()
 order by active.created_at desc,active.id desc limit 1;
 if not found then raise exception 'launch_expired';end if;
 return public.distribution_check_launch(s.capability_hash);
end $$;

create function public.distribution_exchange_versioned_public_delivery(p_game uuid,p_ticket_hash text,p_cookie_hash text,p_previous_hash text default null) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d public.game_public_deliveries;s public.game_launch_sessions;previous jsonb;result jsonb;chosen text;
begin
 if p_ticket_hash is null or p_ticket_hash!~'^[a-f0-9]{64}$'
 or p_cookie_hash is null or p_cookie_hash!~'^[a-f0-9]{64}$'
 or (p_previous_hash is not null and p_previous_hash!~'^[a-f0-9]{64}$') then raise exception 'invalid_request';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('game-moderation:'||p_game::text,0));
 perform 1 from public.games where id=p_game for update;
 select * into d from public.game_public_deliveries where game_id=p_game and ticket_hash=p_ticket_hash for update;
 if not found or d.ticket_expires_at<=clock_timestamp() then raise exception 'launch_expired';end if;
 if d.exchanged_at is not null then raise exception 'ticket_replayed';end if;
 select * into strict s from public.game_launch_sessions where id=d.launch_id;
 result:=public.distribution_check_launch(s.capability_hash);
 if p_previous_hash is not null then
  begin previous:=public.distribution_check_public_delivery(p_game,p_previous_hash);
  exception when raise_exception then
   if sqlerrm in ('launch_expired','version_not_found','preview_forbidden','version_not_previewable','account_restricted','account_deletion_pending') then previous:=null;else raise;end if;
  end;
 end if;
 chosen:=case when previous is not null then p_previous_hash else p_cookie_hash end;
 perform pg_advisory_xact_lock(hashtextextended('public-delivery-cookie:'||chosen,0));
 if exists(select 1 from public.game_public_deliveries where cookie_hash=chosen and game_id<>p_game) then raise exception 'invalid_request';end if;
 update public.game_public_deliveries set cookie_hash=chosen,exchanged_at=clock_timestamp() where launch_id=d.launch_id;
 return result||jsonb_build_object('delivery_cookie_reused',previous is not null);
end $$;

revoke all on function public.distribution_check_versioned_public_delivery(uuid,uuid,text),public.distribution_exchange_versioned_public_delivery(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.distribution_check_versioned_public_delivery(uuid,uuid,text),public.distribution_exchange_versioned_public_delivery(uuid,text,text,text) to service_role;
commit;
