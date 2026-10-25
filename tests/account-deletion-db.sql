\set ON_ERROR_STOP on
begin;
create function public.deletion_fixture_fail() returns trigger language plpgsql as $$begin
 if (select count(*) from public.game_platform_management)>0 then raise exception 'fixture_transfer_failure'; end if;
 return new;
end $$;
create trigger deletion_fixture_failure before insert on public.game_platform_management for each row execute function public.deletion_fixture_fail();
do $$
declare administrator uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); ordinary uuid:=gen_random_uuid(); coowner uuid:=gen_random_uuid();
 first_game uuid; second_game uuid; draft uuid; version_id uuid; upload uuid:=gen_random_uuid(); submission uuid:=gen_random_uuid();
 published_upload uuid:=gen_random_uuid(); private_version uuid:=gen_random_uuid();
 job uuid; lease uuid; row record; payload jsonb; before_game jsonb; task uuid;
begin
 insert into auth.users(id,email) values(administrator,'deletion-admin@example.test'),(actor,'deletion-actor@example.test'),(ordinary,'deletion-player@example.test');
 insert into auth.users(id,email) values(coowner,'remaining-owner@example.test');
 insert into public.admin_users(user_id) values(administrator);
 first_game:=public.distribution_register_game(actor,gen_random_uuid(),'Premier jeu');
 second_game:=public.distribution_register_game(actor,gen_random_uuid(),'Second jeu');
 draft:=public.distribution_register_game(actor,gen_random_uuid(),'Brouillon privé');
 insert into public.game_developer_members(game_id,user_id,role) values(first_game,ordinary,'editor');
 insert into public.game_developer_members(game_id,user_id,role) values(second_game,coowner,'owner');
 for row in select id from public.games where id in(first_game,second_game) loop
  version_id:=gen_random_uuid();
  insert into public.game_versions(id,game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count,created_by)
   values(version_id,row.id,'1.0.0',1,1,jsonb_build_object('gameId',row.id,'version','1.0.0','schemaVersion',1,'integrationVersion',1),repeat('a',64),100,1,actor);
  update public.game_versions set status='in_review' where id=version_id;
  update public.game_versions set status='approved' where id=version_id;
  update public.game_versions set status='published' where id=version_id;
  perform public.set_active_game_version(row.id,version_id);
  update public.games set is_published=true where id=row.id;
 end loop;
 insert into public.categories(id,name,slug) values('aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa','Catégorie conservée','deletion-fixture');
 insert into public.game_categories(game_id,category_id) values(first_game,'aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa');
 insert into public.developer_contacts(user_id,first_name,last_name,contact_email,public_name)
 values(actor,'Prénom privé','Nom privé','private-deletion@example.test','Studio public');
 insert into public.game_build_uploads(id,game_id,created_by,request_id,version,status,expected_size,policy,expires_at)
 values(upload,draft,actor,gen_random_uuid(),'1.0.0','queued',100,'{"revision":"1"}',now()+interval '1 day');
 insert into public.game_submissions(id,name_or_studio,email,game_title,demo_url,game_type,description,build_upload_id)
 values(submission,'Studio public','private-deletion@example.test','Brouillon','https://example.test','web','Description',upload);
 insert into public.game_versions(id,game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count,created_by)
 values(private_version,draft,'1.0.0',1,1,jsonb_build_object('gameId',draft,'version','1.0.0','schemaVersion',1,'integrationVersion',1),repeat('b',64),100,1,actor);
 update public.game_build_uploads set status='completed',version_id=private_version where id=upload;
 insert into public.game_build_uploads(id,game_id,created_by,request_id,version,status,expected_size,policy,expires_at)
 values(published_upload,first_game,actor,gen_random_uuid(),'1.0.0','completed',100,'{"revision":"1"}',now()+interval '1 day');
 insert into public.game_build_reviews(upload_id,decision) values(published_upload,'published');
 insert into public.game_build_review_events(upload_id,actor,action) values(published_upload,actor,'publish');
 select to_jsonb(g) into before_game from public.games g where id=first_game;
 begin
  perform public.distribution_account_request(ordinary,actor);raise exception 'Accès non autorisé';
 exception when insufficient_privilege then null;
 end;
 payload:=public.distribution_account_request(actor,actor);job:=(payload->>'id')::uuid;
 if payload->>'state'<>'review_required' then raise exception 'Revue des conditions manquante'; end if;
 if public.distribution_account_claim(job) is not null then raise exception 'Revue contournée'; end if;
 if not exists(select 1 from auth.users where id=actor) or exists(select 1 from public.game_platform_management) then raise exception 'Demande non réversible'; end if;
 perform public.distribution_account_review(administrator,job,'fixture-contract-review');
 payload:=public.distribution_account_claim(job);lease:=(payload->>'lease')::uuid;
 if public.distribution_account_claim(job) is not null then raise exception 'Double claim'; end if;
 begin
  perform public.distribution_account_prepare(job,lease);raise exception 'Échec de transfert non simulé';
 exception when others then if sqlerrm<>'fixture_transfer_failure' then raise; end if;
 end;
 if exists(select 1 from public.game_platform_management) or not exists(select 1 from public.developer_contacts where user_id=actor)
  or (select state from public.game_account_deletions where id=job)<>'pending' then raise exception 'Transfert partiel'; end if;
 drop trigger deletion_fixture_failure on public.game_platform_management;
 if public.distribution_account_prepare(job,lease)<>'prepared' then raise exception 'Préparation non terminée'; end if;
 if (select count(*) from public.game_platform_management where authority_id='chibasko_games')<>2 then raise exception 'Gestion administrative absente'; end if;
 if not exists(select 1 from public.game_developer_members where game_id=first_game and user_id=ordinary and role='editor') then raise exception 'Autre développeur supprimé'; end if;
 if not exists(select 1 from public.game_developer_members where game_id=second_game and user_id=coowner and role='owner')
  or not exists(select 1 from auth.users where id=coowner) then raise exception 'Copropriétaire supprimé'; end if;
 if jsonb_array_length(public.distribution_managed_catalog(administrator))<>2 then raise exception 'Gestion technique admin indisponible'; end if;
 payload:=public.distribution_managed_catalog(ordinary);
 if jsonb_array_length(payload)<>1 or (payload->0->>'id')::uuid<>first_game then raise exception 'Catalogue partagé incohérent'; end if;
 if (select to_jsonb(g) from public.games g where id=first_game) is distinct from before_game then raise exception 'Jeu publié modifié'; end if;
 if not exists(select 1 from public.game_categories where game_id=first_game) then raise exception 'Catégories supprimées'; end if;
 if exists(select 1 from public.games where id=draft) or exists(select 1 from public.game_submission_drafts where created_by=actor)
  or exists(select 1 from public.game_developer_registrations where game_id in(first_game,second_game,draft))
  or exists(select 1 from public.developer_contacts where user_id=actor)
  or exists(select 1 from public.game_submissions where id=submission)
  or exists(select 1 from public.game_submission_notifications where submission_id=submission)
  or exists(select 1 from public.profiles where id=actor) then raise exception 'Données privées résiduelles'; end if;
 if exists(select 1 from public.game_versions where game_id in(first_game,second_game) and created_by is not null) then raise exception 'Auteur technique non anonymisé'; end if;
 if exists(select 1 from public.game_versions where id=private_version) then raise exception 'Version privée non purgée'; end if;
 if not exists(select 1 from public.game_account_cleanup where job_id=job and kind='artifacts' and object_key='games/'||draft||'/')
  or exists(select 1 from public.game_account_cleanup where job_id=job and kind='artifacts' and object_key in('games/'||first_game||'/','games/'||second_game||'/')) then raise exception 'Périmètre R2 incorrect'; end if;
 if not exists(select 1 from public.game_build_uploads where id=published_upload and created_by is null)
  or exists(select 1 from public.game_build_review_events e where e.upload_id=published_upload and e.actor is not null) then raise exception 'Identité de revue non effacée'; end if;
 begin
  delete from public.game_versions where game_id=first_game;
  raise exception 'Version publiée supprimée';
 exception when others then if sqlerrm<>'Archive versions instead of deleting them' then raise; end if; end;
 if not exists(select 1 from public.game_versions where game_id=first_game and artifact_sha256=repeat('a',64) and status='published') then raise exception 'Artifact publié altéré'; end if;
 begin
  insert into public.profiles(id,username) values(actor,'profil-recréé');raise exception 'Résurrection du profil';
 exception when object_not_in_prerequisite_state then null;
 end;
 -- Un échec Auth laisse l'identité présente et interdit la confirmation SQL.
 begin perform public.distribution_account_auth_deleted(job,lease);raise exception 'Auth non supprimé accepté';
 exception when others then if sqlerrm<>'auth_still_present' then raise; end if; end;
 perform public.distribution_account_release(job,lease,'auth_unavailable');
 if (select state from public.game_account_deletions where id=job)<>'prepared' then raise exception 'Échec Auth perdu'; end if;
 perform public.distribution_account_review(administrator,job,null);
 payload:=public.distribution_account_claim(job);lease:=(payload->>'lease')::uuid;
 if public.distribution_account_prepare(job,lease)<>'prepared' then raise exception 'Reprise SQL non idempotente'; end if;
 delete from auth.users where id=actor;
 -- Crash entre Auth et son acquittement : la même demande reste récupérable.
 perform public.distribution_account_auth_deleted(job,lease);
 for row in select id from public.game_account_cleanup where job_id=job loop
  perform public.distribution_account_cleanup_ack(job,lease,row.id,null,true);
 end loop;
 payload:=public.distribution_account_release(job,lease,null);
 if payload->>'state'<>'completed' or (select target_user_id from public.game_account_deletions where id=job) is not null then raise exception 'Suppression incomplète'; end if;
 if (public.distribution_account_request(administrator,actor)->>'id')::uuid<>job then raise exception 'Demande dupliquée'; end if;

 -- Le parcours sans jeu ne nécessite aucune revue de licence.
 payload:=public.distribution_account_request(ordinary,ordinary);job:=(payload->>'id')::uuid;
 if payload->>'state'<>'pending' then raise exception 'Revue inutile'; end if;
 perform public.distribution_account_cancel(ordinary,job);
 update public.profiles set bio='Demande annulée' where id=ordinary;
 if (public.distribution_account_request(ordinary,ordinary)->>'id')::uuid<>job then raise exception 'Reprise après annulation incohérente'; end if;
 payload:=public.distribution_account_claim(job);lease:=(payload->>'lease')::uuid;
 perform public.distribution_account_prepare(job,lease);
 delete from auth.users where id=ordinary;
 perform public.distribution_account_auth_deleted(job,lease);
 select id into task from public.game_account_cleanup where job_id=job;
 if not public.distribution_account_reserve_asset(task,lease,'avatars/'||ordinary||'/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png') then raise exception 'Réservation absente'; end if;
 begin
  update public.games set thumbnail_url='https://assets.chibaskogames.fr/avatars/'||ordinary||'/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png' where id=first_game;
  raise exception 'Réutilisation d’un asset supprimé';
 exception when others then if sqlerrm<>'asset_retired' then raise; end if; end;
 perform public.distribution_account_cleanup_ack(job,lease,task,null,true);
 perform public.distribution_account_release(job,lease,null);
