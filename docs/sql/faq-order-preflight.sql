-- Lecture seule, avant puis après installation de la migration FAQ.
begin read only;
select count(*) as questions, count(distinct sort_order) as positions_distinctes,
 min(sort_order) as premiere_position, max(sort_order) as derniere_position
from public.faq_entries;
select sort_order,count(*) as questions from public.faq_entries
group by sort_order having count(*)>1 order by sort_order;
select conname,pg_get_constraintdef(oid) as definition from pg_constraint
where conrelid='public.faq_entries'::regclass and conname in('faq_order_unique','faq_order_positive');
select p.oid::regprocedure as signature,p.prosecdef as security_definer,p.proconfig,
 has_function_privilege('anon',p.oid,'execute') as anon_execute,
 has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'execute') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='admin_mutate_faq';
rollback;
