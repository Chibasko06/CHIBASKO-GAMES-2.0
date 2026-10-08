# Phase 6B.1 — catalogue and internal game registry

## Production audit

The user supplied a production schema snapshot on 2026-10-08: 16 columns,
`game_url text NOT NULL` without a default; 81 published games, zero NULL,
blank or non-HTTP(S) URLs. Existing constraints cover the primary key, unique
slug, nonblank title/slug and nonnegative counters. Foreign keys from categories,
favorites, reactions, reviews and history reference `games.id` with cascading
deletes. None of those keys or rows is changed by this migration.

The supplied policy allows SELECT of published games. Grants shown for anon and
authenticated do not override RLS. The separate RLS enabled/forced result and
trigger/dependency result were not supplied. The migration fails before changing
anything if RLS is disabled or table-level catalogue read/backend write grants
are absent (column-only grants would not cover newly added columns); confirm triggers and dependencies before production
application. The historical `sql/tables.sql` is context, not a migration to rerun.

## Model

- `game_type`: `classic` (default) or `multiplayer_chibasko`, NOT NULL.
- `multiplayer_game_id`: nullable, unique when present.
- `is_beta`: NOT NULL, default false.
- `game_url`: nullable; a nonblank URL is required for classic, NULL for multiplayer.
- Classic cannot have a multiplayer ID; multiplayer requires a nonblank ID.
- Existing UUIDs, media, categories, counters and community data remain intact.
- `is_published` stays the visibility flag. `is_beta` is independent editorial data.
  Public beta badges are part of the later catalogue UI phase, not this phase.

The database enforces structural consistency. Admin API additionally validates
HTTP(S) classic URLs and known game IDs using the generated manifest. PostgreSQL
does not embed a second list of games or authoritative network capacities.

## Registry projection

Run `npm run generate:game-manifest` after changing the server registry, then
`npm run check:game-manifest`. Commit the generated JSON with the registry change
when authorized. The root test suite checks freshness and rejects stale output.
Generation uses Node's native TypeScript stripping (Node 24 recommended); it reads
the existing pure registry module, without installing or importing Colyseus.
Next.js imports only the JSON and application helpers, never server modules.

Only game IDs and min/max capacities are projected. Names in the admin are display
labels. The running game-server remains authoritative even if it runs a different
version from the manifest. No room type, server URL or identity is accepted by the
catalogue API. `provider_name` remains the existing editorial source field.

## Admin and type changes

New classic forms retain their existing publication default. Selecting multiplayer
on a new form makes it unpublished. The operator can explicitly publish it later.
Game definitions are a controlled select and capacity is read-only. Inactive launch
inputs remain in form memory when switching type, but are serialized as NULL in
the incompatible database field. Replacing the type updates the same row, without
deleting statistics, identities, reviews or favorites. Selected categories remain.

The existing category relation replacement is retained, as are thumbnail
compare-and-swap and post-save cleanup. Category writes and game writes were not
atomic before this phase and remain so; a category error can follow a saved game.
No R2 helper, auth flow, lobby or registry rule is changed.

## Local validation

Run root `npm test`, `npm run lint`, `npm run build`, `npm run build:cloudflare`,
and game-server `npm test`, `npm run build`.

`npm run test:catalogue-db` creates its own temporary local PostgreSQL cluster,
bound only to 127.0.0.1 on a random port. It never uses a production DSN or local
Supabase credentials. PostgreSQL binaries must be installed; optionally set
`CATALOGUE_TEST_PG_BIN` to their directory. The Windows default is PostgreSQL 18.
It stops its server in a finally block and retains temporary files for inspection.
It verifies preservation of 81 synthetic rows, constraints, uniqueness, changes
of type and refusal to reapply the migration.

## Production application — manual, not performed

1. Confirm enabled RLS and review triggers/dependencies; take a schema/data backup.
2. Apply exactly `supabase/migrations/20261008000100_catalogue_game_types.sql`.
   It runs transactionally and aborts if the URL schema/data or existing new
   columns differ from expectations. A lock timeout makes it fail rather than
   wait indefinitely. Retry after reviewing the failure; never remove safeguards.
3. Check 81 classic rows, unchanged existing values and new constraints/index.
4. Only then deploy the application code. Old code works with the new defaults;
   new admin writes require the migration first. Keep multiplayer rows hidden
   until the later product experience is ready. Do not publish a gameplay promise.

The migration deliberately refuses reapplication instead of silently accepting
an unknown partial schema. Failed statements roll back the complete transaction.
No SQL has been executed against production by this implementation.

## Rollback

Reverting application code does not require dropping the new columns. Retain the
additive schema and keep multiplayer rows unpublished. Do not roll back to classic
only admin code while editing multiplayer records. Do not restore NOT NULL on
`game_url` while any multiplayer row has NULL. A schema rollback requires a fresh
audit and explicit handling of such records; no automatic destructive rollback is
provided. Never delete rows to make a rollback succeed.
