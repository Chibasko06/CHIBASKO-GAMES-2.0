-- ==========================================
-- RECREATION PROPRE DU SCHEMA CHIBASKO GAMES
-- ==========================================

-- Active l'extension utile pour générer des UUID si elle n'est pas déjà présente.
create extension if not exists pgcrypto;

-- =========================
-- TABLE DES PROFILS JOUEURS
-- =========================

-- Crée la table des profils joueurs.
create table public.profiles (

  -- Utilise le même identifiant que auth.users pour relier un compte Supabase à son profil.
  id uuid primary key references auth.users(id) on delete cascade,

  -- Stocke le pseudo unique visible sur le site.
  username text unique not null,

  -- Stocke le nom affiché si tu veux différencier pseudo et nom public.
  display_name text,

  -- Stocke l'URL de l'avatar du joueur.
  avatar_url text,

  -- Stocke une courte bio de profil.
  bio text,

  -- Stocke l'XP totale du joueur.
  xp_points integer not null default 0,

  -- Stocke la dernière date de calcul d'XP pour éviter de doubler les gains.
  last_xp_tick_at timestamptz default now(),

  -- Stocke la date de création du profil.
  created_at timestamptz not null default now(),

  -- Empêche un pseudo vide après trim.
  constraint profiles_username_not_blank check (char_length(trim(username)) > 0),

  -- Empêche une XP négative.
  constraint profiles_xp_points_non_negative check (xp_points >= 0)
);

-- =================
-- TABLE DES JEUX
-- =================

-- Crée la table centrale des jeux.
create table public.games (

  -- Génère un identifiant unique pour chaque jeu.
  id uuid primary key default gen_random_uuid(),

  -- Stocke le titre du jeu.
  title text not null,

  -- Stocke un slug unique pour les URLs propres.
  slug text unique not null,

  -- Stocke l'URL du jeu embarqué ou externe.
  game_url text not null,

  -- Stocke l'image ou miniature du jeu.
  thumbnail_url text,

  -- Stocke une description longue du jeu.
  description text,

  -- Stocke le nom du développeur du jeu comme dans la v1.
  developer_name text,

  -- Stocke la date de sortie sous forme texte pour rester fidèle à la v1.
  release_date_text text,

  -- Stocke si le jeu est mobile compatible sous forme lisible.
  mobile_compatible text,

  -- Stocke la technologie utilisée par le jeu.
  technology text,

  -- Stocke éventuellement la source ou le provider du jeu.
  provider_name text,

  -- Stocke éventuellement la page source d'origine du jeu.
  source_page_url text,

  -- Compte le nombre de vues de la page jeu.
  views_count integer not null default 0,

  -- Compte le nombre de lancements du jeu.
  play_count integer not null default 0,

  -- Permet de masquer un jeu sans le supprimer.
  is_published boolean not null default true,

  -- Stocke la date d'ajout du jeu.
  created_at timestamptz not null default now(),

  -- Empêche un titre vide.
  constraint games_title_not_blank check (char_length(trim(title)) > 0),

  -- Empêche un slug vide.
  constraint games_slug_not_blank check (char_length(trim(slug)) > 0),

  -- Empêche les compteurs négatifs.
  constraint games_views_count_non_negative check (views_count >= 0),

  -- Empêche les compteurs négatifs.
  constraint games_play_count_non_negative check (play_count >= 0)
);

-- =====================
-- TABLE DES CATEGORIES
-- =====================

-- Crée la table des catégories de jeux.
create table public.categories (

  -- Génère un identifiant unique par catégorie.
  id uuid primary key default gen_random_uuid(),

  -- Stocke le nom de la catégorie.
  name text unique not null,

  -- Stocke le slug de la catégorie.
  slug text unique not null,

  -- Stocke la date de création de la catégorie.
  created_at timestamptz not null default now(),

  -- Empêche un nom vide.
  constraint categories_name_not_blank check (char_length(trim(name)) > 0),

  -- Empêche un slug vide.
  constraint categories_slug_not_blank check (char_length(trim(slug)) > 0)
);

-- ==================================
-- TABLE PIVOT JEUX <-> CATEGORIES
-- ==================================

