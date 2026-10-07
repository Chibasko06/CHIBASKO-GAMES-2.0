\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'chibasko_phase0_test' then raise exception 'Test database required'; end if;
end $$;

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000001', 'player@example.com', '{"user_name":"Player"}');
do $$ begin
  if not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-000000000001') then
    raise exception 'Account creation trigger was lost';
  end if;
  if to_regprocedure('public.sync_profile_xp()') is not null then raise exception 'Progression RPC still exists'; end if;
  if not exists (select 1 from public.password_reset_codes where email = 'legacy@example.com' and used_at is not null) then
    raise exception 'Old reset code remained active';
  end if;
end $$;

-- Permissions include existing column-level privileges and RPC execute grants.
do $$ declare r text; t text; p text; begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach t in array array['game_submissions', 'password_reset_codes', 'password_reset_rate_limits'] loop
      foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
        if has_table_privilege(r, 'public.' || t, p) then raise exception '% can % %', r, p, t; end if;
      end loop;
    end loop;
    if has_column_privilege(r, 'public.game_submissions', 'email', 'SELECT')
       or has_column_privilege(r, 'public.game_submissions', 'admin_notes', 'UPDATE') then
      raise exception 'Column-level submission leak for %', r;
    end if;
    if has_column_privilege(r, 'public.password_reset_codes', 'code_hash', 'SELECT') then
      raise exception 'Column-level reset leak for %', r;
    end if;
    if has_function_privilege(r, 'public.reserve_password_reset(text,text,text)', 'EXECUTE')
       or has_function_privilege(r, 'public.check_password_reset(text,text,boolean)', 'EXECUTE')
       or has_function_privilege(r, 'public.cleanup_password_reset_requests()', 'EXECUTE') then
      raise exception 'Reset RPC exposed to %', r;
    end if;
    if has_column_privilege(r, 'public.profiles', 'xp_points', 'UPDATE') then raise exception 'Legacy progression writable'; end if;
  end loop;
end $$;

set role anon;
do $$ begin
  begin perform email from public.game_submissions; raise exception 'Anonymous read succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
update public.profiles set avatar_url = 'https://example.com/avatar.png' where id = auth.uid();
do $$ begin
  if not exists (select 1 from public.profiles where id = auth.uid() and avatar_url = 'https://example.com/avatar.png') then
    raise exception 'Own-avatar update was broken';
  end if;
  begin update public.profiles set xp_points = 999 where id = auth.uid(); raise exception 'Progression update succeeded';
  exception when insufficient_privilege then null; end;
  begin delete from public.game_submissions; raise exception 'Submission deletion succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set role service_role;
insert into public.game_submissions (name_or_studio, email, game_title, demo_url, game_type, description)
values ('Studio', 'private@example.com', 'Game', 'https://example.com/game', 'Puzzle', 'Details');
update public.game_submissions set status = 'reviewing', admin_notes = 'Private review';
do $$ begin
  if not exists (select 1 from public.game_submissions where admin_notes = 'Private review') then
    raise exception 'Backend CRUD broken';
  end if;
end $$;
delete from public.game_submissions;

-- Five failures lock the code even when the correct code follows.
select * from public.reserve_password_reset('player@example.com', repeat('a',64), repeat('1',64));
do $$ declare i integer; begin
  for i in 1..5 loop
    if exists (select 1 from public.check_password_reset('player@example.com', repeat('b',64), false)) then
      raise exception 'Wrong code accepted';
    end if;
  end loop;
  if exists (select 1 from public.check_password_reset('player@example.com', repeat('a',64), true)) then
    raise exception 'Locked code accepted';
  end if;
end $$;

-- Cooldown and quota also apply to nonexistent accounts, preventing enumeration.
do $$ begin
  if exists (select 1 from public.reserve_password_reset('player@example.com', repeat('c',64), repeat('1',64))) then
    raise exception 'Cooldown bypass';
  end if;
end $$;
update public.password_reset_codes set created_at = now() - interval '2 minutes' where email = 'player@example.com';
select * from public.reserve_password_reset('player@example.com', repeat('c',64), repeat('1',64));
update public.password_reset_codes set created_at = now() - interval '2 minutes' where email = 'player@example.com';
select * from public.reserve_password_reset('player@example.com', repeat('d',64), repeat('1',64));
update public.password_reset_codes set created_at = now() - interval '2 minutes' where email = 'player@example.com';
do $$ begin
  if exists (select 1 from public.reserve_password_reset('player@example.com', repeat('e',64), repeat('2',64))) then
    raise exception 'Email quota bypass across IPs';
  end if;
  if (select count(*) from public.password_reset_codes where email = 'player@example.com' and used_at is null) <> 1 then
    raise exception 'More than one active code';
  end if;
  if not exists (select 1 from public.check_password_reset('player@example.com', repeat('d',64), false)) then
    raise exception 'Verification failed';
  end if;
  if not exists (select 1 from public.check_password_reset('player@example.com', repeat('d',64), true)) then
    raise exception 'Consumption failed';
  end if;
  if exists (select 1 from public.check_password_reset('player@example.com', repeat('d',64), true)) then
    raise exception 'Code reused';
  end if;
end $$;

select * from public.reserve_password_reset('absent@example.com', repeat('a',64), repeat('3',64));
do $$ begin
  if exists (select 1 from public.check_password_reset('absent@example.com', repeat('a',64), true)) then
    raise exception 'Nonexistent account accepted';
  end if;
end $$;
-- Requesting new codes cannot reset the per-client hour quota.
do $$ declare i integer; begin
  for i in 1..20 loop
    perform * from public.reserve_password_reset('absent' || i || '@example.com', repeat('a',64), repeat('4',64));
  end loop;
  if exists (select 1 from public.reserve_password_reset('absent21@example.com', repeat('a',64), repeat('4',64))) then
    raise exception 'Client quota bypass';
  end if;
end $$;

-- Expiry is enforced without cleanup; retention keeps the rolling quota intact.
reset role;
insert into auth.users (email, raw_user_meta_data) values ('expired@example.com', '{"user_name":"expired"}');
set role service_role;
select * from public.reserve_password_reset('expired@example.com', repeat('a',64), repeat('5',64));
update public.password_reset_codes set expires_at = now() - interval '1 second' where email = 'expired@example.com';
do $$ begin
  if exists (select 1 from public.check_password_reset('expired@example.com', repeat('a',64), true)) then
    raise exception 'Expired code accepted';
  end if;
end $$;
update public.password_reset_codes set created_at = now() - interval '25 hours', expires_at = now() - interval '24 hours' where email = 'expired@example.com';
select public.cleanup_password_reset_requests();
do $$ begin
  if exists (select 1 from public.password_reset_codes where email = 'expired@example.com') then
    raise exception 'Cleanup failed';
  end if;
end $$;
reset role;
