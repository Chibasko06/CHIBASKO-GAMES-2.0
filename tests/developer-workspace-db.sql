begin;
do $$
declare actor uuid:=gen_random_uuid();other_actor uuid:=gen_random_uuid();admin uuid:=gen_random_uuid();game uuid;upload uuid:=gen_random_uuid();submission uuid:=gen_random_uuid();job jsonb;internal jsonb;data jsonb;result jsonb;
begin
 insert into auth.users(id,email,email_confirmed_at) values(actor,'creator-workspace@example.test',now()),(other_actor,'other-workspace@example.test',now()),(admin,'admin-workspace@example.test',now());
 insert into public.admin_users(user_id) values(admin);
 insert into public.developer_contacts(user_id,first_name,last_name,contact_email,public_name) values(actor,'Créateur','Fixture','unverified-contact@example.test','Studio');
 update public.developer_contacts set email_verified_at=now() where user_id=actor;
 game:=public.distribution_register_game(actor,gen_random_uuid(),'Projet privé');
 data:=public.distribution_developer_workspace(actor,game);
 if jsonb_array_length(data->'games')<>1 or data->'games'->0->>'recordedViews'<>'0' then raise exception 'Projet ou métriques incorrects'; end if;
 if jsonb_array_length(public.distribution_developer_workspace(other_actor)->'games')<>0 then raise exception 'Projet privé divulgué'; end if;
 begin perform public.distribution_developer_workspace(other_actor,game);raise exception 'Accès croisé accepté';exception when raise_exception then if sqlerrm<>'forbidden' then raise;end if;end;
 insert into public.game_build_uploads(id,game_id,created_by,request_id,version,status,expected_size,policy,expires_at)
 values(upload,game,actor,gen_random_uuid(),'1.0.0','queued',100,'{"revision":"1","maxAttempts":3}',now()+interval '1 day');
 insert into public.game_submissions(id,name_or_studio,email,game_title,demo_url,game_type,description,build_upload_id)
 values(submission,'Studio','creator-workspace@example.test','Projet privé','https://example.test','web','Description',upload);
 set local role service_role;
 if public.distribution_confirmed_submission_email(submission)<>'creator-workspace@example.test' then raise exception 'Adresse confirmée inaccessible au serveur'; end if;
 if public.distribution_confirmed_submission_email(gen_random_uuid()) is not null then raise exception 'Dossier inexistant accepté'; end if;
 reset role;
 if (select count(*) from public.game_submission_notifications where submission_id=submission)<>2 then raise exception 'Réception ou alerte interne absente'; end if;
 if not exists(select 1 from public.game_submission_notifications where id=submission and event_key='internal' and notification is null) then raise exception 'Identité historique modifiée'; end if;
 internal:=public.distribution_claim_submission_email(submission);
 if internal->>'id'<>submission::text or internal->'notification'<>'null'::jsonb then raise exception 'Ancien Worker exposé aux nouveaux messages'; end if;
 job:=public.distribution_claim_submission_email_events(submission);
 if job->'notification'->>'event'<>'received' or job->'notification'->>'recipient'<>'unverified-contact@example.test' then raise exception 'Réception mal adressée'; end if;
 perform public.distribution_prepare_submission_email((job->>'id')::uuid,(job->>'lease')::uuid,'{"text":"figé"}');
 if public.distribution_prepare_submission_email((job->>'id')::uuid,(job->>'lease')::uuid,'{"text":"nouveau"}')<>'{"text":"figé"}'::jsonb then raise exception 'Payload écrasé'; end if;
 perform public.distribution_finish_submission_email((job->>'id')::uuid,(job->>'lease')::uuid,true);
 perform public.distribution_finish_submission_email(submission,(internal->>'lease')::uuid,true);
 perform public.distribution_queue_developer_email(submission,'received','received');
 if (select count(*) from public.game_submission_notifications where submission_id=submission)<>2 then raise exception 'Réception dupliquée'; end if;
 update public.developer_contacts set email_verified_at=null where user_id=actor;
 set local role service_role;
 begin perform public.distribution_require_verified_email(actor);raise exception 'Confirmation contournée';exception when raise_exception then if sqlerrm<>'developer_email_unverified' then raise;end if;end;
 reset role;
 if (select count(*) from public.game_submission_notifications where submission_id=submission)<>2 then raise exception 'Notification vers un destinataire non vérifié'; end if;
 update public.developer_contacts set email_verified_at=now() where user_id=actor;
 result:=public.distribution_admin_review_queue(admin,'validation');
 if (public.admin_console_overview(admin)->>'buildsAwaitingValidation')::bigint<>(result->>'total')::bigint then raise exception 'Compteur incohérent'; end if;
 begin perform public.distribution_admin_review_queue(actor,'review');raise exception 'Admin contourné';exception when raise_exception then if sqlerrm<>'forbidden' then raise;end if;end;
 perform public.distribution_request_build_correction(admin,upload,'Corriger le manifeste');
 perform public.distribution_request_build_correction(admin,upload,'Corriger le manifeste');
 if (select count(*) from public.game_submission_notifications where submission_id=submission and notification->>'event'='correction')<>1 then raise exception 'Correction dupliquée ou absente'; end if;
 data:=public.distribution_developer_workspace(actor,game);
 if data->'builds'->0->>'reason'<>'Corriger le manifeste' then raise exception 'Motif absent du dossier'; end if;
 data:=public.distribution_developer_workspace(actor,game,100);
 if jsonb_array_length(data->'games')<>1 or jsonb_array_length(data->'builds')<>0 then raise exception 'Pagination du dossier incorrecte'; end if;
 perform public.distribution_prepare_build_correction(actor,game,upload);
 if not exists(select 1 from public.game_build_uploads where id=upload and game_id=game) or (select count(*) from public.games where id=game)<>1 then raise exception 'Historique ou identité perdu'; end if;
 if exists(select 1 from public.games where id=game and is_published) then raise exception 'Publication automatique'; end if;
end $$;
do $$ declare name text; begin
 foreach name in array array['distribution_developer_workspace(uuid,uuid,integer)','distribution_admin_review_queue(uuid,text,integer)','distribution_claim_submission_email_events(uuid)','distribution_confirmed_submission_email(uuid)'] loop
  if has_function_privilege('anon','public.'||name,'EXECUTE') or has_function_privilege('authenticated','public.'||name,'EXECUTE') then raise exception 'RPC publique : %',name; end if;
 end loop;
end $$;
do $$ declare actor_role text; begin
 foreach actor_role in array array['anon','authenticated','service_role'] loop
  execute format('set local role %I',actor_role);
  begin
   perform email,email_confirmed_at from auth.users limit 1;
   raise exception 'Lecture directe Auth autorisée : %',actor_role;
  exception when insufficient_privilege then null;
  end;
  if actor_role<>'service_role' then
   begin
    perform public.distribution_confirmed_submission_email(gen_random_uuid());
    raise exception 'Fonction privilégiée publique';
   exception when insufficient_privilege then null;
   end;
  end if;
  reset role;
 end loop;
 if not exists(select 1 from pg_proc where oid='public.distribution_confirmed_submission_email(uuid)'::regprocedure and prosecdef and proowner='postgres'::regrole and proconfig @> array['search_path=""']) then raise exception 'Fonction privilégiée mal configurée'; end if;
end $$;
rollback;
