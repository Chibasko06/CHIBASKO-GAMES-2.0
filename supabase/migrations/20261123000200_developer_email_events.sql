begin;
set local lock_timeout='5s';
do $$ begin
 if not exists(select 1 from pg_attribute where attrelid='auth.users'::regclass and attname='email_confirmed_at' and atttypid='timestamptz'::regtype and not attisdropped) then
  raise exception 'auth_email_confirmation_required';
 end if;
 if current_user<>'postgres' then
  raise exception 'migration_postgres_role_required';
 end if;
 if not has_column_privilege('postgres','auth.users','email','SELECT') or not has_column_privilege('postgres','auth.users','email_confirmed_at','SELECT') then
  raise exception 'auth_email_owner_permission_required';
 end if;
end $$;

-- L'identifiant historique reste inchangé : les reprises gardent leur clé Resend.
alter table public.game_submission_notifications add column id uuid;
update public.game_submission_notifications set id=submission_id;
alter table public.game_submission_notifications alter column id set default gen_random_uuid();
alter table public.game_submission_notifications alter column id set not null;
alter table public.game_submission_notifications drop constraint game_submission_notifications_pkey;
alter table public.game_submission_notifications add primary key(id);
alter table public.game_submission_notifications add column event_key text not null default 'internal';
alter table public.game_submission_notifications add column notification jsonb;
alter table public.game_submission_notifications add unique(submission_id,event_key);

create function public.distribution_notification_identity() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if new.event_key='internal' then new.id:=new.submission_id; end if;
 return new;
end $$;
revoke all on function public.distribution_notification_identity() from public,anon,authenticated;
create trigger notification_identity before insert on public.game_submission_notifications
for each row execute function public.distribution_notification_identity();

