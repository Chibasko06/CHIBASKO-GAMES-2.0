begin;
set local lock_timeout = '5s';

create table public.admin_mail_log (
  id uuid primary key,
  actor_id uuid not null,
  sender text not null check (sender in ('contact','developers')),
  recipient text not null check (length(recipient) between 3 and 254),
  subject text not null check (length(subject) between 1 and 150),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','unconfirmed')),
  provider_id text,
  provider_status integer
);
create index admin_mail_log_recent on public.admin_mail_log (created_at desc, id desc);
alter table public.admin_mail_log enable row level security;
revoke all on public.admin_mail_log from public, anon, authenticated;
grant select, insert, update on public.admin_mail_log to service_role;

create function public.distribution_admin_mail_reserve(p_actor uuid,p_id uuid,p_sender text,p_recipient text,p_subject text,p_fingerprint text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare previous public.admin_mail_log;
begin
  if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(20261116,1);
  select * into previous from public.admin_mail_log where id=p_id;
  if found then
    if previous.actor_id<>p_actor or previous.fingerprint<>p_fingerprint then raise exception 'idempotency_conflict'; end if;
    return jsonb_build_object('reserved',false,'status',previous.status);
  end if;
  if (select count(*) from public.admin_mail_log where created_at>clock_timestamp()-interval '1 minute')>=5
    or (select count(*) from public.admin_mail_log where created_at>clock_timestamp()-interval '24 hours')>=50
    then raise exception 'rate_limited'; end if;
  insert into public.admin_mail_log(id,actor_id,sender,recipient,subject,fingerprint)
    values(p_id,p_actor,p_sender,p_recipient,p_subject,p_fingerprint);
  return jsonb_build_object('reserved',true,'status','pending');
end $$;

create function public.distribution_admin_mail_finish(p_actor uuid,p_id uuid,p_status text,p_provider_id text,p_provider_status integer)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if p_status not in ('accepted','rejected','unconfirmed') then raise exception 'invalid_request'; end if;
  update public.admin_mail_log set status=p_status,provider_id=p_provider_id,provider_status=p_provider_status
    where id=p_id and actor_id=p_actor and status='pending';
  if not found then raise exception 'invalid_state'; end if;
end $$;

create function public.distribution_admin_mail_history(p_actor uuid,p_page integer)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden'; end if;
  if p_page is null or p_page not between 0 and 10000 then raise exception 'invalid_request'; end if;
  return coalesce((select jsonb_agg(to_jsonb(entry) order by created_at desc,id desc) from (
    select id,sender,recipient,subject,created_at,status,provider_status
    from public.admin_mail_log order by created_at desc,id desc limit 21 offset (p_page*20)
  ) entry),'[]'::jsonb);
end $$;

revoke all on function public.distribution_admin_mail_reserve(uuid,uuid,text,text,text,text),
  public.distribution_admin_mail_finish(uuid,uuid,text,text,integer),public.distribution_admin_mail_history(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.distribution_admin_mail_reserve(uuid,uuid,text,text,text,text),
  public.distribution_admin_mail_finish(uuid,uuid,text,text,integer),public.distribution_admin_mail_history(uuid,integer)
  to service_role;
commit;
