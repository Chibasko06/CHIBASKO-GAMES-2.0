-- Nettoyage ponctuel du jeu Test. Examen manuel avant exécution.
-- Ce script refuse toute dépendance complexe ou inconnue.
-- Il ne contourne pas le garde interdisant de supprimer les versions validées.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create temporary table test_game_cleanup_result (
 table_name text, deleted_rows bigint
) on commit drop;

do $$
declare
 target constant uuid:='4fa17e5b-c49b-4bbd-a7e6-73ac53d4e8de';
 actual_title text;
 r record; total bigint; found_game boolean;
 allowed constant text[]:=array[
  'game_developer_registrations','game_submission_drafts',
  'game_developer_members','game_categories','game_reviews','game_reactions',
  'favorites','play_history','multiplayer_game_policies',
  'social_notifications','social_operations','social_share_cooldowns'
 ];
begin
 if not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls))
  then raise exception 'Exécuter avec le rôle SQL de maintenance autorisé à examiner toutes les lignes'; end if;
 select title into actual_title from public.games where id=target for update;
 found_game:=found;
 if not found_game then raise exception 'Jeu introuvable : %',target; end if;
 if actual_title is distinct from 'Test' then
  raise exception 'Titre inattendu : arrêt du nettoyage'; end if;
 if exists(select 1 from public.games where id=target and (active_version_id is not null or external_revision_id is not null))
  then raise exception 'Version ou révision active : examiner inspect-test-game.sql avant une purge spécifique'; end if;

 -- Bloquer les écritures sur les seules tables dont les lignes peuvent être supprimées.
 -- L’ordre fixe limite les risques d’interblocage.
 for r in select unnest(allowed) as name order by 1 loop
  execute format('lock table public.%I in share row exclusive mode',r.name);
 end loop;

 -- Refuser les dépendances directes hors du périmètre de nettoyage validé.
 -- Les comportements CASCADE et SET NULL sont vérifiés autant que RESTRICT.
 for r in
  select fk.oid,fk.conrelid,n.nspname,c.relname,
   string_agg(format('child.%I = parent.%I',ca.attname,pa.attname),' and ' order by k.ord) as join_sql
  from pg_constraint fk
  join pg_class c on c.oid=fk.conrelid join pg_namespace n on n.oid=c.relnamespace
  cross join lateral unnest(fk.conkey,fk.confkey) with ordinality k(child_att,parent_att,ord)
  join pg_attribute ca on ca.attrelid=fk.conrelid and ca.attnum=k.child_att
  join pg_attribute pa on pa.attrelid=fk.confrelid and pa.attnum=k.parent_att
  where fk.contype='f' and fk.confrelid='public.games'::regclass
  group by fk.oid,fk.conrelid,n.nspname,c.relname
 loop
  if r.nspname<>'public' or not (r.relname=any(allowed)) then
   execute format('select count(*) from %I.%I child join public.games parent on %s where parent.id=$1',
    r.nspname,r.relname,r.join_sql) into total using target;
   if total>0 then raise exception 'Dépendance à examiner avant suppression : %.% (% lignes)',r.nspname,r.relname,total; end if;
  end if;
 end loop;

 -- Aucun descendant des tables nettoyées n’est supprimé implicitement.
 -- Une nouvelle FK ajoutée en production provoque un arrêt, même sans lignes.
 if exists (
  select 1 from pg_constraint fk join pg_class parent on parent.oid=fk.confrelid
  join pg_namespace n on n.oid=parent.relnamespace
  where fk.contype='f' and n.nspname='public' and parent.relname=any(allowed)
 ) then raise exception 'Dépendance indirecte vers une table nettoyée : examiner les FK de production'; end if;

 -- Les déclencheurs DELETE inconnus peuvent avoir des effets hors du jeu.
 if exists(
  select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and t.tgenabled<>'D' and (t.tgtype::integer & 8)<>0
   and n.nspname='public' and (c.relname='games' or c.relname=any(allowed))
 ) then raise exception 'Déclencheur DELETE à examiner avant nettoyage'; end if;

 if exists(select 1 from public.game_submission_drafts where game_id=target and upload_id is not null)
  then raise exception 'Brouillon associé à un upload : inspection nécessaire'; end if;

 foreach actual_title in array allowed loop
  execute format(
   'with removed as (delete from public.%I where game_id=$1 returning game_id) select count(*) from removed',
   actual_title
  ) into total using target;
  insert into test_game_cleanup_result values(actual_title,total);
 end loop;
 with removed as (
  delete from public.games where id=target and title='Test' returning id
 ) select count(*) into total from removed;
 if total<>1 then raise exception 'Suppression du jeu non confirmée'; end if;
 insert into test_game_cleanup_result values('games',total);
end $$;

select * from test_game_cleanup_result order by table_name;
select not exists(
 select 1 from public.games where id='4fa17e5b-c49b-4bbd-a7e6-73ac53d4e8de'
) as jeu_supprime;
commit;
