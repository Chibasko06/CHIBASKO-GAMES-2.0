begin;
set local lock_timeout='5s';

create or replace function public.distribution_claim_submission_email(p_submission uuid default null) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare n public.game_submission_notifications; result jsonb;
begin
 update public.game_submission_notifications set last_error='attention_required'
 where submission_id in(select submission_id from public.game_submission_notifications where sent_at is null and (lease_until is null or lease_until<=now())
 and (attempts>=8 or first_attempt_at<now()-interval '23 hours') and last_error is distinct from 'attention_required' order by created_at,submission_id for update skip locked limit 100);
 select * into n from public.game_submission_notifications
 where sent_at is null and last_error is distinct from 'attention_required' and attempts<8
 and not exists(select 1 from public.game_submissions s join public.game_build_uploads u on u.id=s.build_upload_id
  where s.id=game_submission_notifications.submission_id and public.distribution_account_pending(u.created_by))
 and (first_attempt_at is null or first_attempt_at>now()-interval '23 hours')
 and next_attempt_at<=now() and (lease_until is null or lease_until<=now()) and (p_submission is null or submission_id=p_submission)
 order by next_attempt_at,created_at,submission_id for update skip locked limit 1;
 if not found then return null; end if;
 update public.game_submission_notifications set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now())
 where submission_id=n.submission_id returning * into n;
 select jsonb_build_object('id',n.submission_id,'lease',n.lease_token,'message',n.message,'contact',n.contact_snapshot,'title',s.game_title,'version',u.version,'kind',coalesce(s.submission_kind,'new'),'uploadId',u.id,'studio',s.name_or_studio)
 into result from public.game_submissions s join public.game_build_uploads u on u.id=s.build_upload_id where s.id=n.submission_id;
 return result;
end $$;
create or replace function public.distribution_finish_submission_email(p_id uuid,p_lease uuid,p_success boolean) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if p_success is null then raise exception 'invalid_request'; end if;
 update public.game_submission_notifications set sent_at=case when p_success then now() end,
 last_error=case when p_success then null when attempts>=8 then 'attention_required' else 'delivery_failed' end,
 lease_token=null,lease_until=null,next_attempt_at=now()+make_interval(secs=>least(3600,300*(2^greatest(attempts-1,0))::integer))
 where submission_id=p_id and lease_token=p_lease and lease_until>now() and sent_at is null;
 if not found then raise exception 'lease_lost'; end if;
end $$;
create function public.distribution_reject_submission_email(p_id uuid,p_lease uuid) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public.game_submission_notifications set last_error='attention_required',lease_token=null,lease_until=null
 where submission_id=p_id and lease_token=p_lease and lease_until>now() and sent_at is null;
 if not found then raise exception 'lease_lost'; end if;
end $$;
revoke all on function public.distribution_reject_submission_email(uuid,uuid) from public,anon,authenticated;
grant execute on function public.distribution_reject_submission_email(uuid,uuid) to service_role;

-- Seules les transitions techniques expirées peuvent franchir le verrou du compte.
do $$ declare definition text; anchor text:='actor:=(to_jsonb(new)->>tg_argv[0])::uuid;'; begin
 select pg_get_functiondef('public.distribution_account_write_guard()'::regprocedure) into definition;
 if position(anchor in definition)=0 then raise exception 'Guard de compte inconnu'; end if;
 definition:=replace(definition,anchor,anchor||$guard$
 if tg_table_name='game_build_uploads' and tg_op='UPDATE' then
 if current_setting('role',true) in ('service_role','none')
 and current_setting('chibasko.maintenance_upload',true)=new.id::text
 and (to_jsonb(new)-array['status','error_code','lease_token','lease_until','updated_at','staging_key'])=(to_jsonb(old)-array['status','error_code','lease_token','lease_until','updated_at','staging_key'])
 and new.lease_token is null and new.lease_until is null
 and ((old.status in ('created','uploading','finalizing') and old.expires_at<=now() and new.status='expired' and new.error_code='upload_expired')
 or (old.status='validating' and old.lease_until<=now() and new.status=case when old.attempts>=(old.policy->>'maxAttempts')::integer then 'failed' else 'queued' end and new.error_code='validation_timeout')) then return new; end if;
 end if;
$guard$);
 execute definition;
