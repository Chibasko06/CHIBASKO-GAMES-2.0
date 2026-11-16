\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values('25252525-2525-4525-8525-252525252525');
insert into public.admin_users(user_id) values('25252525-2525-4525-8525-252525252525');
set local role service_role;
do $$
declare actor uuid:='25252525-2525-4525-8525-252525252525'; operation uuid:=gen_random_uuid();
begin
 perform public.distribution_admin_mail_reserve(actor,operation,'contact','a@example.test','Fixture',repeat('a',64));
 begin
  perform public.distribution_admin_mail_remove(gen_random_uuid(),operation);
  raise exception 'unauthorized removal succeeded';
 exception when raise_exception then if sqlerrm<>'forbidden' then raise; end if; end;
 if not public.distribution_admin_mail_remove(actor,operation) or not public.distribution_admin_mail_remove(actor,operation)
  then raise exception 'removal must be idempotent'; end if;
 if exists(select 1 from jsonb_array_elements(public.distribution_admin_mail_history(actor,0)) row where row->>'id'=operation::text)
  then raise exception 'removed message is visible'; end if;
 if exists(select 1 from public.admin_mail_log where id=operation and (recipient is not null or subject is not null))
  then raise exception 'removed content retained'; end if;
 perform public.distribution_admin_mail_finish(actor,operation,'accepted','fixture',200);
 if public.distribution_admin_mail_reserve(actor,operation,'contact','a@example.test','Fixture',repeat('a',64))
   is distinct from '{"reserved":false,"status":"accepted"}'::jsonb then raise exception 'removed reservation replayed'; end if;
 for i in 1..4 loop
  perform public.distribution_admin_mail_reserve(actor,gen_random_uuid(),'contact','a@example.test','Fixture',repeat('a',64));
 end loop;
 begin
  perform public.distribution_admin_mail_reserve(actor,gen_random_uuid(),'contact','a@example.test','Fixture',repeat('a',64));
  raise exception 'minute quota bypassed';
 exception when raise_exception then if sqlerrm<>'rate_limited' then raise; end if; end;
 update public.admin_mail_log set created_at=clock_timestamp()-interval '2 minutes' where actor_id=actor;
 insert into public.admin_mail_log(id,actor_id,sender,fingerprint,created_at,removed_at)
 select gen_random_uuid(),actor,'contact',repeat('a',64),clock_timestamp()-interval '2 minutes',clock_timestamp()
 from generate_series(1,45);
 begin
  perform public.distribution_admin_mail_reserve(actor,gen_random_uuid(),'contact','a@example.test','Fixture',repeat('a',64));
  raise exception 'daily quota bypassed';
 exception when raise_exception then if sqlerrm<>'rate_limited' then raise; end if; end;
 if has_function_privilege('authenticated','public.distribution_admin_mail_remove(uuid,uuid)','execute')
  or has_function_privilege('anon','public.distribution_admin_mail_remove(uuid,uuid)','execute')
  then raise exception 'public removal grant'; end if;
end $$;
rollback;
