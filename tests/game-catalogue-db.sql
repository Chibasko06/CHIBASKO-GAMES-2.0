\set ON_ERROR_STOP on
-- Disposable local database only; executed by game-catalogue-db.mjs.
DO $$ BEGIN
  IF current_database() <> 'chibasko_catalogue_test' THEN RAISE EXCEPTION 'Disposable catalogue database required'; END IF;
END $$;
CREATE TABLE public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL CHECK (btrim(title) <> ''),
  slug text NOT NULL UNIQUE CHECK (btrim(slug) <> ''), game_url text NOT NULL,
  thumbnail_url text, description text, developer_name text, release_date_text text,
  mobile_compatible text, technology text, provider_name text, source_page_url text,
  views_count integer NOT NULL DEFAULT 0 CHECK (views_count >= 0),
  play_count integer NOT NULL DEFAULT 0 CHECK (play_count >= 0),
  is_published boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT SELECT ON public.games TO anon, authenticated;
GRANT ALL ON public.games TO service_role;
CREATE POLICY "public can read published games" ON public.games FOR SELECT USING (is_published = true);
CREATE INDEX games_slug_idx ON public.games(slug);
CREATE INDEX games_is_published_idx ON public.games(is_published);
CREATE TABLE public.catalogue_relation_test (game_id uuid REFERENCES public.games(id) ON DELETE CASCADE);
INSERT INTO public.games (title, slug, game_url, thumbnail_url, views_count, play_count)
SELECT 'Game ' || n, 'game-' || n, 'https://example.com/' || n,
  'https://assets.chibaskogames.fr/game-thumbnails/' || n || '.png', n, n * 2 FROM generate_series(1,81) n;
INSERT INTO public.catalogue_relation_test SELECT id FROM public.games;
CREATE TABLE public.catalogue_before AS SELECT * FROM public.games;
\ir ../supabase/migrations/20261008000100_catalogue_game_types.sql
DO $$
DECLARE before_rows jsonb; after_rows jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(g) ORDER BY id) INTO before_rows FROM public.catalogue_before g;
  SELECT jsonb_agg(to_jsonb(g) - 'game_type' - 'is_beta' - 'multiplayer_game_id' ORDER BY id) INTO after_rows FROM public.games g;
  IF before_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'Legacy data changed'; END IF;
  IF (SELECT count(*) FROM public.games WHERE game_type = 'classic' AND NOT is_beta AND multiplayer_game_id IS NULL) <> 81 THEN RAISE EXCEPTION 'Defaults failed'; END IF;
  IF (SELECT count(*) FROM public.catalogue_relation_test) <> 81 THEN RAISE EXCEPTION 'Relations changed'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.games'::regclass) THEN RAISE EXCEPTION 'RLS changed'; END IF;
  BEGIN INSERT INTO public.games (title,slug) VALUES ('Invalid','missing-url'); RAISE EXCEPTION 'Missing URL accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.games (title,slug,game_url) VALUES ('Invalid','blank-url',''); RAISE EXCEPTION 'Blank URL accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.games (title,slug,game_url,multiplayer_game_id) VALUES ('Invalid','classic-multi','https://example.com','chibasko-pong'); RAISE EXCEPTION 'Classic multiplayer ID accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.games (title,slug,game_type) VALUES ('Invalid','missing-id','multiplayer_chibasko'); RAISE EXCEPTION 'Missing ID accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.games (title,slug,game_type,game_url,multiplayer_game_id) VALUES ('Invalid','multi-url','multiplayer_chibasko','https://example.com','chibasko-pong'); RAISE EXCEPTION 'Multiplayer URL accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public.games (title,slug,game_type,multiplayer_game_id,is_beta,is_published) VALUES ('Pong','pong','multiplayer_chibasko','chibasko-pong',true,false);
  BEGIN INSERT INTO public.games (title,slug,game_type,multiplayer_game_id) VALUES ('Duplicate','duplicate','multiplayer_chibasko','chibasko-pong'); RAISE EXCEPTION 'Duplicate ID accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
  UPDATE public.games SET game_type = 'classic', game_url = 'https://example.com', multiplayer_game_id = NULL WHERE slug = 'pong';
  UPDATE public.games SET game_type = 'multiplayer_chibasko', game_url = NULL, multiplayer_game_id = 'chibasko-pong' WHERE slug = 'pong';
END $$;