end $$;
create function public.distribution_maintenance_uploads() returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' set statement_timeout='5s' as $$
declare candidate record; item public.game_build_uploads; expired integer:=0; recovered integer:=0; skipped integer:=0;
begin
 if not pg_try_advisory_xact_lock(722,1) then return jsonb_build_object('alreadyRunning',true); end if;
 for candidate in select id from public.game_build_uploads where (status in ('created','uploading','finalizing') and expires_at<=now()) or (status='validating' and lease_until<=now()) order by updated_at,id limit 100 loop
  begin
   select * into item from public.game_build_uploads where id=candidate.id;
   -- L'ordre Auth puis upload correspond à la préparation de suppression.
   perform id from auth.users where id=item.created_by for key share nowait;
   select * into item from public.game_build_uploads where id=candidate.id for update skip locked;
   if not found then skipped:=skipped+1; continue; end if;
   perform set_config('chibasko.maintenance_upload',item.id::text,true);
   if item.status in ('created','uploading','finalizing') and item.expires_at<=now() then
    update public.game_build_uploads set status='expired',error_code='upload_expired',lease_token=null,lease_until=null,updated_at=now() where id=item.id;
    expired:=expired+1;
   elsif item.status='validating' and item.lease_until<=now() then
    update public.game_build_uploads set status=case when attempts>=(policy->>'maxAttempts')::integer then 'failed' else 'queued' end,error_code='validation_timeout',lease_token=null,lease_until=null,updated_at=now() where id=item.id;
    recovered:=recovered+1;
   end if;
  exception when lock_not_available then skipped:=skipped+1;
  end;
 end loop;
 perform set_config('chibasko.maintenance_upload','',true);
 return jsonb_build_object('expired',expired,'recovered',recovered,'skipped',skipped);
end $$;
revoke all on function public.distribution_maintenance_uploads() from public,anon,authenticated;
grant execute on function public.distribution_maintenance_uploads() to service_role;

create or replace function public.distribution_cleanup_previews() returns integer
language plpgsql security invoker set search_path=pg_catalog,public set statement_timeout='5s' as $$
declare n integer; begin
 delete from public.game_preview_sessions where id in(select id from public.game_preview_sessions where expires_at<=now() order by expires_at,id for update skip locked limit 100);
 get diagnostics n=row_count;return n;
end $$;
create or replace function public.distribution_cleanup_launches() returns integer
language plpgsql security invoker set search_path=pg_catalog,public set statement_timeout='5s' as $$
declare n integer; begin
 delete from public.game_launch_sessions where id in(select id from public.game_launch_sessions where expires_at<=now() or revoked_at<now()-interval '15 minutes' order by expires_at,id for update skip locked limit 100);
 get diagnostics n=row_count;return n;
end $$;
create or replace function public.contact_cleanup() returns void language sql security definer set search_path='' set statement_timeout='5s' as $$
 delete from public.contact_dispatches where id in(select id from public.contact_dispatches where expires_at<=now() order by expires_at,id for update skip locked limit 100);
$$;
create or replace function public.distribution_cleanup_sessions() returns boolean
language plpgsql security invoker set search_path=pg_catalog,public set statement_timeout='8s' as $$
begin
 if not pg_try_advisory_xact_lock(1667721069,1936028515) then return false; end if;
 perform public.distribution_cleanup_multiplayer();
 perform public.distribution_cleanup_online();
 return true;
end $$;

