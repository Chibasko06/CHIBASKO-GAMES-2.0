-- One transaction owns the cleanup pair across schedulers and API instances.
begin;
set local lock_timeout='5s';
create function public.distribution_cleanup_sessions() returns boolean
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if not pg_try_advisory_xact_lock(1667721069,1936028515) then return false; end if;
 perform public.distribution_cleanup_multiplayer();
 perform public.distribution_cleanup_online();
 return true;
end $$;
revoke all on function public.distribution_cleanup_sessions() from public,anon,authenticated;
grant execute on function public.distribution_cleanup_sessions() to service_role;
commit;
