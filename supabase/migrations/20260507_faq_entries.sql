create table if not exists public.faq_entries (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists faq_entries_sort_order_idx
  on public.faq_entries (sort_order asc, created_at asc);

alter table public.faq_entries enable row level security;

drop policy if exists "public can read published faq entries" on public.faq_entries;
create policy "public can read published faq entries"
on public.faq_entries
for select
using (is_published = true);
