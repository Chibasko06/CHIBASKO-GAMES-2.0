begin;
set local lock_timeout='5s';
alter table public.developer_contacts add column email_revision uuid not null default gen_random_uuid();
alter table public.developer_contacts add column email_verified_at timestamptz;
-- Les champs de preuve ne peuvent pas être écrits depuis un client authentifié.
revoke insert,update on public.developer_contacts from authenticated;
grant insert(user_id,first_name,last_name,contact_email,public_name,website,other_contact),
 update(first_name,last_name,contact_email,public_name,website,other_contact) on public.developer_contacts to authenticated;

create table public.developer_email_challenges(
 id uuid primary key,
 user_id uuid not null references public.developer_contacts(user_id) on delete cascade,
 email_revision uuid not null,
 destination_hash text not null check(destination_hash ~ '^[0-9a-f]{64}$'),
 code_hash text check(code_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '10 minutes',
 attempts integer not null default 0 check(attempts between 0 and 5),
 consumed_at timestamptz,
 invalidated_at timestamptz
);
create index developer_email_actor_time on public.developer_email_challenges(user_id,created_at desc);
create index developer_email_destination_time on public.developer_email_challenges(destination_hash,created_at desc);
alter table public.developer_email_challenges enable row level security;
revoke all on public.developer_email_challenges from public,anon,authenticated;
grant select,insert,update,delete on public.developer_email_challenges to service_role;

alter table public.game_submission_notifications alter column submission_id drop not null;
alter table public.game_submission_notifications add column developer_user_id uuid references public.developer_contacts(user_id) on delete set null;
alter table public.game_submission_notifications add column recipient_revision uuid;
alter table public.game_submission_notifications add column verification_id uuid unique references public.developer_email_challenges(id) on delete cascade;
alter table public.game_submission_notifications add column delivery_hold text check(delivery_hold in ('unverified_email','email_changed','legacy_recipient','verification_expired'));
alter table public.game_submission_notifications add constraint notification_subject check(
 (submission_id is not null and verification_id is null) or
 (submission_id is null and verification_id is not null and event_key='verify-email'));
do $$ begin
 if exists(select 1 from public.game_submission_notifications where event_key<>'internal' and sent_at is null and lease_until>clock_timestamp()) then raise exception 'developer_email_lease_active'; end if;
end $$;
-- Les messages historiques acquittés restent intacts. Aucune décision ancienne
-- n'est redirigée vers une adresse nouvelle ni renvoyée automatiquement.
update public.game_submission_notifications set delivery_hold='legacy_recipient',last_error='attention_required'
where event_key<>'internal' and sent_at is null;

create function public.distribution_professional_email_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then new.contact_email:=lower(btrim(new.contact_email));new.email_verified_at:=null;return new;end if;
 new.contact_email:=lower(btrim(new.contact_email));
 if new.contact_email is distinct from old.contact_email then
  if exists(select 1 from public.game_submission_notifications where developer_user_id=old.user_id and sent_at is null and lease_until>clock_timestamp()) then raise exception 'email_delivery_in_progress';end if;
  new.email_revision:=gen_random_uuid();new.email_verified_at:=null;
  update public.developer_email_challenges set invalidated_at=coalesce(invalidated_at,clock_timestamp()),code_hash=null where user_id=old.user_id and consumed_at is null;
  update public.game_submission_notifications set delivery_hold='email_changed',last_error='attention_required',message=case when verification_id is not null then null else message end
  where developer_user_id=old.user_id and sent_at is null;
 end if;
 return new;
end $$;
revoke all on function public.distribution_professional_email_guard() from public,anon,authenticated;
create trigger professional_email_guard before insert or update on public.developer_contacts for each row execute function public.distribution_professional_email_guard();

create function public.distribution_require_verified_email(p_actor uuid) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 perform public.account_assert_allowed(p_actor);
 perform 1 from public.developer_contacts where user_id=p_actor and email_verified_at is not null for share;
 if not found then raise exception 'developer_email_unverified';end if;
end $$;

create function public.distribution_developer_email_status(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare c public.developer_contacts; v public.developer_email_challenges; retry_at timestamptz;
begin
 perform public.account_assert_allowed(p_actor);if p_actor is null then raise exception 'unauthorized';end if;
 select * into c from public.developer_contacts where user_id=p_actor;
 if not found then return jsonb_build_object('verified',false,'profileRequired',true);end if;
 select * into v from public.developer_email_challenges where user_id=p_actor and email_revision=c.email_revision order by created_at desc,id limit 1;
 select max(created_at)+interval '60 seconds' into retry_at from public.developer_email_challenges where user_id=p_actor;
 return jsonb_build_object('verified',c.email_verified_at is not null,'verifiedAt',c.email_verified_at,'revision',c.email_revision,'profileRequired',false,
  'retryAfter',greatest(0,ceil(extract(epoch from retry_at-clock_timestamp())))::integer,
  'challenge',case when v.id is not null and v.consumed_at is null and v.invalidated_at is null and v.expires_at>clock_timestamp() and v.attempts<5 then
    jsonb_build_object('id',v.id,'expiresAt',v.expires_at,'attemptsRemaining',5-v.attempts,'acceptedByProvider',exists(select 1 from public.game_submission_notifications where verification_id=v.id and sent_at is not null)) else null end);
end $$;

create function public.distribution_reserve_developer_email(p_actor uuid,p_id uuid,p_revision uuid,p_destination_hash text,p_code_hash text,p_message jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare c public.developer_contacts; existing public.developer_email_challenges;
begin
 perform public.account_assert_allowed(p_actor);
 select * into c from public.developer_contacts where user_id=p_actor for update;
 if not found then raise exception 'developer_profile_required';end if;
 if c.email_verified_at is not null then return public.distribution_developer_email_status(p_actor);end if;
 if p_revision is distinct from c.email_revision then raise exception 'email_revision_changed';end if;
 if p_id is null or p_destination_hash is null or p_destination_hash !~ '^[0-9a-f]{64}$' or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$'
  or jsonb_typeof(p_message) is distinct from 'object' or (p_message-array['iv','tag','ciphertext','version'])<>'{}' or not(p_message ?& array['iv','tag','ciphertext','version']) or p_message->>'version' is distinct from '1'
  or coalesce(length(p_message->>'iv'),0)<>16 or coalesce(length(p_message->>'tag'),0)<>24 or coalesce(length(p_message->>'ciphertext'),0) not between 10 and 65536 then raise exception 'invalid_request';end if;
 select * into existing from public.developer_email_challenges where id=p_id;
 if found then
  if existing.user_id<>p_actor or existing.email_revision<>p_revision then raise exception 'request_conflict';end if;
  return public.distribution_developer_email_status(p_actor);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('developer-email-destination:'||p_destination_hash,0));
 if exists(select 1 from public.developer_email_challenges where user_id=p_actor and created_at>clock_timestamp()-interval '60 seconds')
  or (select count(*) from public.developer_email_challenges where (user_id=p_actor or destination_hash=p_destination_hash) and created_at>clock_timestamp()-interval '1 hour')>=3
  or (select count(*) from public.developer_email_challenges where (user_id=p_actor or destination_hash=p_destination_hash) and created_at>clock_timestamp()-interval '24 hours')>=10 then raise exception 'rate_limited';end if;
 if exists(select 1 from public.game_submission_notifications where developer_user_id=p_actor and verification_id is not null and sent_at is null and lease_until>clock_timestamp()) then raise exception 'email_delivery_in_progress';end if;
 update public.developer_email_challenges set invalidated_at=clock_timestamp(),code_hash=null where user_id=p_actor and consumed_at is null and invalidated_at is null;
 update public.game_submission_notifications set delivery_hold='verification_expired',last_error='attention_required',message=null where developer_user_id=p_actor and verification_id is not null and sent_at is null;
 insert into public.developer_email_challenges(id,user_id,email_revision,destination_hash,code_hash) values(p_id,p_actor,p_revision,p_destination_hash,p_code_hash);
 insert into public.game_submission_notifications(id,submission_id,event_key,contact_snapshot,developer_user_id,recipient_revision,verification_id,message)
 values(p_id,null,'verify-email','{}'::jsonb,p_actor,p_revision,p_id,p_message);
 return public.distribution_developer_email_status(p_actor);
end $$;

create function public.distribution_confirm_developer_email(p_actor uuid,p_id uuid,p_code_hash text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare c public.developer_contacts;v public.developer_email_challenges;
begin
 perform public.account_assert_allowed(p_actor);
 select * into c from public.developer_contacts where user_id=p_actor for update;
 select * into v from public.developer_email_challenges where id=p_id and user_id=p_actor for update;
 if not found or v.email_revision is distinct from c.email_revision or v.invalidated_at is not null or v.consumed_at is not null then return jsonb_build_object('verified',false,'code','verification_invalid');end if;
 if v.expires_at<=clock_timestamp() then return jsonb_build_object('verified',false,'code','verification_expired');end if;
 if v.attempts>=5 then return jsonb_build_object('verified',false,'code','verification_locked');end if;
 update public.developer_email_challenges set attempts=attempts+1 where id=v.id;
 if p_code_hash is null or v.code_hash is distinct from p_code_hash then return jsonb_build_object('verified',false,'code',case when v.attempts=4 then 'verification_locked' else 'verification_invalid' end,'attemptsRemaining',4-v.attempts);end if;
 update public.developer_email_challenges set consumed_at=clock_timestamp(),code_hash=null where id=v.id;
 update public.developer_contacts set email_verified_at=clock_timestamp() where user_id=p_actor;
 return public.distribution_developer_email_status(p_actor);
end $$;

-- Les gardes sont dans PostgreSQL, y compris pour les appels serveur directs.
do $$ declare name text;definition text;begin
 foreach name in array array['distribution_create_upload(uuid,uuid,text,bigint,uuid,jsonb)','distribution_submit_editorial(uuid,uuid,text,text,uuid[],text)',
  'distribution_submit_catalogue(uuid,uuid,text,jsonb,text)','distribution_submit_external(uuid,uuid,uuid,text,text,text)',
  'distribution_prepare_build_correction(uuid,uuid,uuid)','distribution_restart_draft_upload(uuid,uuid)'] loop
  select pg_get_functiondef(('public.'||name)::regprocedure) into definition;
  if position('perform public.account_assert_allowed(p_actor);' in definition)=0 then raise exception 'unknown_verified_email_contract';end if;
  execute replace(definition,'perform public.account_assert_allowed(p_actor);','perform public.account_assert_allowed(p_actor); perform public.distribution_require_verified_email(p_actor);');
 end loop;
end $$;
create function public.distribution_guard_verified_submission() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare actor uuid;begin
 if tg_table_name='game_build_uploads' then actor:=new.created_by;
 elsif tg_table_name='game_external_revisions' then actor:=new.developer_id;
 elsif new.build_upload_id is not null then select created_by into actor from public.game_build_uploads where id=new.build_upload_id;
 else return new;end if;
 perform public.distribution_require_verified_email(actor);return new;
end $$;
create trigger verified_email_upload before insert on public.game_build_uploads for each row execute function public.distribution_guard_verified_submission();
create trigger verified_email_submission before insert on public.game_submissions for each row execute function public.distribution_guard_verified_submission();
create trigger verified_email_external before insert on public.game_external_revisions for each row execute function public.distribution_guard_verified_submission();

create or replace function public.distribution_queue_developer_email(p_submission uuid,p_event text,p_key text,p_reason text default null)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare c public.developer_contacts;game uuid;begin
 if p_event not in ('received','correction','accepted','rejected','published') then raise exception 'invalid_request';end if;
 select profile.* into c from public.game_submissions s left join public.game_build_uploads u on u.id=s.build_upload_id
 left join public.game_external_revisions r on r.submission_id=s.id join public.developer_contacts profile on profile.user_id=coalesce(u.created_by,r.developer_id) where s.id=p_submission;
 select coalesce(u.game_id,r.game_id) into game from public.game_submissions s left join public.game_build_uploads u on u.id=s.build_upload_id left join public.game_external_revisions r on r.submission_id=s.id where s.id=p_submission;
 if game is null or c.user_id is null then return;end if;
 insert into public.game_submission_notifications(submission_id,contact_snapshot,event_key,notification,developer_user_id,recipient_revision,delivery_hold,last_error)
 values(p_submission,public.distribution_contact_json(c),p_key,jsonb_build_object('event',p_event,'gameId',game,'recipient',case when c.email_verified_at is not null then c.contact_email end,'reason',p_reason),c.user_id,c.email_revision,
 case when c.email_verified_at is null then 'unverified_email' end,case when c.email_verified_at is null then 'attention_required' end)
 on conflict(submission_id,event_key) do nothing;
end $$;

-- La route authentifie déjà l'acteur auprès d'Auth. La fiche s'appuie ensuite sur
-- le profil applicatif existant, sans nouvelle permission de lecture Auth.
do $$ declare definition text;begin
 select pg_get_functiondef('public.distribution_developer_profile(uuid,jsonb)'::regprocedure) into definition;
 if position('select 1 from auth.users where id=p_actor' in definition)=0 then raise exception 'unknown_developer_profile_contract';end if;
 execute replace(definition,'select 1 from auth.users where id=p_actor','select 1 from public.profiles where id=p_actor');
end $$;

create function public.distribution_notification_recipient_allowed(p_id uuid) returns boolean
language sql stable security invoker set search_path=pg_catalog,public as $$
 select exists(select 1 from public.game_submission_notifications n left join public.developer_contacts c on c.user_id=n.developer_user_id
 left join public.developer_email_challenges v on v.id=n.verification_id
 where n.id=p_id and n.delivery_hold is null and (n.event_key='internal' or
  (c.email_revision=n.recipient_revision and ((n.verification_id is null and c.email_verified_at is not null and n.notification->>'recipient'=c.contact_email)
   or (n.verification_id is not null and v.invalidated_at is null and v.consumed_at is null and v.expires_at>clock_timestamp() and v.attempts<5)))))
$$;
-- L'ancien claim interne reste inchangé. Le claim étendu ne prend jamais les codes.
do $$ declare definition text;begin
 select pg_get_functiondef('public.distribution_claim_submission_email_events(uuid)'::regprocedure) into definition;
 if position('where sent_at is null and last_error' in definition)=0 then raise exception 'unknown_email_claim_contract';end if;
 execute replace(definition,'where sent_at is null and last_error','where verification_id is null and public.distribution_notification_recipient_allowed(id) and sent_at is null and last_error');
end $$;

create function public.distribution_claim_developer_verification(p_actor uuid default null) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare n public.game_submission_notifications;begin
 select * into n from public.game_submission_notifications where verification_id is not null and sent_at is null and delivery_hold is null and attempts<3
 and next_attempt_at<=clock_timestamp() and (lease_until is null or lease_until<clock_timestamp()) and (p_actor is null or developer_user_id=p_actor)
 and public.distribution_notification_recipient_allowed(id) order by created_at,id for update skip locked limit 1;
 if not found then return null;end if;
 update public.game_submission_notifications set lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,clock_timestamp()) where id=n.id returning * into n;
 return jsonb_build_object('id',n.id,'lease',n.lease_token,'message',n.message,'verification',jsonb_build_object('actor',n.developer_user_id,'revision',n.recipient_revision,'challenge',n.verification_id));
end $$;

create or replace function public.distribution_prepare_submission_email(p_id uuid,p_lease uuid,p_message jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare result jsonb;n public.game_submission_notifications;begin
 select * into n from public.game_submission_notifications where id=p_id for update;
 if not found or n.lease_token is distinct from p_lease or n.lease_until<=clock_timestamp() or n.sent_at is not null then raise exception 'lease_lost';end if;
 if not public.distribution_notification_recipient_allowed(p_id) then raise exception 'email_revision_changed';end if;
 if n.verification_id is not null and p_message is distinct from n.message then raise exception 'invalid_request';end if;
 update public.game_submission_notifications set message=coalesce(message,p_message) where id=p_id returning message into result;return result;
end $$;

create function public.distribution_cleanup_developer_email() returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public.game_submission_notifications set message=null,delivery_hold='verification_expired',last_error=case when sent_at is null then 'attention_required' else last_error end
 where id in(select n.id from public.game_submission_notifications n join public.developer_email_challenges v on v.id=n.verification_id where v.expires_at<=clock_timestamp()
  and (n.message is not null or n.delivery_hold is null) and (n.lease_until is null or n.lease_until<clock_timestamp()) order by v.expires_at,n.id limit 100);
 update public.developer_email_challenges set code_hash=null where id in(select id from public.developer_email_challenges where code_hash is not null and expires_at<=clock_timestamp() order by expires_at limit 100);
 delete from public.developer_email_challenges where id in(select id from public.developer_email_challenges where created_at<clock_timestamp()-interval '30 days' order by created_at limit 100)
 and not exists(select 1 from public.game_submission_notifications n where n.verification_id=developer_email_challenges.id and n.lease_until>clock_timestamp());
end $$;

do $$ declare name text;begin
 foreach name in array array['distribution_require_verified_email(uuid)','distribution_developer_email_status(uuid)','distribution_reserve_developer_email(uuid,uuid,uuid,text,text,jsonb)',
 'distribution_confirm_developer_email(uuid,uuid,text)','distribution_guard_verified_submission()','distribution_notification_recipient_allowed(uuid)','distribution_claim_developer_verification(uuid)','distribution_cleanup_developer_email()'] loop
 execute 'revoke all on function public.'||name||' from public,anon,authenticated';execute 'grant execute on function public.'||name||' to service_role';
 end loop;
end $$;
commit;
