-- PREPARED ONLY: review/apply manually, never run against production by tests.
-- Additive: no catalogue rewrite, owner assignment or publication.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$ begin
  if to_regclass('public.game_versions') is not null or exists (
    select 1 from information_schema.columns where table_schema='public' and table_name='games' and column_name='active_version_id'
  ) then raise exception 'Distribution schema already exists; audit migration state'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='games' and column_name='id' and data_type='uuid')
    then raise exception 'Expected games.id UUID'; end if;
end $$;

create table public.game_versions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete restrict,
  version text not null check (length(version) <= 64 and version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9A-Za-z-]*))*)?$'),
  schema_version integer not null check (schema_version=1),
  integration_version integer not null check (integration_version=1),
  status text not null default 'draft' check (status in ('draft','in_review','approved','published','rejected','archived')),
  manifest jsonb not null check (jsonb_typeof(manifest)='object'),
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  artifact_size bigint not null check (artifact_size > 0),
  file_count integer not null check (file_count > 0),
  archive_sha256 text check (archive_sha256 ~ '^[0-9a-f]{64}$'),
  archive_size bigint check (archive_size > 0),
  storage_prefix text generated always as ('games/'||game_id::text||'/versions/'||id::text||'/'||artifact_sha256||'/client/') stored,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  validated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (game_id,version),
  unique (id,game_id),
  check ((archive_sha256 is null) = (archive_size is null)),
  -- Critical tuple checks here; full JSON Schema/paths/content validation is
  -- obligatory in the trusted ingestion job, not a claim made by this CHECK.
  check ((manifest->>'gameId') is not null and manifest->>'gameId'=game_id::text),
  check ((manifest->>'version') is not null and manifest->>'version'=version),
  check ((manifest->>'schemaVersion') is not null and manifest->>'schemaVersion'=schema_version::text),
  check ((manifest->>'integrationVersion') is not null and manifest->>'integrationVersion'=integration_version::text)
);
create index game_versions_game_status_idx on public.game_versions(game_id,status);
alter table public.games add column active_version_id uuid;
alter table public.games add constraint games_active_version_same_game
  foreign key (active_version_id,id) references public.game_versions(id,game_id) deferrable initially immediate;

alter table public.game_versions enable row level security;
revoke all on public.game_versions from public, anon, authenticated;
grant select, insert, update on public.game_versions to service_role;
-- No public or developer policy yet. No reliable ownership relation exists in
-- the current schema. Future upload APIs must authorize the target game first.
-- Private manifest/storage/creator data is never exposed by a public SELECT.

create function public.guard_game_version() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op='DELETE' then raise exception 'Archive versions instead of deleting them'; end if;
  if tg_op='INSERT' then
    if new.status <> 'draft' or new.published_at is not null then raise exception 'New validated versions start as draft'; end if;
    return new;
  end if;
  if row(new.id,new.game_id,new.version,new.schema_version,new.integration_version,new.manifest,new.artifact_sha256,
    new.artifact_size,new.file_count,new.archive_sha256,new.archive_size,new.created_at,new.validated_at)
    is distinct from row(old.id,old.game_id,old.version,old.schema_version,old.integration_version,old.manifest,old.artifact_sha256,
    old.artifact_size,old.file_count,old.archive_sha256,old.archive_size,old.created_at,old.validated_at)
    then raise exception 'Version payload is immutable; create a new version'; end if;
  if new.created_by is distinct from old.created_by and new.created_by is not null then raise exception 'Cannot change uploader identity'; end if;
  if new.published_at is distinct from old.published_at then raise exception 'Publication timestamp is managed by lifecycle'; end if;
  if new.status is distinct from old.status then
    if not ((old.status='draft' and new.status in ('in_review','archived'))
      or (old.status='in_review' and new.status in ('approved','rejected','archived'))
      or (old.status='rejected' and new.status in ('in_review','archived'))
      or (old.status='approved' and new.status in ('published','archived'))
      or (old.status='published' and new.status='archived')
      or (old.status='archived' and old.published_at is not null and new.status='published'))
      then raise exception 'Invalid version lifecycle transition'; end if;
    if new.status <> 'published' and exists(select 1 from public.games where active_version_id=old.id)
      then raise exception 'Switch or clear the active version before archiving'; end if;
    if new.status='published' and new.published_at is null then new.published_at=now(); end if;
  end if;
  return new;
end $$;
create trigger guard_game_version before insert or update or delete on public.game_versions for each row execute function public.guard_game_version();

create function public.guard_active_game_version() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare selected_game uuid; selected_status text;
begin
  if new.active_version_id is null then return new; end if;
  select game_id,status into selected_game,selected_status from public.game_versions where id=new.active_version_id for share;
  if not found or selected_game<>new.id or selected_status<>'published' then raise exception 'Active version must be published and belong to the same game'; end if;
  return new;
end $$;
create trigger guard_active_game_version before insert or update of active_version_id on public.games for each row execute function public.guard_active_game_version();

create function public.set_active_game_version(p_game_id uuid,p_version_id uuid) returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  perform id from public.games where id=p_game_id for update;
  if not found then raise exception 'Unknown game'; end if;
  update public.games set active_version_id=p_version_id where id=p_game_id;
end $$;
revoke all on function public.guard_game_version() from public,anon,authenticated;
revoke all on function public.guard_active_game_version() from public,anon,authenticated;
revoke all on function public.set_active_game_version(uuid,uuid) from public,anon,authenticated;
grant execute on function public.set_active_game_version(uuid,uuid) to service_role;
-- Existing games grants/RLS are preserved; active pointers remain NULL.
commit;
