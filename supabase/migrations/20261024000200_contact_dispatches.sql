begin;
create table public.contact_dispatches(
 id uuid primary key, fingerprint text not null unique check(fingerprint ~ '^[a-f0-9]{64}$'),
 client_hash text not null check(client_hash ~ '^[a-f0-9]{64}$'),
 email_hash text not null check(email_hash ~ '^[a-f0-9]{64}$'),
 state text not null default 'pending' check(state in('pending','unconfirmed','accepted')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '22 hours',
 attempts integer not null default 1 check(attempts between 1 and 5),
 lease uuid, lease_until timestamptz, next_attempt_at timestamptz not null default now()
);
create index contact_dispatches_client_idx on public.contact_dispatches(client_hash,created_at);
create index contact_dispatches_email_idx on public.contact_dispatches(email_hash,created_at);
create index contact_dispatches_expiry_idx on public.contact_dispatches(expires_at);
alter table public.contact_dispatches enable row level security;
revoke all on public.contact_dispatches from public,anon,authenticated,service_role;

create function public.contact_reserve(p_id uuid,p_fingerprint text,p_client text,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.contact_dispatches; token uuid;
begin
 if p_id is null or p_fingerprint is null or p_client is null or p_email is null
  or p_fingerprint !~ '^[a-f0-9]{64}$' or p_client !~ '^[a-f0-9]{64}$' or p_email !~ '^[a-f0-9]{64}$' then raise exception using errcode='22023',message='invalid_request'; end if;
 perform pg_advisory_xact_lock(721,1);
 delete from public.contact_dispatches where expires_at<=now();
 select * into item from public.contact_dispatches where id=p_id;
 if found and item.fingerprint<>p_fingerprint then return jsonb_build_object('state','conflict'); end if;
 select * into item from public.contact_dispatches where fingerprint=p_fingerprint for update;
 if found then
  if item.state='accepted' then return jsonb_build_object('state','accepted'); end if;
  if item.created_at<now()-interval '21 hours' or item.attempts>=5 then return jsonb_build_object('state','unconfirmed'); end if;
  if item.lease_until>now() or item.next_attempt_at>now() then return jsonb_build_object('state','waiting'); end if;
  token:=gen_random_uuid();
  update public.contact_dispatches set lease=token,lease_until=now()+interval '30 seconds',attempts=attempts+1 where id=item.id;
 else
  if (select count(*) from public.contact_dispatches where client_hash=p_client and created_at>now()-interval '1 hour')>=5
   or (select count(*) from public.contact_dispatches where email_hash=p_email and created_at>now()-interval '1 hour')>=3
   or (select count(*) from public.contact_dispatches where created_at>now()-interval '1 hour')>=100 then return jsonb_build_object('state','rate_limited'); end if;
  token:=gen_random_uuid();
  insert into public.contact_dispatches(id,fingerprint,client_hash,email_hash,lease,lease_until)
  values(p_id,p_fingerprint,p_client,p_email,token,now()+interval '30 seconds') returning * into item;
 end if;
 return jsonb_build_object('state','send','id',item.id,'lease',token);
end $$;
create function public.contact_finish(p_id uuid,p_lease uuid,p_accepted boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_accepted is null then raise exception using errcode='22023',message='invalid_request'; end if;
 update public.contact_dispatches set state=case when p_accepted then 'accepted' else 'unconfirmed' end,
  lease=null,lease_until=null,next_attempt_at=now()+interval '30 seconds'
 where id=p_id and lease=p_lease and lease_until>now();
 return found;
end $$;
revoke all on function public.contact_reserve(uuid,text,text,text),public.contact_finish(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.contact_reserve(uuid,text,text,text),public.contact_finish(uuid,uuid,boolean) to service_role;
create function public.contact_cleanup() returns void language sql security definer set search_path='' as $$
 delete from public.contact_dispatches where expires_at<=now();
$$;
revoke all on function public.contact_cleanup() from public,anon,authenticated;
grant execute on function public.contact_cleanup() to service_role;
create or replace function public.distribution_cleanup_sessions() returns boolean
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if not pg_try_advisory_xact_lock(1667721069,1936028515) then return false; end if;
 perform public.distribution_cleanup_multiplayer();
 perform public.distribution_cleanup_online();
 perform public.contact_cleanup();
 return true;
end $$;
commit;
