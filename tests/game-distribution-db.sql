\set ON_ERROR_STOP on
do $$ begin if current_database()<>'chibasko_distribution_test' then raise exception 'Disposable database required'; end if; end $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
insert into auth.users values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
create table public.games(id uuid primary key, title text not null, game_url text, is_published boolean not null default true,
 game_type text not null default 'classic', multiplayer_game_id text, is_beta boolean not null default false,
 check (game_type in ('classic','multiplayer_chibasko')),
 check ((game_type='classic' and game_url is not null and btrim(game_url)<>'' and multiplayer_game_id is null)
 or (game_type='multiplayer_chibasko' and game_url is null and multiplayer_game_id is not null and btrim(multiplayer_game_id)<>'')));
alter table public.games enable row level security;
grant select on public.games to anon,authenticated;
grant select,insert,update,delete on public.games to service_role;
create policy "public published" on public.games for select to anon,authenticated using(is_published);
insert into public.games(id,title,game_url,is_published) values('11111111-1111-4111-8111-111111111111','Legacy','https://example.com',true);
insert into public.games(id,title,game_url,is_published,game_type,multiplayer_game_id,is_beta)
 values('22222222-2222-4222-8222-222222222222','Hidden',null,false,'multiplayer_chibasko','test-game',true);
create table public.distribution_before as select * from public.games;
\ir ../supabase/migrations/20261016000100_game_distribution_versions.sql
do $$ begin
 if (select jsonb_agg(to_jsonb(g)-'active_version_id' order by id) from public.games g)
 is distinct from (select jsonb_agg(to_jsonb(g) order by id) from public.distribution_before g) then raise exception 'Catalogue changed'; end if;
 if exists(select 1 from public.games where active_version_id is not null) then raise exception 'Unexpected activation'; end if;
end $$;
create function public.distribution_expect_failure(statement text) returns void language plpgsql as $$
declare failed boolean:=false; begin
 begin execute statement; exception when others then failed:=true; end;
 if not failed then raise exception 'Expected failure: %',statement; end if;
end $$;
set role service_role;
insert into public.game_versions(id,game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count,created_by)
values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','0.1.0',1,1,
 '{"schemaVersion":1,"integrationVersion":1,"gameId":"11111111-1111-4111-8111-111111111111","version":"0.1.0","capabilities":{"local":{"players":{"min":1,"max":1}}},"client":{"entrypoints":{"local":"index.html"}}}',repeat('a',64),100,2,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select public.distribution_expect_failure($s$update public.game_versions set manifest=manifest||'{"title":"Overwrite"}'$s$);
select public.distribution_expect_failure($s$update public.game_versions set artifact_sha256=repeat('c',64)$s$);
select public.distribution_expect_failure($s$update public.game_versions set status='published'$s$);
select public.distribution_expect_failure($s$select public.set_active_game_version('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333')$s$);
update public.game_versions set status='in_review';
update public.game_versions set status='approved';
update public.game_versions set status='published';
select public.set_active_game_version('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333');
select public.distribution_expect_failure($s$select public.set_active_game_version('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333')$s$);
select public.distribution_expect_failure($s$update public.game_versions set status='archived'$s$);
select public.distribution_expect_failure($s$update public.game_versions set version='0.2.0'$s$);
select public.distribution_expect_failure($s$update public.game_versions set published_at=null$s$);
select public.distribution_expect_failure($s$delete from public.game_versions$s$);
insert into public.game_versions(id,game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count)
select '44444444-4444-4444-8444-444444444444',game_id,'0.2.0',schema_version,integration_version,
 jsonb_set(manifest,'{version}','"0.2.0"'),repeat('b',64),artifact_size,file_count from public.game_versions;
update public.game_versions set status='in_review' where version='0.2.0';
update public.game_versions set status='approved' where version='0.2.0';
update public.game_versions set status='published' where version='0.2.0';
select public.set_active_game_version('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444');
update public.game_versions set status='archived' where version='0.1.0';
update public.game_versions set status='published' where version='0.1.0';
select public.set_active_game_version('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333');
select public.distribution_expect_failure($s$insert into public.game_versions(game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count) select game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count from public.game_versions$s$);
reset role;
do $$ begin
 if (select storage_prefix from public.game_versions where version='0.1.0') <> 'games/11111111-1111-4111-8111-111111111111/versions/33333333-3333-4333-8333-333333333333/'||repeat('a',64)||'/client/' then raise exception 'Key contract differs'; end if;
 if (select active_version_id from public.games where is_published) <> '33333333-3333-4333-8333-333333333333' then raise exception 'Rollback failed'; end if;
 if exists(select 1 from public.game_versions where status='published' and published_at is null) then raise exception 'Missing publish timestamp'; end if;
end $$;
set role anon;
select public.distribution_expect_failure('select * from public.game_versions');
select public.distribution_expect_failure('update public.games set active_version_id=null');
select public.distribution_expect_failure($s$select public.set_active_game_version('11111111-1111-4111-8111-111111111111',null)$s$);
do $$ begin if (select count(*) from public.games) <> 1 then raise exception 'Public catalogue RLS changed'; end if; end $$;
reset role;
set role authenticated;
select public.distribution_expect_failure('select * from public.game_versions');
select public.distribution_expect_failure('insert into public.game_versions default values');
select public.distribution_expect_failure('update public.game_versions set status=''published''');
select public.distribution_expect_failure('update public.games set active_version_id=null');
reset role;
delete from auth.users;
do $$ begin if exists(select 1 from public.game_versions where created_by is not null) then raise exception 'Uploader deletion not anonymized'; end if; end $$;
