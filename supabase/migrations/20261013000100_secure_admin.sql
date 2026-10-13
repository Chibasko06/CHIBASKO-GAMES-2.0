-- PREPARED ONLY. Apply manually after reviewing the production schema/policies.
-- No identity is granted admin here; all existing catalogue rows are preserved.
begin;
do $$ begin
  if to_regclass('public.admin_users') is not null or to_regclass('public.user_roles') is not null
    or exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name in ('role','is_admin')) then
    raise exception 'Existing authorization schema: audit before creating a second source of truth';
  end if;
end $$;
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from public, anon, authenticated;
grant select (user_id) on public.admin_users to authenticated;
grant select, insert, update, delete on public.admin_users to service_role;
create policy "users can read own admin membership" on public.admin_users for select to authenticated using (auth.uid() = user_id);

-- Admin catalog CRUD is performed by protected server endpoints, never directly
-- by a browser JWT (including an administrator's JWT).
do $$ declare table_name text; columns_list text; p record; begin
  foreach table_name in array array['games','categories','game_categories','faq_entries','game_submissions'] loop
    execute format('alter table public.%I enable row level security',table_name);
    for p in select policyname from pg_policies where schemaname='public' and tablename=table_name loop
      execute format('drop policy %I on public.%I',p.policyname,table_name);
    end loop;
    execute format('revoke all on public.%I from public, anon, authenticated',table_name);
    select string_agg(quote_ident(attname),', ') into columns_list from pg_attribute
      where attrelid=format('public.%I',table_name)::regclass and attnum>0 and not attisdropped;
    execute format('revoke select (%s), insert (%s), update (%s), references (%s) on public.%I from public, anon, authenticated',
      columns_list,columns_list,columns_list,columns_list,table_name);
    execute format('grant select, insert, update, delete on public.%I to service_role',table_name);
    if table_name <> 'game_submissions' then execute format('grant select on public.%I to anon, authenticated',table_name); end if;
  end loop;
end $$;
create policy "public can read published games" on public.games for select to anon, authenticated using (is_published = true);
create policy "public can read categories" on public.categories for select to anon, authenticated using (true);
create policy "public can read published game categories" on public.game_categories for select to anon, authenticated
  using (exists (select 1 from public.games g where g.id = game_id and g.is_published = true));
create policy "public can read published faq entries" on public.faq_entries for select to anon, authenticated using (is_published = true);
-- Submissions have no browser policy. Public submissions still use the existing
-- validated server endpoint; private review/approval remains requireAdmin-gated.
commit;
