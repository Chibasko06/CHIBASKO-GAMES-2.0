begin;
set local lock_timeout='5s';

-- Lecture bornée des anciens et nouveaux diagnostics ; un événement mal formé
-- ne doit jamais rendre un dossier administratif inaccessible.
create function public.distribution_validation_event(p_action text) returns jsonb
language plpgsql immutable security invoker set search_path=pg_catalog,public as $$
declare d jsonb;
begin
 if length(p_action)>2048 or left(p_action,22)<>'validation_diagnostic:' then return null; end if;
 begin d:=substring(p_action from 23)::jsonb; exception when others then return null; end;
 if jsonb_typeof(d)<>'object' or d->>'version'<>'1' or coalesce(d->>'attempt','')!~'^[1-9][0-9]{0,3}$' then return null; end if;
 return d;
end $$;

create function public.distribution_review_state(p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; d jsonb;
begin
 select * into u from public.game_build_uploads where id=p_id;
 if not found then raise exception 'upload_not_found'; end if;
 select public.distribution_validation_event(action) into d from public.game_build_review_events
 where upload_id=p_id and public.distribution_validation_event(action)->>'attempt'=u.attempts::text order by id desc limit 1;
 return jsonb_build_object('status',u.status,'gameVersionId',case when u.status='completed' then u.version_id end,
 'updatedAt',u.updated_at,'attempts',u.attempts,'errorCode',u.error_code,'diagnostic',d,'expiresAt',u.expires_at,
 'reviewDecision',(select decision from public.game_build_reviews where upload_id=p_id));
end $$;

create function public.distribution_validation_start(p_id uuid,p_lease uuid) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads;
begin
 select * into u from public.game_build_uploads where id=p_id for update;
 if p_lease is null or u.lease_until is null or u.id is null or u.status<>'validating' or u.lease_token is distinct from p_lease or u.lease_until<=now() then raise exception 'lease_lost'; end if;
 if not exists(select 1 from public.game_build_review_events where upload_id=p_id and action='validation_started:'||u.attempts::text) then
 insert into public.game_build_review_events(upload_id,action) values(p_id,'validation_started:'||u.attempts::text); end if;
end $$;

create function public.distribution_validation_fail(p_id uuid,p_lease uuid,p_code text,p_retry boolean,p_phase text,p_diagnostic jsonb) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; d jsonb;
begin
 if p_phase is null or p_code is null or p_phase not in ('scratch','download','extract','checkpoint','artifacts','complete')
 or p_code not in ('validation_failed','validation_timeout','storage_error','database_error','service_unavailable','version_conflict','artifact_conflict','forbidden','upload_expired')
 or jsonb_typeof(p_diagnostic) is distinct from 'object'
 or (p_diagnostic-array['version','kind','reason','path','field','phase'])<>'{}'::jsonb
 or coalesce(p_diagnostic->>'kind','') not in ('submission','internal','infrastructure','unknown')
 or coalesce(p_diagnostic->>'reason','')!~'^[A-Z_]{1,80}$'
 or length(coalesce(p_diagnostic->>'path',''))>180 or length(coalesce(p_diagnostic->>'field',''))>120
 or (p_diagnostic ? 'path' and (jsonb_typeof(p_diagnostic->'path')<>'string' or p_diagnostic->>'path' !~ '^[[:alnum:] ._()/@+-]+$' or p_diagnostic->>'path' ~ '(^/|^[A-Za-z]:|[A-Za-z0-9_-]{32,}|npm_|ghp_|github_pat_|eyJ)'))
 or (p_diagnostic ? 'field' and (jsonb_typeof(p_diagnostic->'field')<>'string' or p_diagnostic->>'field' !~ '^(\$|/(schemaVersion|integrationVersion|gameId|version|client|capabilities|entrypoints|local|online|players|min|max|requirements|crossOriginIsolation)(/(client|capabilities|entrypoints|local|online|players|min|max|requirements|crossOriginIsolation))*)$'))
 then raise exception 'invalid_request'; end if;
 select * into u from public.game_build_uploads where id=p_id for update;
 if p_lease is null or u.lease_until is null or u.id is null or u.status<>'validating' or u.lease_token is distinct from p_lease or u.lease_until<=now() then raise exception 'lease_lost'; end if;
 d:=p_diagnostic||jsonb_build_object('version',1,'attempt',u.attempts,'phase',p_phase,'code',p_code);
 if length(d::text)>1800 then raise exception 'invalid_request'; end if;
 insert into public.game_build_review_events(upload_id,action) values(p_id,'validation_diagnostic:'||d::text);
 perform public.distribution_fail(p_id,p_lease,p_code,p_retry);
end $$;

create function public.distribution_validation_complete(p_id uuid,p_lease uuid) returns public.game_build_uploads
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads;
begin
 select * into u from public.game_build_uploads where id=p_id for update;
 if p_lease is null or u.lease_until is null or u.id is null or u.status<>'validating' or u.lease_token is distinct from p_lease or u.lease_until<=now() then raise exception 'lease_lost'; end if;
 u:=public.distribution_complete(p_id,p_lease);
 insert into public.game_build_review_events(upload_id,action) values(p_id,
 case when u.status='completed' then 'validation_completed:'||u.attempts::text else
 'validation_diagnostic:'||jsonb_build_object('version',1,'attempt',u.attempts,'phase','complete','code','version_conflict','kind','submission','reason','VERSION_CONFLICT')::text end);
 return u;
end $$;

create function public.distribution_retry_validation(p_actor uuid,p_id uuid,p_attempt integer) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; d jsonb;
begin
 -- actor NULL désigne uniquement l'outil local privilégié, jamais un navigateur.
 if p_actor is not null and not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden'; end if;
 select * into u from public.game_build_uploads where id=p_id for update;
 if not found then raise exception 'upload_not_found'; end if;
 if p_attempt is null or p_attempt<>u.attempts then raise exception 'invalid_state'; end if;
 if exists(select 1 from public.game_build_reviews where upload_id=p_id and decision in ('rejected','archived','published')) then raise exception 'invalid_state'; end if;
 if u.status='queued' then return public.distribution_review_state(p_id); end if;
 if u.expires_at<=now() or u.cleaned_at is not null or u.staging_etag is null then raise exception 'upload_expired'; end if;
 d:=public.distribution_review_state(p_id)->'diagnostic';
 if u.status<>'failed' or u.attempts>=(u.policy->>'maxAttempts')::integer or not
 (coalesce(d->>'kind','') in ('internal','infrastructure') or u.error_code in ('storage_error','database_error','service_unavailable')) then raise exception 'retry_not_allowed'; end if;
 if u.created_by is null or not public.distribution_can_upload(u.created_by,u.game_id) then raise exception 'forbidden'; end if;
 update public.game_build_uploads set status='queued',error_code=null,updated_at=now() where id=p_id;
 update public.game_build_outbox set dispatched_at=null where upload_id=p_id;
 insert into public.game_build_review_events(upload_id,actor,action) values(p_id,p_actor,'validation_retry_requested:'||u.attempts::text);
 return public.distribution_review_state(p_id);
end $$;

create function public.distribution_request_build_correction(p_actor uuid,p_id uuid,p_reason text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; r public.game_build_reviews; g uuid;
begin
 if p_actor is null or not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden'; end if;
 if p_reason is null or length(btrim(p_reason)) not between 1 and 2000 then raise exception 'invalid_request'; end if;
 select game_id into g from public.game_build_uploads where id=p_id;
 perform 1 from public.games where id=g for update;
 select * into u from public.game_build_uploads where id=p_id for update;
 if not found then raise exception 'upload_not_found'; end if;
 insert into public.game_build_reviews(upload_id) values(p_id) on conflict do nothing;
 select * into r from public.game_build_reviews where upload_id=p_id for update;
 if u.status not in ('queued','completed','failed','expired') or r.decision in ('rejected','archived','published') then raise exception 'invalid_state'; end if;
 if r.decision='pending' and r.reason=btrim(p_reason) and r.reviewed_at is null then return public.distribution_review_snapshot(p_id); end if;
 if u.status='queued' then update public.game_build_uploads set status='failed',error_code='correction_requested',updated_at=now() where id=p_id; end if;
 update public.game_build_reviews set reason=btrim(p_reason),decision='pending',checklist='{}',reviewed_at=null,updated_at=now() where upload_id=p_id;
 insert into public.game_build_review_events(upload_id,actor,action) values(p_id,p_actor,'correction_requested');
 return public.distribution_review_snapshot(p_id);
end $$;

create function public.distribution_prepare_build_correction(p_actor uuid,p_game uuid,p_upload uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d public.game_submission_drafts; u public.game_build_uploads;
begin
 perform public.account_assert_allowed(p_actor);
 perform 1 from public.games where id=p_game for update;
 select * into u from public.game_build_uploads where id=p_upload and game_id=p_game for update;
 if not found or u.created_by is distinct from p_actor or not public.distribution_can_upload(p_actor,p_game) then raise exception 'forbidden'; end if;
 if u.status not in ('failed','expired') and not exists(select 1 from public.game_build_review_events where upload_id=p_upload and action='correction_requested') then raise exception 'invalid_state'; end if;
 if exists(select 1 from public.game_build_reviews where upload_id=p_upload and decision in ('rejected','archived','published')) then raise exception 'invalid_state'; end if;
 if exists(select 1 from public.games where id=p_game and is_published) then return jsonb_build_object('gameId',p_game,'mode','update'); end if;
 perform public.distribution_owned_draft(p_actor,p_game);
 select * into d from public.game_submission_drafts where game_id=p_game for update;
 if u.status not in ('failed','expired') and not exists(select 1 from public.game_build_review_events where upload_id=p_upload and action='correction_requested') then raise exception 'invalid_state'; end if;
 if exists(select 1 from public.game_build_reviews where upload_id=p_upload and decision in ('rejected','archived','published')) then raise exception 'invalid_state'; end if;
 if d.upload_id is null then return public.distribution_draft_snapshot(p_game); end if;
 if d.upload_id is distinct from p_upload then raise exception 'draft_conflict'; end if;
 update public.game_submission_drafts set upload_id=null,request_id=gen_random_uuid(),file_info=null,part_hashes='{}',revision=revision+1,updated_at=now() where game_id=p_game;
 insert into public.game_build_review_events(upload_id,actor,action) values(p_upload,p_actor,'corrected_build_prepared');
 return public.distribution_draft_snapshot(p_game);
end $$;

create function public.distribution_record_playtest(p_actor uuid,p_id uuid,p_request uuid,p_code text) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; event text;
begin
 if p_actor is null or not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden'; end if;
 if p_request is null or p_code is null or p_code not in ('hello_timeout','handshake_timeout','game_ready_timeout','launch_expired','launch_unavailable','unexpected_navigation','unknown') then raise exception 'invalid_request'; end if;
 select * into u from public.game_build_uploads where id=p_id for update;
 if not found then raise exception 'upload_not_found'; end if;
 if u.status<>'completed' then raise exception 'invalid_state'; end if;
 event:='playtest_diagnostic:'||jsonb_build_object('version',1,'request',p_request,'phase','playtest','reason','GAME_LOAD_FAILED','code',p_code,'attempt',u.attempts)::text;
 if not exists(select 1 from public.game_build_review_events where upload_id=p_id and action=event) then
 insert into public.game_build_review_events(upload_id,actor,action) values(p_id,p_actor,event); end if;
end $$;

do $$ declare f record; begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in
 ('distribution_validation_event','distribution_review_state','distribution_validation_start','distribution_validation_fail','distribution_validation_complete','distribution_retry_validation','distribution_request_build_correction','distribution_prepare_build_correction','distribution_record_playtest') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
