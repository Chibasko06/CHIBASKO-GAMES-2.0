-- Prepared only. No production application. Short renewable artifact access lease;
-- a fixed 24-hour ceiling from creation prevents indefinite launch capabilities.
begin;
set local lock_timeout='5s';
-- The previous immutable migration used an unnamed two-column lifetime CHECK.
-- Resolve that specific constraint by its column dependencies, not its auto-name.
do $$ declare constraint_name text; begin
 select c.conname into strict constraint_name from pg_constraint c
 where c.conrelid='public.game_launch_sessions'::regclass and c.contype='c'
 and c.conkey @> array[
  (select attnum from pg_attribute where attrelid=c.conrelid and attname='created_at'),
  (select attnum from pg_attribute where attrelid=c.conrelid and attname='expires_at')
 ]::smallint[];
 execute format('alter table public.game_launch_sessions drop constraint %I',constraint_name);
end $$;
alter table public.game_launch_sessions add constraint game_launch_lifetime_bounds
 check(expires_at>created_at and expires_at<=created_at+interval '24 hours');

create function public.distribution_renew_launch(p_id uuid,p_control_hash text,p_seconds integer) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.game_launch_sessions; v public.game_versions; begin
 if p_seconds not between 60 and 1800 then raise exception 'invalid_launch_request'; end if;
 select * into s from public.game_launch_sessions where id=p_id and control_hash=p_control_hash for update;
 if not found or s.revoked_at is not null or s.expires_at<=clock_timestamp()
  or s.created_at+interval '24 hours'<=clock_timestamp() then raise exception 'launch_expired'; end if;
 select * into strict v from public.game_versions where id=s.version_id;
 -- Current rights/status are checked again for preview and published alike.
 perform public.distribution_authorize_launch(s.issued_by,v.game_id,s.version_id,s.audience,s.execution);
 update public.game_launch_sessions
 set expires_at=least(clock_timestamp()+make_interval(secs=>p_seconds),s.created_at+interval '24 hours')
 where id=s.id returning * into s;
 return jsonb_build_object('id',s.id,'version_id',s.version_id,'generation',s.generation,
  'expires_at',s.expires_at,'safe_context',s.safe_context);
end $$;
revoke all on function public.distribution_renew_launch(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.distribution_renew_launch(uuid,text,integer) to service_role;
commit;
