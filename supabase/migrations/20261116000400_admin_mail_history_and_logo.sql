begin;
set local lock_timeout='5s';

-- Remove the displayed data while retaining the reservation for quotas and retries.
alter table public.admin_mail_log
 add column removed_at timestamptz,
 alter column recipient drop not null,
 alter column subject drop not null,
 add constraint admin_mail_log_visible_content check (
   (removed_at is null and recipient is not null and subject is not null)
   or (removed_at is not null and recipient is null and subject is null)
 );

create function public.distribution_admin_mail_remove(p_actor uuid,p_id uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden'; end if;
 if p_id is null then raise exception 'invalid_request'; end if;
 update public.admin_mail_log set removed_at=clock_timestamp(),recipient=null,subject=null
   where id=p_id and removed_at is null;
 if found then return true; end if;
 return exists(select 1 from public.admin_mail_log where id=p_id and removed_at is not null);
end $$;

revoke all on function public.distribution_admin_mail_remove(uuid,uuid) from public,anon,authenticated;
grant execute on function public.distribution_admin_mail_remove(uuid,uuid) to service_role;

create or replace function public.distribution_admin_mail_history(p_actor uuid,p_page integer)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden'; end if;
  if p_page is null or p_page not between 0 and 10000 then raise exception 'invalid_request'; end if;
  return coalesce((select jsonb_agg(to_jsonb(entry) order by created_at desc,id desc) from (
    select id,sender,recipient,subject,created_at,status,provider_status
    from public.admin_mail_log where removed_at is null order by created_at desc,id desc limit 21 offset (p_page*20)
  ) entry),'[]'::jsonb);
end $$;

alter table public.contact_dispatches
 drop constraint contact_dispatches_template_format_check,
 add constraint contact_dispatches_template_format_check check(template_format in (0,1,2,3));

create or replace function public.contact_reserve(p_id uuid,p_fingerprint text,p_client text,p_email text,p_format integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.contact_dispatches; token uuid;
begin
 if p_format is null or p_format not in (0,1,2,3) or p_id is null or p_fingerprint is null or p_client is null or p_email is null
  or p_fingerprint !~ '^[a-f0-9]{64}$' or p_client !~ '^[a-f0-9]{64}$' or p_email !~ '^[a-f0-9]{64}$' then raise exception using errcode='22023',message='invalid_request'; end if;
 perform pg_advisory_xact_lock(721,1);
 delete from public.contact_dispatches where expires_at<=now() and (id=p_id or fingerprint=p_fingerprint);
 delete from public.contact_dispatches where id in(select id from public.contact_dispatches where expires_at<=now() order by expires_at,id limit 100);
 select * into item from public.contact_dispatches where id=p_id;
 if found and item.fingerprint<>p_fingerprint then return jsonb_build_object('state','conflict'); end if;
 select * into item from public.contact_dispatches where fingerprint=p_fingerprint for update;
 if found then
  if item.state='accepted' then return jsonb_build_object('state','accepted'); end if;
  if item.created_at<now()-interval '21 hours' or item.attempts>=5 then return jsonb_build_object('state','unconfirmed'); end if;
  if item.template_format>p_format or item.lease_until>now() or item.next_attempt_at>now() then return jsonb_build_object('state','waiting'); end if;
  token:=gen_random_uuid();
  update public.contact_dispatches set lease=token,lease_until=now()+interval '30 seconds',attempts=attempts+1 where id=item.id;
 else
  if (select count(*) from public.contact_dispatches where client_hash=p_client and created_at>now()-interval '1 hour')>=5
   or (select count(*) from public.contact_dispatches where email_hash=p_email and created_at>now()-interval '1 hour')>=3
   or (select count(*) from public.contact_dispatches where created_at>now()-interval '1 hour')>=100 then return jsonb_build_object('state','rate_limited'); end if;
  token:=gen_random_uuid();
  insert into public.contact_dispatches(id,fingerprint,client_hash,email_hash,lease,lease_until,template_format)
  values(p_id,p_fingerprint,p_client,p_email,token,now()+interval '30 seconds',p_format) returning * into item;
 end if;
 return jsonb_build_object('state','send','id',item.id,'lease',token,'templateFormat',item.template_format);
end $$;
commit;
