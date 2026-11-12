begin;
set local lock_timeout = '5s';

-- A revision is the immutable external payload of a common submission.
-- Editorial and administrative decisions remain on game_submissions.
create table public.game_external_revisions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.game_submissions(id) on delete restrict,
  game_id uuid not null references public.games(id) on delete restrict,
  developer_id uuid references auth.users(id) on delete set null,
  submitted_url text not null check (length(submitted_url) between 9 and 2048),
  submitted_origin text not null check (submitted_origin ~ '^https://[a-z0-9.-]+$'),
  submitted_at timestamptz not null default now(),
  unique (game_id, id),
  check (
    submitted_url = submitted_origin
    or left(submitted_url, length(submitted_origin) + 1) = submitted_origin || '/'
  )
);

create index game_external_revisions_game_date_idx
  on public.game_external_revisions (game_id, submitted_at desc, id);

alter table public.game_external_revisions enable row level security;
revoke all on table public.game_external_revisions from public, anon, authenticated, service_role;
grant select, insert on table public.game_external_revisions to service_role;

create function public.game_external_revision_immutable() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  -- Account erasure can clear the attribution without changing the payload.
  if old.developer_id is not null and new.developer_id is null
    and (to_jsonb(old) - 'developer_id') = (to_jsonb(new) - 'developer_id') then
    return new;
  end if;
  raise exception 'external_revision_immutable';
end;
$$;

revoke all on function public.game_external_revision_immutable() from public, anon, authenticated;
create trigger game_external_revision_immutable
before update on public.game_external_revisions
for each row execute function public.game_external_revision_immutable();

commit;
