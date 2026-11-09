begin;
set local lock_timeout='5s';
lock table public.faq_entries in access exclusive mode;

-- Les ex aequo historiques gardent le même tri déterministe que l’affichage public.
with ranked as(select id,row_number() over(order by sort_order,created_at,id)::integer position from public.faq_entries)
update public.faq_entries f set sort_order=r.position from ranked r where r.id=f.id;
alter table public.faq_entries alter column sort_order drop default;
alter table public.faq_entries add constraint faq_order_positive check(sort_order>=1),
 add constraint faq_order_unique unique(sort_order) deferrable initially deferred;

create function public.admin_mutate_faq(p_actor uuid,p_action text,p_id uuid,p_input jsonb default '{}',p_expected jsonb default null,p_order uuid[] default null) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' set statement_timeout='15s' as $$
declare current public.faq_entries;ids uuid[];n integer;position integer;existing boolean;
begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden' using errcode='42501';end if;
 if p_action is null or p_action not in('create','save','move','delete') or p_id is null or jsonb_typeof(p_input) is distinct from 'object' then raise exception 'invalid_faq' using errcode='22023';end if;
 -- Sérialise aussi les insertions/suppressions, pas seulement les lignes déjà présentes.
 lock table public.faq_entries in share row exclusive mode;
 select coalesce(array_agg(id order by sort_order,created_at,id),'{}') into ids from public.faq_entries;n:=cardinality(ids);
 select * into current from public.faq_entries where id=p_id;existing:=found;
 if p_action in('create','save') then
  if (p_input-array['question','answer','is_published','sort_order'])<>'{}' or jsonb_typeof(p_input->'question') is distinct from 'string'
   or jsonb_typeof(p_input->'answer') is distinct from 'string' or length(btrim(p_input->>'question'))=0 or length(btrim(p_input->>'answer'))=0
   or jsonb_typeof(p_input->'is_published') is distinct from 'boolean' then raise exception 'invalid_faq' using errcode='22023';end if;
 end if;
 if p_action='create' and existing then
  if current.question=p_input->>'question' and current.answer=p_input->>'answer' and current.is_published=(p_input->>'is_published')::boolean then
   return jsonb_build_object('faqEntry',to_jsonb(current),'faqEntries',(select coalesce(jsonb_agg(to_jsonb(f) order by f.sort_order),'[]') from public.faq_entries f));
  end if;
  raise exception 'faq_conflict' using errcode='40001';
 end if;
 if p_action<>'create' then
  if not existing then raise exception 'faq_not_found' using errcode='P0002';end if;
  if p_expected is null or p_expected<>jsonb_build_object('question',current.question,'answer',current.answer,'is_published',current.is_published,'sort_order',current.sort_order) then raise exception 'faq_conflict' using errcode='40001';end if;
 end if;
 if p_order is not null and p_order is distinct from ids then raise exception 'faq_conflict' using errcode='40001';end if;
 if p_action='move' and (p_order is null or (p_input-array['sort_order'])<>'{}') then raise exception 'invalid_faq' using errcode='22023';end if;
 if p_action<>'delete' then
  if p_input ? 'sort_order' then
   if jsonb_typeof(p_input->'sort_order') is distinct from 'number' or (p_input->>'sort_order') !~ '^[1-9][0-9]{0,8}$' then raise exception 'invalid_faq' using errcode='22023';end if;
   position:=(p_input->>'sort_order')::integer;
  else position:=case when p_action='create' then n+1 else current.sort_order end;end if;
  if position<1 or position>n+(case when p_action='create' then 1 else 0 end) then raise exception 'invalid_faq_position' using errcode='22023';end if;
 end if;
 if p_action='create' then
  insert into public.faq_entries(id,question,answer,is_published,sort_order) values(p_id,p_input->>'question',p_input->>'answer',(p_input->>'is_published')::boolean,n+1);
 elsif p_action='delete' then delete from public.faq_entries where id=p_id;
 elsif p_action='save' then update public.faq_entries set question=p_input->>'question',answer=p_input->>'answer',is_published=(p_input->>'is_published')::boolean where id=p_id;
 end if;
 ids:=array_remove(ids,p_id);
 if p_action<>'delete' then ids:=coalesce(ids[1:position-1],'{}')||array[p_id]||coalesce(ids[position:cardinality(ids)],'{}');end if;
 update public.faq_entries f set sort_order=o.position from unnest(ids) with ordinality o(id,position) where f.id=o.id;
 set constraints public.faq_order_unique immediate;
 set constraints public.faq_order_unique deferred;
 return jsonb_build_object('faqEntry',(select to_jsonb(f) from public.faq_entries f where f.id=p_id),'faqEntries',(select coalesce(jsonb_agg(to_jsonb(f) order by f.sort_order),'[]') from public.faq_entries f),'success',true);
end $$;
revoke all on function public.admin_mutate_faq(uuid,text,uuid,jsonb,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.admin_mutate_faq(uuid,text,uuid,jsonb,jsonb,uuid[]) to service_role;
notify pgrst,'reload schema';
commit;
