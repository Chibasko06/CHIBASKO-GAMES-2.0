create table if not exists public.game_reactions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_reactions_unique_user_game unique (user_id, game_id),
  constraint game_reactions_reaction_allowed check (reaction in ('like', 'dislike'))
);

create index if not exists game_reactions_game_id_idx on public.game_reactions(game_id);
create index if not exists game_reactions_user_id_idx on public.game_reactions(user_id);

alter table public.game_reactions enable row level security;

drop policy if exists "public can read game reactions" on public.game_reactions;
create policy "public can read game reactions"
on public.game_reactions
for select
using (true);

drop policy if exists "users can insert own game reactions" on public.game_reactions;
create policy "users can insert own game reactions"
on public.game_reactions
for insert
with check (auth.uid() = user_id);

drop policy if exists "users can update own game reactions" on public.game_reactions;
create policy "users can update own game reactions"
on public.game_reactions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can delete own game reactions" on public.game_reactions;
create policy "users can delete own game reactions"
on public.game_reactions
for delete
using (auth.uid() = user_id);

create or replace function public.touch_game_reaction_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_game_reaction_updated_at on public.game_reactions;
create trigger set_game_reaction_updated_at
before update on public.game_reactions
for each row
execute procedure public.touch_game_reaction_updated_at();

create or replace function public.get_game_public_stats()
returns table (
  game_id uuid,
  favorites_count integer,
  ratings_count integer,
  average_rating numeric,
  comments_count integer,
  likes_count integer,
  dislikes_count integer
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
    coalesce(reviews_agg.comments_count, 0)::integer as comments_count,
    coalesce(reactions_agg.likes_count, 0)::integer as likes_count,
    coalesce(reactions_agg.dislikes_count, 0)::integer as dislikes_count
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
  left join (
    select
      game_id,
      count(*) filter (where reaction = 'like') as likes_count,
      count(*) filter (where reaction = 'dislike') as dislikes_count
    from public.game_reactions
    group by game_id
  ) as reactions_agg on reactions_agg.game_id = games.id
  where games.is_published = true;
$$;

create or replace function public.sync_profile_xp()
returns public.profiles
language plpgsql
security definer
as $$
declare
  current_profile public.profiles;
  elapsed_blocks integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into current_profile
  from public.profiles
  where id = auth.uid()
  for update;

  if current_profile.id is null then
    raise exception 'Profile not found';
  end if;

  elapsed_blocks := floor(extract(epoch from (now() - coalesce(current_profile.last_xp_tick_at, now()))) / 300);

  if elapsed_blocks > 0 then
    update public.profiles
    set
      xp_points = xp_points + (elapsed_blocks * 5),
      last_xp_tick_at = coalesce(last_xp_tick_at, now()) + make_interval(mins => elapsed_blocks * 5)
    where id = auth.uid();
  end if;

  return (
    select p
    from public.profiles p
    where p.id = auth.uid()
  );
end;
$$;
