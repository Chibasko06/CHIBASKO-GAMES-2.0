begin;
do $$
declare actor uuid:=gen_random_uuid(); game uuid; upload uuid:=gen_random_uuid(); submission uuid:=gen_random_uuid();
 receipt jsonb; first_lease uuid; request_id uuid; counts jsonb; profile_before jsonb;
begin
 insert into auth.users(id,email) values(actor,'maintenance-fixture@example.test');
 insert into public.developer_contacts(user_id,first_name,last_name,contact_email,public_name)
 values(actor,'Fixture','Maintenance','maintenance-contact@example.test','Studio');
 game:=public.distribution_register_game(actor,gen_random_uuid(),'Jeu maintenance');
 insert into public.game_build_uploads(id,game_id,created_by,request_id,version,status,expected_size,policy,expires_at,lease_token,lease_until)
 values(upload,game,actor,gen_random_uuid(),'1.0.0','validating',100,'{"revision":"1","maxAttempts":3}',now()+interval '1 day',gen_random_uuid(),now()-interval '1 minute');
 insert into public.game_submissions(id,name_or_studio,email,game_title,demo_url,game_type,description,build_upload_id)
 values(submission,'Studio','maintenance-contact@example.test','Jeu','https://example.test','web','Description',upload);
 receipt:=public.distribution_claim_submission_email(submission);first_lease:=(receipt->>'lease')::uuid;
 if first_lease is null then raise exception 'Notification non réservable'; end if;
 perform public.distribution_prepare_submission_email(submission,first_lease,'{"text":"fixture privée"}');
 perform public.distribution_finish_submission_email(submission,first_lease,false);
 if not exists(select 1 from public.game_submission_notifications where submission_id=submission and next_attempt_at=now()+interval '5 minutes' and message->>'text'='fixture privée') then raise exception 'Backoff initial ou message perdu'; end if;
 update public.game_submission_notifications set next_attempt_at=now()-interval '1 second' where submission_id=submission;
 receipt:=public.distribution_claim_submission_email(submission);
 begin perform public.distribution_finish_submission_email(submission,first_lease,true);raise exception 'Ancien lease accepté';exception when raise_exception then if sqlerrm<>'lease_lost' then raise;end if;end;
 perform public.distribution_finish_submission_email(submission,(receipt->>'lease')::uuid,false);
 if not exists(select 1 from public.game_submission_notifications where submission_id=submission and next_attempt_at=now()+interval '10 minutes') then raise exception 'Backoff exponentiel absent'; end if;
 update public.game_submission_notifications set next_attempt_at=now()-interval '1 second' where submission_id=submission;
 receipt:=public.distribution_claim_submission_email(submission);perform public.distribution_reject_submission_email(submission,(receipt->>'lease')::uuid);
 if public.distribution_claim_submission_email(submission) is not null then raise exception 'Erreur permanente réessayée'; end if;
 update public.game_submission_notifications set last_error=null,attempts=8 where submission_id=submission;
 if public.distribution_claim_submission_email(submission) is not null then raise exception 'Budget de tentatives dépassé'; end if;
 if not exists(select 1 from public.game_submission_notifications where submission_id=submission and last_error='attention_required') then raise exception 'Budget épuisé non signalé'; end if;
 update public.game_submission_notifications set last_error=null,attempts=1,first_attempt_at=now()-interval '24 hours' where submission_id=submission;
 if public.distribution_claim_submission_email(submission) is not null then raise exception 'Fenêtre fournisseur dépassée'; end if;
 update public.game_submission_notifications set first_attempt_at=now() where submission_id=submission;
 update public.game_submission_notifications set last_error=null,lease_until=now()-interval '1 second',lease_token=gen_random_uuid(),next_attempt_at=now()-interval '1 second' where submission_id=submission;
 receipt:=public.distribution_claim_submission_email(submission);if receipt is null then raise exception 'Lease expiré non repris'; end if;
 update public.game_submission_notifications set lease_until=now()-interval '1 second' where submission_id=submission;
 request_id:=(public.distribution_account_request(actor,actor)->>'id')::uuid;
 if public.distribution_claim_submission_email(submission) is not null then raise exception 'Notification envoyée pendant suppression'; end if;
 counts:=public.distribution_maintenance_uploads();
 if (counts->>'recovered')::integer<>1 then raise exception 'Validation bloquant la suppression non récupérée'; end if;
 if not exists(select 1 from public.game_build_uploads where id=upload and status='queued' and lease_token is null and created_by=actor and version='1.0.0') then raise exception 'Transition de reprise incorrecte'; end if;
 select to_jsonb(p) into profile_before from public.profiles p where id=actor;
 begin update public.profiles set username='Modification interdite' where id=actor;raise exception 'Profil modifiable';exception when object_not_in_prerequisite_state then null;end;
 if (select to_jsonb(p) from public.profiles p where id=actor) is distinct from profile_before then raise exception 'Profil altéré'; end if;
 receipt:=public.distribution_account_claim(request_id);
 if public.distribution_account_prepare(request_id,(receipt->>'lease')::uuid)<>'prepared' then raise exception 'Suppression non reprenable'; end if;
 if public.distribution_maintenance_uploads()->>'recovered'<>'0' then raise exception 'Reprise non idempotente'; end if;
 if has_function_privilege('anon','public.distribution_maintenance_uploads()','EXECUTE') or has_function_privilege('authenticated','public.distribution_maintenance_health()','EXECUTE') or has_function_privilege('authenticated','public.distribution_reject_submission_email(uuid,uuid)','EXECUTE') then raise exception 'Privilège de maintenance public'; end if;
 counts:=public.distribution_maintenance_health();if counts::text like '%maintenance-contact%' then raise exception 'Données privées dans les métriques'; end if;
 insert into public.contact_dispatches(id,fingerprint,client_hash,email_hash,expires_at)
 select gen_random_uuid(),repeat(md5(i::text),2),repeat('a',64),repeat('b',64),now()-interval '1 second' from generate_series(1,101) i;
 perform public.distribution_cleanup_sessions();if (select count(*) from public.contact_dispatches)<>101 then raise exception 'Reçus purgés sans tâche contact'; end if;
 perform public.contact_cleanup();if (select count(*) from public.contact_dispatches)<>1 then raise exception 'Lot contact non borné'; end if;
 perform public.contact_cleanup();if exists(select 1 from public.contact_dispatches) then raise exception 'Reprise contact incomplète'; end if;
end $$;
rollback;
