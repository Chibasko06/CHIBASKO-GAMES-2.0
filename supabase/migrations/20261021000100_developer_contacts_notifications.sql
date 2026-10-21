begin;
set local lock_timeout='5s';
create table public.developer_contacts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 first_name text not null check(length(btrim(first_name)) between 1 and 100),
 last_name text not null check(length(btrim(last_name)) between 1 and 100),
 contact_email text not null check(length(contact_email)<=254 and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 public_name text not null check(length(btrim(public_name)) between 1 and 160),
 website text check(website is null or (length(website)<=2048 and website ~ '^https://[^/@[:space:]]+([/?#]|$)')),
 other_contact text check(length(other_contact)<=500),
 updated_at timestamptz not null default now()
);
alter table public.developer_contacts enable row level security;
revoke all on public.developer_contacts from public,anon,authenticated;
grant select,insert,update on public.developer_contacts to authenticated;
grant select,insert,update,delete on public.developer_contacts to service_role;
create policy developer_contact_read on public.developer_contacts for select to authenticated
 using(user_id=auth.uid() or exists(select 1 from public.admin_users where user_id=auth.uid()));
create policy developer_contact_insert on public.developer_contacts for insert to authenticated with check(user_id=auth.uid());
create policy developer_contact_update on public.developer_contacts for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create function public.distribution_contact_json(p public.developer_contacts) returns jsonb language sql immutable
set search_path=pg_catalog,public as $$select jsonb_build_object('firstName',p.first_name,'lastName',p.last_name,'contactEmail',p.contact_email,'publicName',p.public_name,'website',p.website,'otherContact',p.other_contact)$$;
create function public.distribution_developer_profile(p_actor uuid,p_profile jsonb default null) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare p public.developer_contacts;
begin
 if not exists(select 1 from auth.users where id=p_actor) then raise exception 'unauthorized'; end if;
 if p_profile is not null then
  if jsonb_typeof(p_profile)<>'object' or (p_profile-array['firstName','lastName','contactEmail','publicName','website','otherContact'])<>'{}' then raise exception 'invalid_request'; end if;
  begin
   insert into public.developer_contacts(user_id,first_name,last_name,contact_email,public_name,website,other_contact)
   values(p_actor,btrim(p_profile->>'firstName'),btrim(p_profile->>'lastName'),btrim(p_profile->>'contactEmail'),btrim(p_profile->>'publicName'),nullif(btrim(p_profile->>'website'),''),nullif(btrim(p_profile->>'otherContact'),''))
   on conflict(user_id) do update set first_name=excluded.first_name,last_name=excluded.last_name,contact_email=excluded.contact_email,public_name=excluded.public_name,website=excluded.website,other_contact=excluded.other_contact,updated_at=now();
  exception when check_violation or not_null_violation then raise exception 'invalid_request'; end;
 end if;
 select * into p from public.developer_contacts where user_id=p_actor;
 if not found then return null; end if;
 return public.distribution_contact_json(p);
end $$;
create function public.distribution_admin_developer_profile(p_actor uuid,p_upload uuid) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare p public.developer_contacts;
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden'; end if;
 select c.* into p from public.developer_contacts c join public.game_build_uploads u on u.created_by=c.user_id where u.id=p_upload;
 if not found then return null; end if;
 return public.distribution_contact_json(p);
end $$;

-- Build queue jobs and email delivery have distinct consumers and acknowledgements.
create table public.game_submission_notifications (
 submission_id uuid primary key references public.game_submissions(id) on delete cascade,
 contact_snapshot jsonb not null,
 created_at timestamptz not null default now(),
 first_attempt_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 lease_token uuid,
 lease_until timestamptz,
 attempts integer not null default 0 check(attempts between 0 and 8),
 message jsonb,
 sent_at timestamptz,
 last_error text check(last_error in ('delivery_failed','attention_required'))
);
alter table public.game_submission_notifications enable row level security;
revoke all on public.game_submission_notifications from public,anon,authenticated;
grant select,insert,update on public.game_submission_notifications to service_role;
create index game_submission_notifications_pending on public.game_submission_notifications(next_attempt_at) where sent_at is null;
create function public.distribution_require_contact() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare p public.developer_contacts;
begin
 if new.build_upload_id is null then return new; end if;
 select c.* into p from public.developer_contacts c join public.game_build_uploads u on u.created_by=c.user_id where u.id=new.build_upload_id;
 if not found then raise exception 'developer_profile_required'; end if;
 new.email:=p.contact_email;
 return new;
