-- Exécuter avec une connexion de lecture préalablement autorisée.
begin transaction read only;
set local statement_timeout='30s';
set local lock_timeout='5s';
select current_setting('transaction_read_only') as read_only;
select c.relname,r.role_name,a.attname,
 has_column_privilege(r.role_name,c.oid,a.attnum,'SELECT') as can_select
from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
cross join (values('anon'),('authenticated'),('service_role')) r(role_name)
where n.nspname='public' and c.relname in ('profiles','public_profiles')
order by c.relname,r.role_name,a.attnum;
select policyname,roles,cmd,permissive,qual,with_check from pg_policies
where schemaname='public' and tablename='profiles' order by policyname;
select c.relname,pg_get_userbyid(c.relowner) as owner,c.reloptions,c.relacl
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('profiles','public_profiles');
-- Détecte aussi les vues historiques susceptibles de contourner la frontière.
select distinct v.oid::regclass as dependent_view,pg_get_viewdef(v.oid,true) as definition
from pg_depend d join pg_rewrite w on w.oid=d.objid
join pg_class v on v.oid=w.ev_class
where d.refobjid=to_regclass('public.profiles') and v.relkind in ('v','m');
select p.oid::regprocedure as signature,p.prosecdef,p.proconfig,p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' and p.prosrc ilike '%profiles%'
order by p.oid::regprocedure::text;
rollback;
