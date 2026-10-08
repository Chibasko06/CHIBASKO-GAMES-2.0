-- Phase 6B.1. Production preflight supplied: 81 games, no NULL/blank URLs.
-- No rows, relationships, statistics or media are deleted or rewritten.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.games IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.games'::regclass) THEN
    RAISE EXCEPTION 'games RLS is disabled; audit required before migration';
  END IF;
  IF NOT has_table_privilege('anon', 'public.games', 'SELECT')
    OR NOT has_table_privilege('authenticated', 'public.games', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.games', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.games', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.games', 'UPDATE') THEN
    RAISE EXCEPTION 'Table grants require review before adding catalogue columns';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'games'
      AND column_name = 'game_url' AND data_type = 'text'
      AND column_default IS NULL AND is_generated = 'NEVER'
  ) THEN RAISE EXCEPTION 'Unexpected games.game_url schema; audit required'; END IF;
  IF EXISTS (SELECT 1 FROM public.games WHERE game_url IS NULL OR btrim(game_url) = '') THEN
    RAISE EXCEPTION 'Existing game URLs require review; no changes applied';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'games'
      AND column_name IN ('game_type', 'multiplayer_game_id', 'is_beta')
  ) THEN RAISE EXCEPTION 'Catalogue columns already exist; audit migration state before retry'; END IF;
END $$;
ALTER TABLE public.games
  ADD COLUMN game_type text NOT NULL DEFAULT 'classic',
  ADD COLUMN multiplayer_game_id text,
  ADD COLUMN is_beta boolean NOT NULL DEFAULT false,
  ALTER COLUMN game_url DROP NOT NULL,
  ADD CONSTRAINT games_game_type_allowed CHECK (game_type IN ('classic', 'multiplayer_chibasko')),
  ADD CONSTRAINT games_execution_fields_valid CHECK (
    (game_type = 'classic' AND game_url IS NOT NULL AND btrim(game_url) <> '' AND multiplayer_game_id IS NULL)
    OR
    (game_type = 'multiplayer_chibasko' AND game_url IS NULL AND multiplayer_game_id IS NOT NULL AND btrim(multiplayer_game_id) <> '')
  );
CREATE UNIQUE INDEX games_multiplayer_game_id_unique
  ON public.games (multiplayer_game_id) WHERE multiplayer_game_id IS NOT NULL;
-- Preserve all existing grants and RLS policies. Never grant public writes here.
COMMIT;
