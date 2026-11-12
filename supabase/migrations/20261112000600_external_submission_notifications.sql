begin;
set local lock_timeout='5s';

create function public.distribution_queue_external_submission_email() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 insert into public.game_submission_notifications(submission_id,contact_snapshot)
 select new.submission_id,public.distribution_contact_json(c)
 from public.developer_contacts c where c.user_id=new.developer_id
 on conflict (submission_id) do nothing;
 return new;
end $$;

revoke all on function public.distribution_queue_external_submission_email() from public,anon,authenticated;
grant execute on function public.distribution_queue_external_submission_email() to service_role;

create trigger queue_external_submission_email after insert on public.game_external_revisions
for each row execute function public.distribution_queue_external_submission_email();

create or replace function public.distribution_claim_submission_email(p_submission uuid default null) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare n public.game_submission_notifications; result jsonb;
begin
 update public.game_submission_notifications set last_error='attention_required'
 where submission_id in(select submission_id from public.game_submission_notifications where sent_at is null and (lease_until is null or lease_until<=now())
 and (attempts>=8 or first_attempt_at<now()-interval '23 hours') and last_error is distinct from 'attention_required' order by created_at,submission_id for update skip locked limit 100);
 select * into n from public.game_submission_notifications
 where sent_at is null and last_error is distinct from 'attention_required' and attempts<8
 and exists(select 1 from public.game_submissions s
   left join public.game_build_uploads u on u.id=s.build_upload_id
   left join public.game_external_revisions r on r.submission_id=s.id
   where s.id=game_submission_notifications.submission_id
     and coalesce(u.created_by,r.developer_id) is not null
     and not public.distribution_account_pending(coalesce(u.created_by,r.developer_id)))
 and (first_attempt_at is null or first_attempt_at>now()-interval '23 hours')
 and next_attempt_at<=now() and (lease_until is null or lease_until<=now()) and (p_submission is null or submission_id=p_submission)
 order by next_attempt_at,created_at,submission_id for update skip locked limit 1;
 if not found then return null; end if;
 update public.game_submission_notifications set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now())
 where submission_id=n.submission_id returning * into n;
 select jsonb_build_object('id',n.submission_id,'lease',n.lease_token,'message',n.message,'contact',n.contact_snapshot,'title',s.game_title,'version',u.version,'kind',coalesce(s.submission_kind,'new'),'uploadId',u.id,'externalRevisionId',r.id,'studio',s.name_or_studio)
 into result from public.game_submissions s
 left join public.game_build_uploads u on u.id=s.build_upload_id
 left join public.game_external_revisions r on r.submission_id=s.id
 where s.id=n.submission_id;
 return result;
end $$;
commit;