create or replace function public.distribution_cleanup_multiplayer() returns void
language plpgsql security invoker set search_path=pg_catalog,public set statement_timeout='5s' as $$
declare l public.multiplayer_lobbies; session_ref text;
begin
 for l in select * from public.multiplayer_lobbies where status<>'closed' and (expires_at<=clock_timestamp() or (status='waiting' and waiting_until<=clock_timestamp())) order by id for update skip locked limit 100 loop
  for session_ref in select session_id from public.multiplayer_lobby_rounds where lobby_id=l.id and finished_at is null loop perform public.distribution_close_online_session(session_ref); end loop;
  update public.multiplayer_lobbies set status='closed',revision=revision+1 where id=l.id;
 end loop;
 delete from public.multiplayer_lobbies where id in(select id from public.multiplayer_lobbies where status='closed' and expires_at<clock_timestamp()-interval '7 days' order by expires_at,id for update skip locked limit 100);
 delete from public.multiplayer_api_limits where ctid in(select ctid from public.multiplayer_api_limits where window_at<clock_timestamp()-interval '1 hour' for update skip locked limit 100);
end $$;
create or replace function public.distribution_cleanup_online() returns void
language plpgsql security invoker set search_path=pg_catalog,public set statement_timeout='5s' as $$
begin
 delete from public.game_connection_tickets where ctid in(select ctid from public.game_connection_tickets where expires_at<clock_timestamp()-interval '1 hour' for update skip locked limit 100);
 delete from public.game_exchange_limits where ctid in(select ctid from public.game_exchange_limits where window_start<clock_timestamp()-interval '1 hour' for update skip locked limit 100);
 delete from public.game_online_sessions where id in(select s.id from public.game_online_sessions s where s.status='closed' and s.closed_at<clock_timestamp()-interval '1 day'
  and not exists(select 1 from public.game_connection_tickets t where t.session_id=s.id)
  and not exists(select 1 from public.multiplayer_lobby_rounds r where r.session_id=s.id) order by s.closed_at,s.id for update skip locked limit 100);
end $$;

create function public.distribution_maintenance_health() returns jsonb
language sql security definer set search_path='' set statement_timeout='5s' as $$
 select jsonb_build_object(
 'notifications_pending',(select count(*) from (select 1 from public.game_submission_notifications where sent_at is null limit 1001) x),
 'notifications_attention',(select count(*) from (select 1 from public.game_submission_notifications where sent_at is null and last_error='attention_required' limit 1001) x),
 'notifications_oldest_seconds',coalesce((select greatest(0,extract(epoch from now()-min(created_at)))::bigint from public.game_submission_notifications where sent_at is null),0),
 'accounts_pending',(select count(*) from (select 1 from public.game_account_deletions where state not in('cancelled','completed') limit 1001) x),
 'accounts_attention',(select count(*) from (select 1 from public.game_account_deletions where attention_required and state not in('cancelled','completed') limit 1001) x),
 'accounts_review',(select count(*) from (select 1 from public.game_account_deletions where state='review_required' limit 1001) x),
 'expired_uploads',(select count(*) from (select 1 from public.game_build_uploads where (status in('created','uploading','finalizing') and expires_at<=now()) or (status='validating' and lease_until<=now()) limit 1001) x),
 'expired_contacts',(select count(*) from (select 1 from public.contact_dispatches where expires_at<=now() limit 1001) x));
$$;
revoke all on function public.distribution_maintenance_health() from public,anon,authenticated;
grant execute on function public.distribution_maintenance_health() to service_role;
create index game_submission_notifications_oldest_pending on public.game_submission_notifications(created_at) where sent_at is null;
do $$ declare definition text;anchor text:='delete from public.contact_dispatches where expires_at<=now();';begin
 select pg_get_functiondef('public.contact_reserve(uuid,text,text,text)'::regprocedure) into definition;
 if position(anchor in definition)=0 then raise exception 'Réservation contact inconnue'; end if;
 definition:=replace(definition,anchor,'delete from public.contact_dispatches where expires_at<=now() and (id=p_id or fingerprint=p_fingerprint);
 delete from public.contact_dispatches where id in(select id from public.contact_dispatches where expires_at<=now() order by expires_at,id limit 100);');
 execute definition;
end $$;

commit;