do $$ declare definition text; name text; begin
 foreach name in array array['distribution_queue_submission_email()','distribution_queue_external_submission_email()'] loop
  select pg_get_functiondef(('public.'||name)::regprocedure) into definition;
  execute replace(definition,'on conflict (submission_id) do nothing','on conflict do nothing');
 end loop;
 -- Les RPC de réservation/finalisation existantes travaillent désormais par événement.
 foreach name in array array['distribution_prepare_submission_email(uuid,uuid,jsonb)','distribution_finish_submission_email(uuid,uuid,boolean)','distribution_reject_submission_email(uuid,uuid)'] loop
  select pg_get_functiondef(('public.'||name)::regprocedure) into definition;
  if position('submission_id=p_id' in definition)=0 then raise exception 'unknown_email_contract'; end if;
  execute replace(definition,'submission_id=p_id','id=p_id');
 end loop;
 select pg_get_functiondef('public.distribution_claim_submission_email(uuid)'::regprocedure) into definition;
 definition:=replace(definition,'where submission_id in(select submission_id','where id in(select id');
 definition:=replace(definition,'where submission_id=n.submission_id','where id=n.id');
 definition:=replace(definition,'''id'',n.submission_id','''id'',n.id,''notification'',n.notification');
 -- Les anciens Workers ne réservent jamais un message destiné au développeur.
 definition:=replace(definition,'where sent_at is null and last_error','where event_key=''internal'' and sent_at is null and last_error');
 execute definition;
 definition:=replace(definition,'distribution_claim_submission_email(','distribution_claim_submission_email_events(');
 definition:=replace(definition,'where event_key=''internal'' and sent_at','where sent_at');
 execute definition;
end $$;
revoke all on function public.distribution_claim_submission_email_events(uuid) from public,anon,authenticated;
grant execute on function public.distribution_claim_submission_email_events(uuid) to service_role;

-- Le rôle applicatif ne lit jamais Auth ; seule l'adresse confirmée du déposant
-- d'un dossier existant traverse cette fonction réservée au serveur.
create function public.distribution_confirmed_submission_email(p_submission uuid)
returns text language sql stable security definer set search_path='' as $$
 select a.email
 from public.game_submissions s
 left join public.game_build_uploads u on u.id=s.build_upload_id
 left join public.game_external_revisions r on r.submission_id=s.id
 join auth.users a on a.id=coalesce(u.created_by,r.developer_id)
 where s.id=p_submission and a.email_confirmed_at is not null
$$;
alter function public.distribution_confirmed_submission_email(uuid) owner to postgres;
revoke all on function public.distribution_confirmed_submission_email(uuid) from public,anon,authenticated,service_role;
grant execute on function public.distribution_confirmed_submission_email(uuid) to service_role;

create function public.distribution_queue_developer_email(p_submission uuid,p_event text,p_key text,p_reason text default null)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare contact jsonb; game uuid; recipient text;
begin
 if p_event not in ('received','correction','accepted','rejected','published') then raise exception 'invalid_request'; end if;
 select public.distribution_contact_json(c),coalesce(u.game_id,r.game_id),public.distribution_confirmed_submission_email(s.id) into contact,game,recipient
 from public.game_submissions s left join public.game_build_uploads u on u.id=s.build_upload_id
 left join public.game_external_revisions r on r.submission_id=s.id
 join public.developer_contacts c on c.user_id=coalesce(u.created_by,r.developer_id)
 where s.id=p_submission;
 if game is null or contact is null or recipient is null then return; end if;
 insert into public.game_submission_notifications(submission_id,contact_snapshot,event_key,notification)
 values(p_submission,contact,p_key,jsonb_build_object('event',p_event,'gameId',game,'recipient',recipient,'reason',p_reason))
 on conflict (submission_id,event_key) do nothing;
end $$;
revoke all on function public.distribution_queue_developer_email(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.distribution_queue_developer_email(uuid,text,text,text) to service_role;

create function public.distribution_notify_developer_event() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare submission uuid; action text; event text;
begin
 if tg_table_name='game_submissions' then
  -- Les URL sont rattachées à leur révision après l'insertion du dossier.
  if new.build_upload_id is not null then perform public.distribution_queue_developer_email(new.id,'received','received'); end if;
 elsif tg_table_name='game_external_revisions' then
  perform public.distribution_queue_developer_email(new.submission_id,'received','received');
 elsif tg_table_name='game_build_review_events' then
  select id into submission from public.game_submissions where build_upload_id=new.upload_id;
  event:=case new.action when 'correction_requested' then 'correction' when 'publish' then 'accepted' when 'reject' then 'rejected' end;
  if event is not null and submission is not null then perform public.distribution_queue_developer_email(submission,event,'review:'||new.id,new.reason); end if;
 elsif tg_table_name='game_external_review_events' then
  select submission_id into submission from public.game_external_revisions where id=new.revision_id;
  event:=case new.action when 'correction' then 'correction' when 'approve' then 'accepted' when 'reject' then 'rejected' end;
  if event is not null then perform public.distribution_queue_developer_email(submission,event,'external:'||new.id,new.reason); end if;
 elsif tg_table_name='games' and new.is_published and
  (not old.is_published or new.active_version_id is distinct from old.active_version_id or new.external_revision_id is distinct from old.external_revision_id) then
  if new.external_revision_id is not null then
   select submission_id into submission from public.game_external_revisions where id=new.external_revision_id;
  else
   select s.id into submission from public.game_submissions s join public.game_build_uploads u on u.id=s.build_upload_id where u.version_id=new.active_version_id;
  end if;
  if submission is not null then perform public.distribution_queue_developer_email(submission,'published','published'); end if;
 end if;
 return new;
end $$;
revoke all on function public.distribution_notify_developer_event() from public,anon,authenticated;
create trigger notify_developer_submission after insert on public.game_submissions for each row execute function public.distribution_notify_developer_event();
create trigger notify_developer_revision after insert on public.game_external_revisions for each row execute function public.distribution_notify_developer_event();
create trigger notify_developer_review after insert on public.game_build_review_events for each row execute function public.distribution_notify_developer_event();
create trigger notify_developer_external_review after insert on public.game_external_review_events for each row execute function public.distribution_notify_developer_event();
create trigger notify_developer_publication after update of is_published,active_version_id,external_revision_id on public.games for each row execute function public.distribution_notify_developer_event();
-- Aucun INSERT historique : seuls les événements futurs déclenchent ces notifications.
commit;
