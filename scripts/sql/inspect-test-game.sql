-- Lecture seule. Exécuter dans Supabase SQL Editor avant le nettoyage.
begin transaction read only;
set local statement_timeout='30s';

select id,title,is_published,active_version_id,external_revision_id,thumbnail_url
from public.games
where id='4fa17e5b-c49b-4bbd-a7e6-73ac53d4e8de';

-- Toutes les dépendances FK, y compris indirectes et composites.
with recursive relations(oid) as (
 select 'public.games'::regclass::oid
 union
 select c.conrelid from pg_constraint c join relations r on c.confrelid=r.oid
 where c.contype='f'
)
select c.conname, c.conrelid::regclass as table_dependante,
 c.confrelid::regclass as table_referencee,pg_get_constraintdef(c.oid) as contrainte
from pg_constraint c
where c.contype='f' and c.confrelid in(select oid from relations)
order by c.confrelid::regclass::text,c.conrelid::regclass::text,c.conname;

-- Nombre de lignes effectivement reliées, calculé sans lire les coordonnées
-- des comptes ni afficher les contenus des dossiers.
do $$
declare g uuid:='4fa17e5b-c49b-4bbd-a7e6-73ac53d4e8de';
  r record; total bigint;
begin
 for r in
  select c.oid as table_oid,n.nspname,c.relname,a.attname
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  where n.nspname='public' and c.relkind in ('r','p')
    and a.attname in ('game_id','target_game')
    and a.atttypid='uuid'::regtype
  order by c.relname,a.attname
 loop
  execute format('select count(*) from %I.%I where %I=$1',r.nspname,r.relname,r.attname) into total using g;
  raise notice '% · % = %',r.relname,r.attname,total;
 end loop;
end $$;

-- Chaque chemin FK est inspecté sur les vraies lignes du jeu.
-- Une même ligne peut apparaître par plusieurs chemins : ne pas additionner
-- ces compteurs pour obtenir un total.
do $$
declare r record; total bigint;
begin
 for r in
  with recursive edges as (
   select fk.oid,fk.conrelid,fk.confrelid,fk.conname,
    string_agg(format('t%%1$s.%I=t%%2$s.%I',ca.attname,pa.attname),' and ' order by k.ord) as join_template
   from pg_constraint fk
   cross join lateral unnest(fk.conkey,fk.confkey) with ordinality k(child_att,parent_att,ord)
   join pg_attribute ca on ca.attrelid=fk.conrelid and ca.attnum=k.child_att
   join pg_attribute pa on pa.attrelid=fk.confrelid and pa.attnum=k.parent_att
   where fk.contype='f'
   group by fk.oid,fk.conrelid,fk.confrelid,fk.conname
  ), paths(rel,visited,depth,joins,route) as (
   select 'public.games'::regclass::oid,array['public.games'::regclass::oid],0,
     'public.games t0'::text,'public.games'::text
   union all
   select fk.conrelid,paths.visited||fk.conrelid,paths.depth+1,
     paths.joins||format(' join %s t%s on %s',fk.conrelid::regclass,paths.depth+1,format(fk.join_template,paths.depth+1,paths.depth)),
     paths.route||' → '||fk.conrelid::regclass::text||' ['||fk.conname||']'
   from paths join edges fk on fk.confrelid=paths.rel
   where not fk.conrelid=any(paths.visited)
  ) select * from paths where depth>0 order by depth,route
 loop
  execute format('select count(distinct (t%s.tableoid,t%s.ctid)) from %s where t0.id=$1',r.depth,r.depth,r.joins)
   into total using '4fa17e5b-c49b-4bbd-a7e6-73ac53d4e8de'::uuid;
  raise notice '% : % ligne(s)',r.route,total;
 end loop;
end $$;

-- Soumissions et notifications indirectes des ZIP ou révisions URL.
select s.id,s.status,s.build_upload_id,
 (select count(*) from public.game_submission_notifications n where n.submission_id=s.id) as notifications
from public.game_submissions s
where s.build_upload_id in (
 select id from public.game_build_uploads where game_id='4fa17e5b-c49b-4bbd-a7e6-73ac53d4e8de'
) or s.id in (
 select submission_id from public.game_external_revisions where game_id='4fa17e5b-c49b-4bbd-a7e6-73ac53d4e8de'
);

-- Métadonnées de stockage uniquement. Ne pas publier ces résultats.
select id,status,staging_key, multipart_id is not null as multipart_a_verifier
from public.game_build_uploads where game_id='4fa17e5b-c49b-4bbd-a7e6-73ac53d4e8de';
select id,version,status,published_at,storage_prefix
from public.game_versions where game_id='4fa17e5b-c49b-4bbd-a7e6-73ac53d4e8de';
select game_id,upload_id,file_info
from public.game_submission_drafts where game_id='4fa17e5b-c49b-4bbd-a7e6-73ac53d4e8de';

-- Une miniature partagée doit être conservée dans R2.
select g.thumbnail_url,
 (select count(*) from public.games other where other.id<>g.id and other.thumbnail_url=g.thumbnail_url) as autres_jeux_utilisant_la_miniature,
 (select count(*) from public.game_submissions s where s.cover_image_url=g.thumbnail_url) as soumissions_utilisant_la_miniature
from public.games g where g.id='4fa17e5b-c49b-4bbd-a7e6-73ac53d4e8de';

-- Déclencheurs à examiner, sans désactiver aucune protection.
with recursive relations(oid) as (
 select 'public.games'::regclass::oid
 union
 select c.conrelid from pg_constraint c join relations r on c.confrelid=r.oid where c.contype='f'
)
select t.tgrelid::regclass as table_concernee,t.tgname,pg_get_triggerdef(t.oid) as definition
from pg_trigger t where not t.tgisinternal and t.tgrelid in(select oid from relations)
order by t.tgrelid::regclass::text,t.tgname;
rollback;