end $$;
create trigger require_developer_contact before insert on public.game_submissions for each row execute function public.distribution_require_contact();
create function public.distribution_queue_submission_email() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if new.build_upload_id is not null then
  insert into public.game_submission_notifications(submission_id,contact_snapshot)
  select new.id,public.distribution_contact_json(c) from public.developer_contacts c join public.game_build_uploads u on u.created_by=c.user_id where u.id=new.build_upload_id
  on conflict do nothing;
 end if;
 return new;
end $$;
create trigger queue_submission_email after insert on public.game_submissions for each row execute function public.distribution_queue_submission_email();

create function public.distribution_claim_submission_email(p_submission uuid default null) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare n public.game_submission_notifications; result jsonb;
begin
 update public.game_submission_notifications set last_error='attention_required'
 where sent_at is null and (attempts>=8 or first_attempt_at<now()-interval '23 hours') and last_error is distinct from 'attention_required';
 select * into n from public.game_submission_notifications
 where sent_at is null and attempts<8 and (first_attempt_at is null or first_attempt_at>now()-interval '23 hours')
 and next_attempt_at<=now() and (lease_until is null or lease_until<now()) and (p_submission is null or submission_id=p_submission)
 order by created_at,submission_id for update skip locked limit 1;
 if not found then return null; end if;
 update public.game_submission_notifications set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now())
 where submission_id=n.submission_id returning * into n;
 select jsonb_build_object('id',n.submission_id,'lease',n.lease_token,'message',n.message,'contact',n.contact_snapshot,'title',s.game_title,'version',u.version,'kind',coalesce(s.submission_kind,'new'),'uploadId',u.id,'studio',s.name_or_studio)
 into result from public.game_submissions s join public.game_build_uploads u on u.id=s.build_upload_id where s.id=n.submission_id;
 return result;
end $$;
create function public.distribution_prepare_submission_email(p_id uuid,p_lease uuid,p_message jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 update public.game_submission_notifications set message=coalesce(message,p_message) where submission_id=p_id and lease_token=p_lease and lease_until>now() and sent_at is null returning message into result;
 if not found then raise exception 'lease_lost'; end if;
 return result;
end $$;
create function public.distribution_finish_submission_email(p_id uuid,p_lease uuid,p_success boolean) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public.game_submission_notifications set sent_at=case when p_success then now() end,last_error=case when p_success then null else 'delivery_failed' end,
 lease_token=null,lease_until=null,next_attempt_at=now()+interval '5 minutes'
 where submission_id=p_id and lease_token=p_lease and lease_until>now() and sent_at is null;
 if not found then raise exception 'lease_lost'; end if;
end $$;
revoke all on function public.distribution_contact_json(public.developer_contacts),public.distribution_developer_profile(uuid,jsonb),public.distribution_admin_developer_profile(uuid,uuid),public.distribution_require_contact(),public.distribution_queue_submission_email(),public.distribution_claim_submission_email(uuid),public.distribution_prepare_submission_email(uuid,uuid,jsonb),public.distribution_finish_submission_email(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.distribution_contact_json(public.developer_contacts),public.distribution_developer_profile(uuid,jsonb),public.distribution_admin_developer_profile(uuid,uuid),public.distribution_require_contact(),public.distribution_queue_submission_email(),public.distribution_claim_submission_email(uuid),public.distribution_prepare_submission_email(uuid,uuid,jsonb),public.distribution_finish_submission_email(uuid,uuid,boolean) to service_role;
commit;