-- Crée la table pivot pour autoriser un jeu à appartenir à une ou plusieurs catégories.
create table public.game_categories (

  -- Génère un identifiant unique pour chaque liaison.
  id uuid primary key default gen_random_uuid(),

  -- Référence le jeu lié.
  game_id uuid not null references public.games(id) on delete cascade,

  -- Référence la catégorie liée.
  category_id uuid not null references public.categories(id) on delete cascade,

  -- Stocke la date de création du lien.
  created_at timestamptz not null default now(),

  -- Empêche les doublons jeu/catégorie.
  constraint game_categories_unique_pair unique (game_id, category_id)
);

-- =====================
-- TABLE DES FAVORIS
-- =====================

-- Crée la table des favoris joueurs.
create table public.favorites (

  -- Génère un identifiant unique pour chaque favori.
  id uuid primary key default gen_random_uuid(),

  -- Référence le joueur propriétaire du favori.
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- Référence le jeu ajouté en favori.
  game_id uuid not null references public.games(id) on delete cascade,

  -- Stocke la date d'ajout en favori.
  created_at timestamptz not null default now(),

  -- Empêche d'ajouter deux fois le même jeu aux favoris.
  constraint favorites_unique_pair unique (user_id, game_id)
);

-- =========================
-- TABLE DE L'HISTORIQUE
-- =========================

-- Crée la table de l'historique de jeu.
create table public.play_history (

  -- Génère un identifiant unique pour chaque session enregistrée.
  id uuid primary key default gen_random_uuid(),

  -- Référence le joueur ayant lancé le jeu.
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- Référence le jeu lancé.
  game_id uuid not null references public.games(id) on delete cascade,

  -- Stocke la date de lancement du jeu.
  played_at timestamptz not null default now()
);

-- =========================
-- INDEX DE PERFORMANCE
-- =========================

-- Accélère les recherches de jeux visibles.
create index games_is_published_idx on public.games(is_published);

-- Accélère les recherches par slug.
create index games_slug_idx on public.games(slug);

-- Accélère les recherches de catégories par slug.
create index categories_slug_idx on public.categories(slug);

-- Accélère les requêtes de favoris par utilisateur.
create index favorites_user_id_idx on public.favorites(user_id);

-- Accélère les requêtes de favoris par jeu.
create index favorites_game_id_idx on public.favorites(game_id);

-- Accélère les requêtes d'historique par utilisateur.
create index play_history_user_id_idx on public.play_history(user_id);

-- Accélère les requêtes d'historique par date.
create index play_history_played_at_idx on public.play_history(played_at desc);

-- Accélère les requêtes sur les relations jeux/catégories.
create index game_categories_game_id_idx on public.game_categories(game_id);

-- Accélère les requêtes sur les relations catégories/jeux.
create index game_categories_category_id_idx on public.game_categories(category_id);

-- =========================
-- RLS: SECURITE
-- =========================

-- Active la sécurité par ligne sur les profils.
alter table public.profiles enable row level security;

-- Active la sécurité par ligne sur les favoris.
alter table public.favorites enable row level security;

-- Active la sécurité par ligne sur l'historique.
alter table public.play_history enable row level security;

-- Active la sécurité par ligne sur les jeux.
alter table public.games enable row level security;

-- Active la sécurité par ligne sur les catégories.
alter table public.categories enable row level security;

-- Active la sécurité par ligne sur la table pivot.
alter table public.game_categories enable row level security;

-- =========================================
-- POLITIQUES DE LECTURE PUBLIQUE DU CATALOGUE
-- =========================================

-- Autorise tout le monde à lire les jeux publiés.
create policy "public can read published games"
on public.games
for select
using (is_published = true);

-- Autorise tout le monde à lire les catégories.
create policy "public can read categories"
on public.categories
for select
using (true);

-- Autorise tout le monde à lire les liens jeux/catégories.
create policy "public can read game categories"
on public.game_categories
for select
using (true);

-- ==================================
-- POLITIQUES DES PROFILS UTILISATEURS
-- ==================================

-- Autorise un utilisateur connecté à lire son propre profil.
create policy "users can read own profile"
on public.profiles
for select
using (auth.uid() = id);

