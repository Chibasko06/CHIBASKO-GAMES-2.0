begin;
set local lock_timeout='5s';

-- Le retrait du périmètre ne doit pas retirer le contrôle permanent des faits.
do $$begin
 if to_regprocedure('public.moderation_measure_apply(uuid,jsonb)') is null
  or to_regprocedure('public.moderation_enrich_target(jsonb)') is null
  or to_regclass('public.moderation_facts') is null
  or not exists(select 1 from pg_trigger where tgrelid='public.moderation_measures'::regclass
   and tgname='moderation_measure_fact_guard' and not tgisinternal and tgenabled in ('O','A')
   and tgfoid=to_regprocedure('public.moderation_measure_fact_guard()')) then
  raise exception 'moderation_facts_required';
 end if;
end $$;

create or replace function public.distribution_moderation_measure(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' set statement_timeout='10s' as $$
declare target uuid;kind text;action text:=p_input->>'action';begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden';end if;
 perform set_config('chibasko.moderation_facts',p_input::text,true);
 if exists(select 1 from public.moderation_measures where id=(p_input->>'operationId')::uuid and actor=p_actor
  and operation_hash=encode(sha256(convert_to((p_input-'retentionDays')::text,'UTF8')),'hex')) then
  return public.moderation_enrich_target(public.moderation_measure_apply(p_actor,p_input));
 end if;
 if action is not null and action not in ('lift','restore') then
  kind:=p_input->>'kind';target:=(p_input->>'target')::uuid;
  if kind='player' then
   if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=target and to_jsonb(u)->>'deleted_at' is null) then raise exception 'account_not_found';end if;
  elsif kind='game' then
   if not exists(select 1 from public.games where id=target) then raise exception 'game_not_found';end if;
  else raise exception 'invalid_request';end if;
 end if;
 return public.moderation_enrich_target(public.moderation_measure_apply(p_actor,p_input));
end $$;
revoke all on function public.distribution_moderation_measure(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.distribution_moderation_measure(uuid,jsonb) to service_role;
revoke all on function public.moderation_measure_apply(uuid,jsonb) from public,anon,authenticated,service_role;

-- Les références textuelles PL/pgSQL ne figurent pas toutes dans pg_depend.
do $$begin
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname not in ('pg_catalog','information_schema') and p.prokind in ('f','p')
   and p.prosrc ~ '\m(moderation_measure_scope|moderation_qualification_targets)\M') then
  raise exception 'moderation_qualification_dependency';
 end if;
end $$;

-- Sans CASCADE : une dépendance inattendue annule toute la migration.
drop table public.moderation_qualification_targets;
drop table public.moderation_measure_scope;

notify pgrst,'reload schema';
commit;
