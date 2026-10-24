begin;
do $$
declare first_id uuid:=gen_random_uuid(); second_id uuid:=gen_random_uuid(); item jsonb; old_lease uuid; role_name text;
begin
 item:=public.contact_reserve(first_id,repeat('a',64),repeat('b',64),repeat('c',64));
 if item->>'state'<>'send' then raise exception 'Réservation initiale refusée'; end if;
 old_lease:=(item->>'lease')::uuid;
 if public.contact_reserve(second_id,repeat('a',64),repeat('b',64),repeat('c',64))->>'state'<>'waiting' then raise exception 'Deux envois concurrents'; end if;
 if public.contact_reserve(first_id,repeat('d',64),repeat('b',64),repeat('c',64))->>'state'<>'conflict' then raise exception 'Clé réutilisée pour un autre contenu'; end if;
 if not public.contact_finish(first_id,old_lease,false) then raise exception 'État ambigu non sauvegardé'; end if;
 update public.contact_dispatches set next_attempt_at=now()-interval '1 second' where id=first_id;
 item:=public.contact_reserve(second_id,repeat('a',64),repeat('b',64),repeat('c',64));
 if item->>'id'<>first_id::text then raise exception 'Clé fournisseur perdue à la reprise'; end if;
 if public.contact_finish(first_id,old_lease,true) then raise exception 'Ancien lease accepté'; end if;
 if not public.contact_finish(first_id,(item->>'lease')::uuid,true) then raise exception 'Confirmation refusée'; end if;
 if public.contact_reserve(second_id,repeat('a',64),repeat('b',64),repeat('c',64))->>'state'<>'accepted' then raise exception 'Accusé confirmé perdu'; end if;
 for i in 1..4 loop
  item:=public.contact_reserve(gen_random_uuid(),lpad(i::text,64,'0'),repeat('b',64),lpad((i+10)::text,64,'0'));
  if item->>'state'<>'send' then raise exception 'Quota initial incohérent'; end if;
 end loop;
 if public.contact_reserve(gen_random_uuid(),repeat('e',64),repeat('b',64),repeat('f',64))->>'state'<>'rate_limited' then raise exception 'Quota client absent'; end if;
 for i in 1..3 loop
  perform public.contact_reserve(gen_random_uuid(),lpad((i+20)::text,64,'0'),lpad((i+30)::text,64,'0'),repeat('f',64));
 end loop;
 if public.contact_reserve(gen_random_uuid(),repeat('9',64),repeat('8',64),repeat('f',64))->>'state'<>'rate_limited' then raise exception 'Quota e-mail absent'; end if;
 update public.contact_dispatches set created_at=now()-interval '21 hours 1 minute',next_attempt_at=now()-interval '1 second' where state='pending';
 if public.contact_reserve(gen_random_uuid(),lpad('1',64,'0'),repeat('b',64),lpad('11',64,'0'))->>'state'<>'unconfirmed' then raise exception 'Reprise hors fenêtre fournisseur'; end if;
 second_id:=gen_random_uuid();
 item:=public.contact_reserve(second_id,repeat('7',64),repeat('6',64),repeat('5',64));
 for i in 1..4 loop
  perform public.contact_finish(second_id,(item->>'lease')::uuid,false);
  update public.contact_dispatches set next_attempt_at=now()-interval '1 second' where id=second_id;
  item:=public.contact_reserve(second_id,repeat('7',64),repeat('6',64),repeat('5',64));
  if item->>'state'<>'send' then raise exception 'Reprise autorisée perdue'; end if;
 end loop;
 perform public.contact_finish(second_id,(item->>'lease')::uuid,false);
 update public.contact_dispatches set next_attempt_at=now()-interval '1 second' where id=second_id;
 if public.contact_reserve(second_id,repeat('7',64),repeat('6',64),repeat('5',64))->>'state'<>'unconfirmed' then raise exception 'Budget de tentatives dépassé'; end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,'public.contact_dispatches','SELECT') or has_table_privilege(role_name,'public.contact_dispatches','INSERT') then raise exception 'Accès direct aux reçus'; end if;
 end loop;
 foreach role_name in array array['anon','authenticated'] loop
  if has_function_privilege(role_name,'public.contact_reserve(uuid,text,text,text)','EXECUTE') or has_function_privilege(role_name,'public.contact_cleanup()','EXECUTE') then raise exception 'RPC publique privilégiée'; end if;
 end loop;
 if not (select relrowsecurity from pg_class where oid='public.contact_dispatches'::regclass) then raise exception 'RLS absente'; end if;
 if exists(select 1 from pg_proc where proname like 'contact_%' and (not prosecdef or not coalesce('search_path=""'=any(proconfig),false))) then raise exception 'Fonction contact non durcie'; end if;
 update public.contact_dispatches set expires_at=now()-interval '1 second';
 perform public.contact_cleanup();
 if exists(select 1 from public.contact_dispatches) then raise exception 'Reçus expirés conservés'; end if;
end $$;
rollback;