-- Autorise un utilisateur connecté à modifier son propre profil.
create policy "users can update own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- ==================================
-- POLITIQUES DES FAVORIS UTILISATEURS
-- ==================================

-- Autorise un utilisateur connecté à lire ses propres favoris.
create policy "users can read own favorites"
on public.favorites
for select
using (auth.uid() = user_id);

-- Autorise un utilisateur connecté à insérer ses propres favoris.
create policy "users can insert own favorites"
on public.favorites
for insert
with check (auth.uid() = user_id);

-- Autorise un utilisateur connecté à supprimer ses propres favoris.
create policy "users can delete own favorites"
on public.favorites
for delete
using (auth.uid() = user_id);

-- ==================================
-- POLITIQUES DE L'HISTORIQUE JOUEUR
-- ==================================

-- Autorise un utilisateur connecté à lire son propre historique.
create policy "users can read own play history"
on public.play_history
for select
using (auth.uid() = user_id);

-- Autorise un utilisateur connecté à insérer son propre historique.
create policy "users can insert own play history"
on public.play_history
for insert
with check (auth.uid() = user_id);

-- Autorise un utilisateur connecté à supprimer son propre historique si besoin.
create policy "users can delete own play history"
on public.play_history
for delete
using (auth.uid() = user_id);

-- ==========================================
-- FONCTION DE CREATION AUTOMATIQUE DU PROFIL
-- ==========================================

-- Crée la fonction appelée après inscription d'un nouvel utilisateur.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Insère automatiquement le profil lié au nouvel utilisateur Supabase.
  insert into public.profiles (
    id,
    username,
    display_name,
    xp_points,
    last_xp_tick_at
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'user_name', 'joueur_' || substr(new.id::text, 1, 6)),
    coalesce(new.raw_user_meta_data->>'user_name', 'Joueur'),
    0,
    now()
  );

  -- Retourne la nouvelle ligne auth.users pour terminer le trigger.
  return new;
end;
$$;

-- Crée le trigger qui lance la création de profil après inscription.
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

-- ==========================================
-- FONCTION DE SYNCHRONISATION DE L'XP JOUEUR
-- ==========================================

-- Crée une fonction qui ajoute 5 XP par minute écoulée pour l'utilisateur connecté.
create or replace function public.sync_profile_xp()
returns public.profiles
language plpgsql
security definer
as $$
declare
  current_profile public.profiles;
  elapsed_minutes integer;
begin
  -- Refuse l'appel si aucun utilisateur n'est connecté.
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Charge le profil de l'utilisateur connecté.
  select *
  into current_profile
  from public.profiles
  where id = auth.uid()
  for update;

  -- Refuse l'appel si aucun profil n'existe.
  if current_profile.id is null then
    raise exception 'Profile not found';
  end if;

  -- Calcule le nombre entier de minutes écoulées depuis le dernier tick XP.
  elapsed_minutes := floor(extract(epoch from (now() - coalesce(current_profile.last_xp_tick_at, now()))) / 60);

  -- Si au moins une minute s'est écoulée, ajoute 5 XP par minute et avance l'horodatage.
  if elapsed_minutes > 0 then
    update public.profiles
    set
      xp_points = xp_points + (elapsed_minutes * 5),
      last_xp_tick_at = coalesce(last_xp_tick_at, now()) + make_interval(mins => elapsed_minutes)
    where id = auth.uid();
  end if;

  -- Retourne le profil à jour.
  return (
    select p
    from public.profiles p
    where p.id = auth.uid()
  );
end;
$$;

-- ==========================================
-- DONNEES DE BASE UTILES
-- ==========================================

-- Insère la catégorie Action si elle n'existe pas.
insert into public.categories (name, slug)
values ('Action', 'action')
on conflict (slug) do nothing;

-- Insère la catégorie Aventure si elle n'existe pas.
insert into public.categories (name, slug)
values ('Aventure', 'aventure')
on conflict (slug) do nothing;

-- Insère la catégorie Classique si elle n'existe pas.
insert into public.categories (name, slug)
values ('Classique', 'classique')
on conflict (slug) do nothing;
