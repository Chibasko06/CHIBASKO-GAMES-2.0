create table if not exists public.game_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'accepted', 'rejected', 'archived')),
  name_or_studio text not null,
  email text not null,
  game_title text not null,
  demo_url text not null,
  game_type text not null,
  category_names text[] not null default '{}',
  description text not null,
  has_ads boolean,
  published_elsewhere text,
  expectations text,
  message text,
  admin_notes text
);

create index if not exists game_submissions_status_idx on public.game_submissions(status);
create index if not exists game_submissions_created_at_idx on public.game_submissions(created_at desc);

create or replace function public.set_game_submissions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_game_submissions_updated_at on public.game_submissions;
create trigger set_game_submissions_updated_at
before update on public.game_submissions
for each row
execute function public.set_game_submissions_updated_at();