end $$;

do $$
declare owner_id uuid:=gen_random_uuid(); editor_id uuid:=gen_random_uuid(); shared_game uuid; job uuid; lease uuid; payload jsonb;
begin
 insert into auth.users(id,email) values(owner_id,'shared-owner@example.test'),(editor_id,'shared-editor@example.test');
 shared_game:=public.distribution_register_game(owner_id,gen_random_uuid(),'Brouillon partagé');
 insert into public.game_developer_members(game_id,user_id,role) values(shared_game,editor_id,'editor');
 payload:=public.distribution_account_request(owner_id,owner_id);job:=(payload->>'id')::uuid;
 payload:=public.distribution_account_claim(job);lease:=(payload->>'lease')::uuid;
 if public.distribution_account_prepare(job,lease)<>'review_required' then raise exception 'Brouillon partagé purgé'; end if;
 if not exists(select 1 from public.games where id=shared_game)
  or (select count(*) from public.game_developer_members m where m.game_id=shared_game)<>2
  or not exists(select 1 from auth.users where id=owner_id)
  or exists(select 1 from public.game_account_cleanup where job_id=job) then raise exception 'Préparation partielle du brouillon partagé'; end if;
 if public.distribution_account_claim(job) is not null then raise exception 'Revue du brouillon contournée'; end if;
 perform public.distribution_account_cancel(owner_id,job);
end $$;
set local role anon;
do $$begin
 begin perform * from public.game_account_deletions;raise exception 'Lecture anonyme';exception when insufficient_privilege then null;end;
 begin perform public.distribution_account_request(gen_random_uuid(),gen_random_uuid());raise exception 'Suppression anonyme';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role authenticated;
do $$begin
 begin perform public.distribution_account_claim(null);raise exception 'Claim navigateur';exception when insufficient_privilege then null;end;
 begin perform * from public.game_account_cleanup;raise exception 'Secrets de nettoyage exposés';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
