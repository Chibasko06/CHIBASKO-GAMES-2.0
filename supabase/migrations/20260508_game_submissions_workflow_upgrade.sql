alter table public.game_submissions
  add column if not exists developer_website text,
  add column if not exists mobile_compatibility text not null default '',
  add column if not exists sensitive_content text not null default 'none',
  add column if not exists short_description text not null default '',
  add column if not exists long_description text not null default '',
  add column if not exists ownership_confirmed boolean not null default false;

update public.game_submissions
set
  long_description = case
    when coalesce(long_description, '') = '' then coalesce(description, '')
    else long_description
  end,
  short_description = case
    when coalesce(short_description, '') = '' then left(coalesce(description, ''), 180)
    else short_description
  end
where true;

alter table public.game_submissions
  drop constraint if exists game_submissions_status_check;

update public.game_submissions
set status = 'reviewing'
where status = 'reviewed';

alter table public.game_submissions
  add constraint game_submissions_status_check
  check (status in ('pending', 'reviewing', 'accepted', 'rejected', 'archived'));
