\set ON_ERROR_STOP on
begin;
-- Toutes les identités et données de ce test sont annulées en fin de transaction.
do $$
declare
 player uuid:=gen_random_uuid(); developer uuid:=gen_random_uuid(); uploader uuid:=gen_random_uuid();
 game uuid:=gen_random_uuid(); registered uuid; upload uuid:=gen_random_uuid(); version_id uuid:=gen_random_uuid();
 submission uuid:=gen_random_uuid(); blocked_by text;
 saved jsonb; category uuid:=gen_random_uuid(); saved_game uuid;
begin
 insert into auth.users(id,email) values(player,'player-lifecycle@example.test'),(developer,'developer-lifecycle@example.test'),(uploader,'uploader-lifecycle@example.test');
 if (select count(*) from public.profiles where id in (player,developer,uploader))<>3 then raise exception 'Création automatique des profils absente'; end if;
 insert into public.games(id,title,slug,game_url,is_published) values(game,'Lifecycle','lifecycle-fixture','https://example.test/game',true);
 insert into public.favorites(user_id,game_id) values(player,game);
 insert into public.play_history(user_id,game_id) values(player,game);
 insert into public.game_reactions(user_id,game_id,reaction) values(player,game,'like');
 insert into public.game_reviews(user_id,game_id,rating,comment) values(player,game,5,'Avis de test');
 insert into public.admin_users(user_id) values(player);
 insert into public.categories(id,name,slug) values(category,'Test','lifecycle-category');
 saved:=public.admin_save_game(player,jsonb_build_object('title','Catalogue complet','slug','lifecycle-admin',
  'game_url','https://example.test','is_published',false),array[category]);
 saved_game:=(saved->'game'->>'id')::uuid;
 if not exists(select 1 from public.game_categories where game_id=saved_game and category_id=category) then raise exception 'RPC admin incompatible avec le schéma complet'; end if;
 begin
  perform public.admin_save_game(player,jsonb_build_object('title','Mutation invalide','slug','lifecycle-admin',
   'game_url','https://example.test'),array[gen_random_uuid()],saved_game);
  raise exception 'Catégorie absente acceptée';
 exception when invalid_parameter_value then null;
 end;
 if (select title from public.games where id=saved_game)<>'Catalogue complet' then raise exception 'Rollback admin incomplet'; end if;
 delete from auth.users where id=player;
 if exists(select 1 from public.profiles where id=player)
  or exists(select 1 from public.favorites where user_id=player)
  or exists(select 1 from public.play_history where user_id=player)
  or exists(select 1 from public.game_reactions where user_id=player)
  or exists(select 1 from public.game_reviews where user_id=player)
  or exists(select 1 from public.admin_users where user_id=player) then raise exception 'Suppression du joueur incomplète'; end if;

 registered:=public.distribution_register_game(developer,gen_random_uuid(),'Brouillon de test');
 begin
  delete from auth.users where id=developer;
  raise exception 'Suppression inattendue d’un développeur avec brouillon';
 exception when foreign_key_violation then null;
 end;
 if not exists(select 1 from auth.users where id=developer)
  or not exists(select 1 from public.game_submission_drafts where game_id=registered)
  or not exists(select 1 from public.game_developer_members where game_id=registered and user_id=developer) then raise exception 'Suppression bloquée non atomique'; end if;
 -- Isole la seconde contrainte, sans définir de procédure de suppression applicative.
 delete from public.game_submission_drafts where game_id=registered;
 begin
  delete from auth.users where id=developer;
  raise exception 'Inscription développeur non bloquante';
 exception when foreign_key_violation then
  get stacked diagnostics blocked_by=constraint_name;
  if blocked_by<>'game_developer_registrations_actor_fkey' then raise exception 'Contrainte inattendue : %',blocked_by; end if;
 end;

 delete from public.game_developer_registrations where actor=developer;
 insert into public.game_submission_drafts(game_id,created_by) values(registered,developer);
 begin
  delete from auth.users where id=developer;
  raise exception 'Brouillon non bloquant';
 exception when foreign_key_violation then
  get stacked diagnostics blocked_by=constraint_name;
  if blocked_by<>'game_submission_drafts_created_by_fkey' then raise exception 'Contrainte inattendue : %',blocked_by; end if;
 end;

 insert into public.game_developer_members values(game,uploader,'owner');
 insert into public.developer_contacts(user_id,first_name,last_name,contact_email,public_name)
 values(uploader,'Prénom','Nom','contact-lifecycle@example.test','Studio de test');
 insert into public.game_build_uploads(id,game_id,created_by,request_id,version,version_id,status,expected_size,policy,expires_at)
 values(upload,game,uploader,gen_random_uuid(),'1.0.0',version_id,'completed',100,'{"revision":"1"}',now()+interval '1 day');
 insert into public.game_versions(id,game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count,created_by)
 values(version_id,game,'1.0.0',1,1,jsonb_build_object('gameId',game,'version','1.0.0','schemaVersion',1,'integrationVersion',1),repeat('a',64),100,1,uploader);
 update public.game_versions set status='in_review' where id=version_id;
 update public.game_versions set status='approved' where id=version_id;
 update public.game_versions set status='published' where id=version_id;
 perform public.set_active_game_version(game,version_id);
 insert into public.game_submissions(id,name_or_studio,email,game_title,demo_url,game_type,description,build_upload_id)
 values(submission,'Studio de test','contact-lifecycle@example.test','Lifecycle','https://example.test','web','Description',upload);
 delete from auth.users where id=uploader;
 if exists(select 1 from public.developer_contacts where user_id=uploader)
  or exists(select 1 from public.game_developer_members where user_id=uploader) then raise exception 'Coordonnées ou droits directs conservés'; end if;
 if not exists(select 1 from public.games where id=game and active_version_id=version_id and is_published)
  or not exists(select 1 from public.game_versions where id=version_id and status='published' and created_by is null)
  or not exists(select 1 from public.game_build_uploads where id=upload and created_by is null) then raise exception 'Distribution publiée altérée'; end if;
 if not exists(select 1 from public.game_submissions where id=submission and email='contact-lifecycle@example.test')
  or not exists(select 1 from public.game_submission_notifications where submission_id=submission and contact_snapshot->>'contactEmail'='contact-lifecycle@example.test')
 then raise exception 'Conservation actuelle des instantanés non reproduite'; end if;
