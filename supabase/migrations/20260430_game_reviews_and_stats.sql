create table if not exists public.game_reviews (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null,
  comment text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_reviews_unique_user_game unique (user_id, game_id),
  constraint game_reviews_rating_range check (rating between 1 and 5),
  constraint game_reviews_comment_not_blank check (char_length(trim(comment)) > 0)
);

create index if not exists game_reviews_game_id_idx on public.game_reviews(game_id);
create index if not exists game_reviews_user_id_idx on public.game_reviews(user_id);
create index if not exists game_reviews_created_at_idx on public.game_reviews(created_at desc);

alter table public.game_reviews enable row level security;

drop policy if exists "public can read game reviews" on public.game_reviews;
create policy "public can read game reviews"
on public.game_reviews
for select
using (true);

drop policy if exists "users can insert own game reviews" on public.game_reviews;
create policy "users can insert own game reviews"
on public.game_reviews
for insert
with check (auth.uid() = user_id);

drop policy if exists "users can update own game reviews" on public.game_reviews;
create policy "users can update own game reviews"
on public.game_reviews
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can delete own game reviews" on public.game_reviews;
create policy "users can delete own game reviews"
on public.game_reviews
for delete
using (auth.uid() = user_id);

drop policy if exists "public can read profiles" on public.profiles;
create policy "public can read profiles"
on public.profiles
for select
using (true);

create or replace function public.touch_game_review_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_game_review_updated_at on public.game_reviews;
create trigger set_game_review_updated_at
before update on public.game_reviews
for each row
execute procedure public.touch_game_review_updated_at();

create or replace function public.increment_game_view(p_game_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_total integer;
begin
  update public.games
  set views_count = views_count + 1
  where id = p_game_id
    and is_published = true
  returning views_count into new_total;

  return coalesce(new_total, 0);
end;
$$;

create or replace function public.record_game_play(p_game_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_total integer;
begin
  update public.games
  set play_count = play_count + 1
  where id = p_game_id
    and is_published = true
  returning play_count into new_total;

  if auth.uid() is not null then
    insert into public.play_history (user_id, game_id)
    values (auth.uid(), p_game_id);
  end if;

  return coalesce(new_total, 0);
end;
$$;

create or replace function public.get_game_public_stats()
returns table (
  game_id uuid,
  favorites_count integer,
  ratings_count integer,
  average_rating numeric,
  comments_count integer
)
language sql
security definer
set search_path = public
as $$
  select
    games.id as game_id,
    coalesce(favorites_agg.favorites_count, 0)::integer as favorites_count,
    coalesce(reviews_agg.ratings_count, 0)::integer as ratings_count,
    coalesce(reviews_agg.average_rating, 0)::numeric as average_rating,
    coalesce(reviews_agg.comments_count, 0)::integer as comments_count
  from public.games as games
  left join (
    select game_id, count(*) as favorites_count
    from public.favorites
    group by game_id
  ) as favorites_agg on favorites_agg.game_id = games.id
  left join (
    select
      game_id,
      count(*) as ratings_count,
      round(avg(rating)::numeric, 2) as average_rating,
      count(*) filter (where char_length(trim(comment)) > 0) as comments_count
    from public.game_reviews
    group by game_id
  ) as reviews_agg on reviews_agg.game_id = games.id
  where games.is_published = true;
$$;

create or replace function public.get_game_reviews(p_game_id uuid)
returns table (
  id uuid,
  user_id uuid,
  username text,
  avatar_url text,
  rating integer,
  comment text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    reviews.id,
    reviews.user_id,
    profiles.username,
    profiles.avatar_url,
    reviews.rating,
    reviews.comment,
    reviews.created_at,
    reviews.updated_at
  from public.game_reviews as reviews
  join public.profiles as profiles on profiles.id = reviews.user_id
  where reviews.game_id = p_game_id
  order by reviews.updated_at desc, reviews.created_at desc;
$$;
