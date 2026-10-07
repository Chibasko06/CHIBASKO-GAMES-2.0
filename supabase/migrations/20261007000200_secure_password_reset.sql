-- Requires the existing password_reset_codes table and Supabase auth.users.
-- Run as the database migration owner, never as an application user.
begin;

alter table public.password_reset_codes
  add column if not exists attempts integer not null default 0 check (attempts between 0 and 5),
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Old codes have no bound identity and must not survive the protocol change.
update public.password_reset_codes set used_at = now() where used_at is null and user_id is null;
create index if not exists password_reset_codes_email_created_idx
  on public.password_reset_codes (email, created_at desc);

create table if not exists public.password_reset_rate_limits (
  client_hash text primary key,
  window_started_at timestamptz not null default now(),
  requests integer not null default 0 check (requests >= 0)
);
alter table public.password_reset_codes enable row level security;
alter table public.password_reset_rate_limits enable row level security;
revoke all on public.password_reset_codes, public.password_reset_rate_limits from public, anon, authenticated;
-- Close manually added policies and column grants as well as table grants.
do $$
declare table_name text; column_list text; existing_policy record;
begin
  foreach table_name in array array['password_reset_codes', 'password_reset_rate_limits'] loop
    for existing_policy in select policyname from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy %I on public.%I', existing_policy.policyname, table_name);
    end loop;
    select string_agg(quote_ident(attname), ', ') into column_list from pg_attribute
      where attrelid = ('public.' || table_name)::regclass and attnum > 0 and not attisdropped;
    execute format('revoke select (%s), insert (%s), update (%s), references (%s) on public.%I from public, anon, authenticated',
                   column_list, column_list, column_list, column_list, table_name);
  end loop;
end;
$$;
grant all on public.password_reset_codes, public.password_reset_rate_limits to service_role;

-- Opportunistic cleanup, also callable by a future maintenance job.
create or replace function public.cleanup_password_reset_requests()
returns void language sql security definer set search_path = '' as $$
  delete from public.password_reset_codes
    where created_at < now() - interval '24 hours' and expires_at < now();
  delete from public.password_reset_rate_limits
    where window_started_at < now() - interval '24 hours';
$$;

create or replace function public.reserve_password_reset(p_email text, p_code_hash text, p_client_hash text)
returns table (request_id uuid, auth_user_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_user_id uuid;
  v_request_id uuid;
begin
  if p_email is null or length(p_email) > 254 or p_email <> lower(btrim(p_email))
     or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$'
     or p_client_hash is null or p_client_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid reset request';
  end if;

  -- Database locks/limits survive concurrent requests and serverless instances.
  perform pg_advisory_xact_lock(hashtextextended('reset-client:' || p_client_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended('reset-email:' || p_email, 0));
  perform public.cleanup_password_reset_requests();
  insert into public.password_reset_rate_limits as limits (client_hash, window_started_at, requests)
  values (p_client_hash, v_now, 1)
  on conflict (client_hash) do update set
    requests = case when limits.window_started_at <= v_now - interval '1 hour' then 1 else limits.requests + 1 end,
    window_started_at = case when limits.window_started_at <= v_now - interval '1 hour' then v_now else limits.window_started_at end
  returning requests into v_count;
  if v_count > 20 then return; end if;

  if (select count(*) from public.password_reset_codes where email = p_email and created_at > v_now - interval '1 hour') >= 3
     or exists (select 1 from public.password_reset_codes where email = p_email and created_at > v_now - interval '60 seconds') then
    return;
  end if;

  -- The same reservation/response is used for existing and nonexistent accounts.
  select id into v_user_id from auth.users where lower(email) = p_email limit 1;
  update public.password_reset_codes set used_at = v_now where email = p_email and used_at is null;
  insert into public.password_reset_codes (email, code_hash, user_id, expires_at, created_at)
  values (p_email, p_code_hash, v_user_id, v_now + interval '10 minutes', v_now)
  returning id into v_request_id;
  return query select v_request_id, v_user_id;
end;
$$;

create or replace function public.check_password_reset(p_email text, p_code_hash text, p_consume boolean)
returns table (auth_user_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_code public.password_reset_codes%rowtype;
  v_matches boolean;
begin
  if p_email is null or p_code_hash is null or p_consume is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('reset-email:' || p_email, 0));
  select * into v_code from public.password_reset_codes
    where email = p_email and used_at is null
    order by created_at desc limit 1 for update;
  if not found or v_code.expires_at <= clock_timestamp() or v_code.attempts >= 5 then return; end if;

  v_matches := v_code.code_hash = p_code_hash and v_code.user_id is not null;
  -- Every check counts, including successful verify calls. Confirm shares the budget.
  update public.password_reset_codes set
    attempts = attempts + 1,
    used_at = case when (v_matches and p_consume) or (not v_matches and attempts + 1 >= 5)
                   then clock_timestamp() else used_at end
  where id = v_code.id;
  if v_matches then return query select v_code.user_id; end if;
end;
$$;

revoke execute on function public.cleanup_password_reset_requests() from public, anon, authenticated;
revoke execute on function public.reserve_password_reset(text, text, text) from public, anon, authenticated;
revoke execute on function public.check_password_reset(text, text, boolean) from public, anon, authenticated;
grant execute on function public.cleanup_password_reset_requests() to service_role;
grant execute on function public.reserve_password_reset(text, text, text) to service_role;
grant execute on function public.check_password_reset(text, text, boolean) to service_role;

commit;
