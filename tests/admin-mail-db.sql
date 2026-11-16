\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values('21212121-2121-4121-8121-212121212121');
insert into public.admin_users(user_id) values('21212121-2121-4121-8121-212121212121');
set local role service_role;
do $$
declare actor uuid:='21212121-2121-4121-8121-212121212121';
  outsider uuid:='22222222-2222-4222-8222-222222222222';
  operation uuid:=gen_random_uuid();
  fingerprint text:=repeat('a',64);
begin
  begin
    perform public.distribution_admin_mail_history(outsider,0);
    raise exception 'outsider could read history';
  exception when raise_exception then if sqlerrm<>'forbidden' then raise; end if; end;
  begin
    perform public.distribution_admin_mail_reserve(outsider,operation,'contact','a@example.test','Fixture',fingerprint);
    raise exception 'outsider reserved a message';
  exception when raise_exception then if sqlerrm<>'forbidden' then raise; end if; end;
  if public.distribution_admin_mail_reserve(actor,operation,'contact','a@example.test','Fixture',fingerprint)->>'reserved'<>'true'
    or public.distribution_admin_mail_reserve(actor,operation,'contact','a@example.test','Fixture',fingerprint)->>'reserved'<>'false'
    then raise exception 'idempotency failed'; end if;
  begin
    perform public.distribution_admin_mail_reserve(actor,operation,'contact','a@example.test','Changed',repeat('b',64));
    raise exception 'changed confirmation accepted';
  exception when raise_exception then if sqlerrm<>'idempotency_conflict' then raise; end if; end;
  perform public.distribution_admin_mail_finish(actor,operation,'accepted','provider-fixture',200);
  if public.distribution_admin_mail_history(actor,0)->0->>'status'<>'accepted'
    then raise exception 'status missing from history'; end if;
  for i in 1..4 loop
    perform public.distribution_admin_mail_reserve(actor,gen_random_uuid(),'developers','a@example.test','Fixture',fingerprint);
  end loop;
  begin
    perform public.distribution_admin_mail_reserve(actor,gen_random_uuid(),'contact','a@example.test','Fixture',fingerprint);
    raise exception 'rate limit ignored';
  exception when raise_exception then if sqlerrm<>'rate_limited' then raise; end if; end;
  if has_table_privilege('authenticated','public.admin_mail_log','select')
    or has_function_privilege('anon','public.distribution_admin_mail_history(uuid,integer)','execute')
    or has_function_privilege('authenticated','public.distribution_admin_mail_history(uuid,integer)','execute')
    then raise exception 'private history exposed'; end if;
end $$;
rollback;
