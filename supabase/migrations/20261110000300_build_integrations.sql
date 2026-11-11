begin;
set local lock_timeout='5s';

create function public.distribution_integration_event(p_action text,p_prefix text) returns jsonb
language plpgsql immutable security invoker set search_path=pg_catalog,public as $$
declare d jsonb;
begin
 if length(p_action)>1024 or left(p_action,length(p_prefix))<>p_prefix then return null; end if;
 begin d:=substring(p_action from length(p_prefix)+1)::jsonb;exception when others then return null;end;
 if jsonb_typeof(d)<>'object' then return null;end if;
 return d;
end $$;

create function public.distribution_record_integration_scan(p_id uuid,p_lease uuid,p_scan jsonb) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; event text;
begin
 if jsonb_typeof(p_scan) is distinct from 'object' or p_scan-array['signals','complete','bytes']<>'{}'::jsonb
 or jsonb_typeof(p_scan->'signals') is distinct from 'boolean' or jsonb_typeof(p_scan->'complete') is distinct from 'boolean'
 or jsonb_typeof(p_scan->'bytes') is distinct from 'number' or coalesce(p_scan->>'bytes','')!~'^[0-9]{1,8}$' then raise exception 'invalid_request';end if;
 if (p_scan->>'bytes')::integer>8388608 then raise exception 'invalid_request';end if;
 select * into u from public.game_build_uploads where id=p_id for update;
 if p_lease is null or u.lease_until is null or u.status is distinct from 'validating' or u.lease_token is distinct from p_lease or u.lease_until<=now() then raise exception 'lease_lost';end if;
 event:='integration_scan:'||(p_scan||jsonb_build_object('attempt',u.attempts))::text;
 if not exists(select 1 from public.game_build_review_events where upload_id=p_id and action=event) then
 insert into public.game_build_review_events(upload_id,action) values(p_id,event);end if;
end $$;

create function public.distribution_record_integration_observation(p_actor uuid,p_id uuid,p_launch uuid,p_generation uuid,p_control_hash text,p_mode text,p_protocol integer) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; l public.game_launch_sessions; manifest jsonb;event text;
begin
 if p_actor is null or not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden';end if;
 if p_mode is null or p_mode not in ('classic','sdk') or p_control_hash is null or p_control_hash!~'^[a-f0-9]{64}$'
 or (p_mode='sdk' and (p_protocol is null or p_protocol not in (1,2))) or (p_mode='classic' and p_protocol is not null) then raise exception 'invalid_request';end if;
 -- Même ordre de verrouillage que la revue : jeu, puis upload.
 perform 1 from public.games where id=(select game_id from public.game_build_uploads where id=p_id) for update;
 select * into u from public.game_build_uploads where id=p_id for update;
 if not found or u.status<>'completed' then raise exception 'invalid_state';end if;
 select v.manifest into manifest from public.game_versions v where id=u.version_id;
 if coalesce(manifest->'integration'->>'mode','sdk')<>p_mode then raise exception 'invalid_request';end if;
 select * into l from public.game_launch_sessions where id=p_launch;
 if not found or l.issued_by is distinct from p_actor or l.version_id<>u.version_id or l.generation is distinct from p_generation
 or l.control_hash<>p_control_hash or l.revoked_at is not null or l.expires_at<=now() then raise exception 'launch_expired';end if;
 event:='integration_observed:'||jsonb_build_object('mode',p_mode,'protocol',p_protocol,'launch',p_launch)::text;
 if not exists(select 1 from public.game_build_review_events where upload_id=p_id and action=event) then
 insert into public.game_build_review_events(upload_id,actor,action) values(p_id,p_actor,event);end if;
end $$;

create function public.distribution_admin_integration(p_actor uuid,p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads;m jsonb;s jsonb;o jsonb;observed_at timestamptz;
begin
 if p_actor is null or not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden';end if;
 select * into u from public.game_build_uploads where id=p_id;
 if not found then raise exception 'upload_not_found';end if;
 select manifest into m from public.game_versions where id=u.version_id;
 m:=coalesce(m,u.checkpoint->'manifest');
 select public.distribution_integration_event(action,'integration_scan:') into s from public.game_build_review_events
 where upload_id=p_id and public.distribution_integration_event(action,'integration_scan:')->>'attempt'=u.attempts::text order by id desc limit 1;
 select public.distribution_integration_event(action,'integration_observed:'),created_at into o,observed_at from public.game_build_review_events
 where upload_id=p_id and public.distribution_integration_event(action,'integration_observed:') is not null order by id desc limit 1;
 return jsonb_build_object('declaredMode',m->'integration'->>'mode','declaredVersion',m->'integration'->>'sdkVersion',
 'scan',case when s is not null then s-'attempt' end,
 'observation',case when o is not null then jsonb_build_object('mode',o->>'mode','protocol',o->'protocol','at',observed_at) end);
end $$;

-- Le contrat de décision reste identique ; les manifestes historiques restent inchangés.
alter function public.distribution_review_action(uuid,uuid,text,jsonb,text,uuid) rename to distribution_review_action_core;
create function public.distribution_review_action(p_actor uuid,p_id uuid,p_action text,p_checklist jsonb default '{}',p_reason text default null,p_submission uuid default null) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare m jsonb;r jsonb;
begin
 if p_actor is null or not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden';end if;
 perform 1 from public.games where id=(select game_id from public.game_build_uploads where id=p_id) for update;
 perform 1 from public.game_build_uploads where id=p_id for update;
 select v.manifest into m from public.game_versions v join public.game_build_uploads u on u.version_id=v.id where u.id=p_id;
 if p_action='publish' and m ? 'integration' then
  r:=public.distribution_admin_integration(p_actor,p_id);
  if r->'observation'->>'mode' is distinct from m->'integration'->>'mode' then raise exception 'integration_not_verified';end if;
 end if;
 return public.distribution_review_action_core(p_actor,p_id,p_action,p_checklist,p_reason,p_submission);
end $$;

do $$declare f record;begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in
 ('distribution_integration_event','distribution_record_integration_scan','distribution_record_integration_observation','distribution_admin_integration','distribution_review_action','distribution_review_action_core') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
