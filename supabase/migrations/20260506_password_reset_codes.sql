create table if not exists public.password_reset_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists password_reset_codes_email_idx
  on public.password_reset_codes (email);

create index if not exists password_reset_codes_expires_at_idx
  on public.password_reset_codes (expires_at);

create unique index if not exists password_reset_codes_active_code_hash_idx
  on public.password_reset_codes (email, code_hash)
  where used_at is null;

alter table public.password_reset_codes enable row level security;
