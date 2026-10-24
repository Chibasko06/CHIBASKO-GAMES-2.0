\set ON_ERROR_STOP on
\ir ../supabase/migrations/20261023000100_atomic_admin_catalogue.sql
\ir ../supabase/migrations/20261023000100_atomic_admin_catalogue.sql

create function public.catalogue_fixture_payload(p_title text, p_slug text) returns jsonb
language sql as $$ select jsonb_build_object('title',p_title,'slug',p_slug,'game_type','classic',
  'game_url','https://example.test/game','is_beta',false,'is_published',false,'thumbnail_url',null) $$;
insert into public.categories(id,name) values
  ('11111111-1111-4111-8111-111111111111','First'),
  ('22222222-2222-4222-8222-222222222222','Second');

do $$
declare
  actor uuid := '00000000-0000-4000-8000-000000000002';
  first_category uuid := '11111111-1111-4111-8111-111111111111';
  second_category uuid := '22222222-2222-4222-8222-222222222222';
  result jsonb;
  v_game_id uuid;
  snapshot jsonb;
begin
  result := public.admin_save_game(actor,public.catalogue_fixture_payload('Atomic','atomic-admin'),array[first_category]);
  v_game_id := (result->'game'->>'id')::uuid;
  if not exists(select 1 from public.game_categories c where c.game_id=v_game_id and category_id=first_category) then
    raise exception 'Create did not save categories';
  end if;
  select to_jsonb(g) into snapshot from public.games g where id=v_game_id;
  begin
    perform public.admin_save_game(actor,public.catalogue_fixture_payload('Invalid','atomic-admin'),array[gen_random_uuid()],v_game_id);
    raise exception 'Invalid category accepted';
  exception when invalid_parameter_value then null; end;
  if (select to_jsonb(g) from public.games g where id=v_game_id) is distinct from snapshot then raise exception 'Partial update'; end if;
  begin
    perform public.admin_save_game(actor,public.catalogue_fixture_payload('Invalid create','atomic-invalid'),array[gen_random_uuid()]);
    raise exception 'Invalid create accepted';
  exception when invalid_parameter_value then null; end;
  if exists(select 1 from public.games where slug='atomic-invalid') then raise exception 'Partial create'; end if;
  begin
    perform public.admin_save_game(actor,public.catalogue_fixture_payload('Duplicates','atomic-admin'),array[first_category,first_category],v_game_id);
    raise exception 'Duplicate categories accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.admin_save_game(actor,public.catalogue_fixture_payload('Missing','atomic-missing'),'{}',gen_random_uuid());
    raise exception 'Missing game accepted';
  exception when no_data_found then null; end;
  begin
    perform public.admin_save_game('00000000-0000-4000-8000-000000000001',public.catalogue_fixture_payload('Forbidden','atomic-forbidden'),'{}');
    raise exception 'Non-admin accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_save_game(actor,public.catalogue_fixture_payload('Injected','atomic-injected')||'{"views_count":999}','{}');
    raise exception 'Injected fields accepted';
  exception when invalid_parameter_value then null; end;
  perform public.admin_save_game(actor,public.catalogue_fixture_payload('Updated','atomic-admin'),array[second_category],v_game_id);
  if (select title from public.games where id=v_game_id)<>'Updated'
    or (select count(*) from public.game_categories c where c.game_id=v_game_id)<>1
    or not exists(select 1 from public.game_categories c where c.game_id=v_game_id and category_id=second_category) then
    raise exception 'Successful update incoherent';
  end if;
end $$;

create function public.fail_fixture_category() returns trigger language plpgsql as $$
begin raise exception 'fixture_category_failure'; end $$;
create trigger fixture_category_failure before insert on public.game_categories for each row execute function public.fail_fixture_category();
do $$
declare actor uuid:='00000000-0000-4000-8000-000000000002'; v_game_id uuid; snapshot jsonb; categories jsonb;
begin
  select id,to_jsonb(g) into v_game_id,snapshot from public.games g where slug='atomic-admin';
  select jsonb_agg(to_jsonb(c)) into categories from public.game_categories c where c.game_id=v_game_id;
  begin
    perform public.admin_save_game(actor,public.catalogue_fixture_payload('Must roll back','atomic-admin'),array['11111111-1111-4111-8111-111111111111'::uuid],v_game_id);
    raise exception 'Failure trigger was bypassed';
  exception when raise_exception then
    if sqlerrm <> 'fixture_category_failure' then raise; end if;
  end;
  if (select to_jsonb(g) from public.games g where id=v_game_id) is distinct from snapshot
    or (select jsonb_agg(to_jsonb(c)) from public.game_categories c where c.game_id=v_game_id) is distinct from categories then
    raise exception 'Mid-transaction error left partial changes';
  end if;
  begin
    perform public.admin_save_game(actor,public.catalogue_fixture_payload('Must roll back','atomic-create-failed'),array['11111111-1111-4111-8111-111111111111'::uuid]);
    raise exception 'Failure trigger was bypassed';
  exception when raise_exception then
    if sqlerrm <> 'fixture_category_failure' then raise; end if;
  end;
  if exists(select 1 from public.games where slug='atomic-create-failed') then raise exception 'Failed create persisted'; end if;
end $$;
drop trigger fixture_category_failure on public.game_categories;

do $$
declare signature text:='public.admin_save_game(uuid,jsonb,uuid[],uuid,text)';
begin
  if has_function_privilege('anon',signature,'execute') or has_function_privilege('authenticated',signature,'execute')
    or not has_function_privilege('service_role',signature,'execute') then raise exception 'Unsafe execute grants'; end if;
  if (select prosecdef from pg_proc where oid=signature::regprocedure) then raise exception 'Unexpected privilege escalation'; end if;
  if not exists(select 1 from pg_proc p,unnest(p.proconfig) c where p.oid=signature::regprocedure and c='search_path=""') then raise exception 'Unsafe search_path'; end if;
end $$;
set role anon;
do $$ begin
  begin perform public.admin_save_game(null,'{}','{}');raise exception 'Anonymous RPC allowed';
  exception when insufficient_privilege then null;end;
end $$;
reset role;
set role service_role;
select public.admin_save_game('00000000-0000-4000-8000-000000000002',public.catalogue_fixture_payload('Service','atomic-service'),'{}');
reset role;
