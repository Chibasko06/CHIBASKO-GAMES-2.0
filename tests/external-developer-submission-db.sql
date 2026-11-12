begin;
insert into auth.users(id) values ('ef410000-0000-4000-8000-000000000001'),('ef410000-0000-4000-8000-000000000002'),('ef410000-0000-4000-8000-000000000003');
insert into public.admin_users(user_id) values ('ef410000-0000-4000-8000-000000000003');
insert into public.developer_contacts(user_id,first_name,last_name,contact_email,public_name)
 values ('ef410000-0000-4000-8000-000000000001','Test','Fixture','fixture@example.com','Fixture Studio');
insert into public.categories(id,name,slug)
 values ('ef410000-0000-4000-8000-000000000007','Fixture external category','fixture-external-category');
do $$
declare owner_id uuid:='ef410000-0000-4000-8000-000000000001';
 stranger uuid:='ef410000-0000-4000-8000-000000000002'; admin_id uuid:='ef410000-0000-4000-8000-000000000003';
 revision uuid:='ef410000-0000-4000-8000-000000000005'; next_revision uuid:='ef410000-0000-4000-8000-000000000006';
 g uuid; sid uuid; next_sid uuid; before_row jsonb; job jsonb;
 cover text:='https://assets.chibaskogames.fr/game-thumbnails/ef410000-0000-4000-8000-000000000008.png';
 origin text:='https://play.example.com';
begin
 g:=public.distribution_register_game(owner_id,'ef410000-0000-4000-8000-000000000004','Fixture external draft');
 update public.game_submission_drafts set metadata='{"title":"Fixture","studio":"Studio","description":"Description","technology":"HTML5","mobile":"both","releaseDate":"2026-01-01","categories":["ef410000-0000-4000-8000-000000000007"]}' where game_id=g;
 select to_jsonb(x) into before_row from public.games x where id=g;
 begin
   perform public.distribution_submit_external(stranger,g,revision,origin||'/old',origin,cover);
   raise exception 'foreign submission accepted';
 exception when raise_exception then if sqlerrm<>'draft_not_found' then raise; end if; end;
 sid:=public.distribution_submit_external(owner_id,g,revision,origin||'/old',origin,cover);
 if public.distribution_submit_external(owner_id,g,revision,origin||'/old',origin,cover)<>sid then
   raise exception 'idempotence failure'; end if;
 if (select count(*) from public.game_submission_notifications where submission_id=sid)<>1
   then raise exception 'external notification missing or duplicated'; end if;
 job:=public.distribution_claim_submission_email(sid);
 if job->>'externalRevisionId' is distinct from revision::text
   or job->'contact'->>'contactEmail' is distinct from 'fixture@example.com'
   or public.distribution_claim_submission_email(sid) is not null
   then raise exception 'invalid external notification claim'; end if;
 perform public.distribution_finish_submission_email(sid,(job->>'lease')::uuid,true);
 if public.distribution_claim_submission_email(sid) is not null then raise exception 'external notification replayed'; end if;
 if public.distribution_developer_external(stranger,0)<>'[]'::jsonb
   or public.distribution_developer_external(owner_id,0)->0->>'url'<>origin||'/old' then
   raise exception 'incorrect visibility'; end if;
 perform public.distribution_external_review(admin_id,revision,'correction','Remplacer l’URL');
 next_sid:=public.distribution_submit_external(owner_id,g,next_revision,origin||'/new',origin,cover);
 if (select count(*) from public.game_submission_notifications where submission_id=next_sid)<>1
   then raise exception 'external resubmission did not create its own notification'; end if;
 if next_sid=sid or not exists(select 1 from public.game_external_revisions where id=revision and submitted_url=origin||'/old')
   or not exists(select 1 from public.game_external_review_events where revision_id=revision and action='correction')
   then raise exception 'revision history changed'; end if;
 if (select to_jsonb(x) from public.games x where id=g) is distinct from before_row
   then raise exception 'catalogue changed'; end if;
 if has_function_privilege('anon','public.distribution_submit_external(uuid,uuid,uuid,text,text,text)','execute')
   or has_function_privilege('authenticated','public.distribution_submit_external(uuid,uuid,uuid,text,text,text)','execute')
   then raise exception 'public RPC grant'; end if;
 begin
   perform public.distribution_admin_external_reviews(stranger,0);
   raise exception 'foreign admin review access';
 exception when raise_exception then if sqlerrm<>'forbidden' then raise; end if; end;
 if not exists(select 1 from jsonb_array_elements(public.distribution_admin_external_reviews(admin_id,0)) as item
   where item->>'id'=next_revision::text and item->>'url'=origin||'/new') then raise exception 'missing review dossier'; end if;
 perform public.distribution_external_review(admin_id,next_revision,'approve',null,origin,true);
 perform public.distribution_external_review(admin_id,next_revision,'publish');
 if not exists(select 1 from public.games where id=g and title='Fixture' and thumbnail_url=cover)
   or not exists(select 1 from public.game_categories where game_id=g and category_id='ef410000-0000-4000-8000-000000000007')
   or not exists(select 1 from jsonb_array_elements(public.catalogue_page(p_slug=>(select slug from public.games where id=g))->'items') as item
     where item->>'id'=g::text and item->>'game_url'=origin||'/new')
   then raise exception 'published editorial catalogue projection missing'; end if;
 perform public.distribution_submit_external(owner_id,g,'ef410000-0000-4000-8000-000000000009',origin||'/rejected',origin);
 perform public.distribution_external_review(admin_id,'ef410000-0000-4000-8000-000000000009','reject','Fixture');
 if public.distribution_external_public_launch(g)->>'url'<>origin||'/new'
   then raise exception 'rejected revision replaced live URL'; end if;
 perform public.distribution_submit_external(owner_id,g,'ef410000-0000-4000-8000-000000000010',origin||'/update',origin);
 perform public.distribution_external_review(admin_id,'ef410000-0000-4000-8000-000000000010','approve',null,origin,true);
 if public.distribution_external_public_launch(g)->>'url'<>origin||'/new' then raise exception 'approval replaced live URL'; end if;
 perform public.distribution_external_review(admin_id,'ef410000-0000-4000-8000-000000000010','publish');
 if public.distribution_external_public_launch(g)->>'url'<>origin||'/update' then raise exception 'update failed'; end if;
end;
$$;
rollback;