end $$;
rollback;

begin;
-- Le second extrait de sql/tables.sql décrit aussi des FK sans cascade.
-- Vérifie ces variantes sans les adopter comme politique de suppression.
do $$
declare
 relation text; target text; column_name text; constraint_name text; original text;
 actor uuid; game uuid;
begin
 foreach relation in array array['profiles','favorites','play_history'] loop
  actor:=gen_random_uuid();game:=gen_random_uuid();
  column_name:=case when relation='profiles' then 'id' else 'user_id' end;
  target:=case when relation='profiles' then 'auth.users' else 'public.profiles' end;
  constraint_name:=relation||'_'||column_name||'_fkey';
  select pg_get_constraintdef(c.oid) into original from pg_constraint c
   where c.conrelid=('public.'||relation)::regclass and c.conname=constraint_name;
  execute format('alter table public.%I drop constraint %I',relation,constraint_name);
  execute format('alter table public.%I add constraint %I foreign key(%I) references %s(id)',relation,constraint_name,column_name,target);
  insert into auth.users(id,email) values(actor,relation||'-no-action@example.test');
  insert into public.games(id,title,slug,game_url) values(game,'Variante historique',relation||'-no-action','https://example.test');
  if relation<>'profiles' then
   execute format('insert into public.%I(user_id,game_id) values($1,$2)',relation) using actor,game;
  end if;
  begin
   delete from auth.users where id=actor;
   raise exception 'Variante historique non bloquante : %',relation;
  exception when foreign_key_violation then null;
  end;
  if not exists(select 1 from auth.users where id=actor) or not exists(select 1 from public.profiles where id=actor)
   then raise exception 'Suppression partielle dans la variante historique'; end if;
  execute format('alter table public.%I drop constraint %I',relation,constraint_name);
  execute format('alter table public.%I add constraint %I %s',relation,constraint_name,original);
 end loop;
end $$;
rollback;
