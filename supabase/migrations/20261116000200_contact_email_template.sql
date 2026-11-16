begin;
set local lock_timeout='5s';

-- Keep the provider payload stable when a form submission is retried across releases.
alter table public.contact_dispatches add column template_format integer not null default 0
 check(template_format in (0,1));

create function public.contact_reserve(p_id uuid,p_fingerprint text,p_client text,p_email text,p_format integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.contact_dispatches; token uuid;
begin
 if p_format is null or p_format not in (0,1) or p_id is null or p_fingerprint is null or p_client is null or p_email is null
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
revoke all on function public.contact_reserve(uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.contact_reserve(uuid,text,text,text,integer) to service_role;

create or replace function public.contact_reserve(p_id uuid,p_fingerprint text,p_client text,p_email text) returns jsonb
language sql security definer set search_path='' as $$
 select public.contact_reserve(p_id,p_fingerprint,p_client,p_email,0)
$$;
commit;
