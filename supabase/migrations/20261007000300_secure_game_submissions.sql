-- Requires the existing submissions table including the workflow upgrade columns.
begin;
alter table public.game_submissions enable row level security;

-- Remove any old permissive policies on this backend-only table.
do $$
declare existing_policy record;
begin
  for existing_policy in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'game_submissions'
  loop
    execute format('drop policy %I on public.game_submissions', existing_policy.policyname);
  end loop;
end;
$$;

revoke all on public.game_submissions from public, anon, authenticated;
-- Column-level grants, if manually added in production, must also be removed.
do $$
declare column_list text;
begin
  select string_agg(quote_ident(attname), ', ') into column_list
  from pg_attribute where attrelid = 'public.game_submissions'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke select (%s), insert (%s), update (%s), references (%s) on public.game_submissions from public, anon, authenticated',
                 column_list, column_list, column_list, column_list);
end;
$$;
grant select, insert, update, delete on public.game_submissions to service_role;
-- service_role bypasses RLS; no browser INSERT or SELECT policy is required.
commit;
