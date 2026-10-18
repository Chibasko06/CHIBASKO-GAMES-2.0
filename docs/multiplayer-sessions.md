# Multiplayer control plane

> État après PONG-MIGRATION-1 : le portail ne contient plus de package jeu,
> player source ni serveur gameplay. Les sections de bilan des phases antérieures
> décrivent leur état historique. Le parcours courant et les prérequis production
> sont documentés dans [pong-migration.md](pong-migration.md).

## Responsibilities and migration boundary

PostgreSQL is the source of truth for the artifact-based multiplayer path. API
instances retain no seats, directory, roster, readiness or countdown in memory.
A lobby organizes a group; an online session authorizes one match; the gameplay
server executes it. Gameplay traffic never uses lobby polling or the Bridge.

The package player remains a separate legacy consumer until PONG-MIGRATION:
`productSession`, `connectLobby`, `LobbyRoom`, `PublicLobbyDirectory`,
`GameSessionCoordinator`, the client/server package registries and their admission
adapter still serve that path. Its Colyseus directory and membership are process
local. They are not used by the new API. Removing them before migrating the player
would break the existing game. No new artifact game registers there.

Generic reusable infrastructure: authenticated profiles, manifest capabilities,
immutable versions, GameRuntime, launch authorization, opaque online participants,
deployment/version bindings and ticket exchange. Historical Pong-specific pieces:
the package loaders, room installation, rendering, CSS and package integration
tests. Those remain isolated until migration, with no changes to Pong sources.

## Durable model

- `multiplayer_game_policies`: platform configuration, `manual` by default or
  `when_full`; absent rows use manual start. The build does not choose this policy.
- `multiplayer_lobbies`: game UUID, immutable version pin, public/private access,
  random public-safe UUID, private lookup code, capacity, leader, revision and expiry.
- `multiplayer_lobby_members`: unique actor/lobby membership, separate random public
  member ID, readiness, stable join ordering. Profiles provide public display names.
  Auth IDs remain backend-only. Avatars are omitted from the initial projection.
- `multiplayer_lobby_rounds`: ordered sessions of the same group across replay.
- `multiplayer_api_limits`: shared actor/action minute quotas, including failed
  code guesses. Limits commit separately from mutations and work across instances.

Existing `game_online_sessions`, `game_online_participants`,
`game_server_deployments`, deployment/version bindings, credentials and ticket
tables are reused. No second participant identity or gameplay credential system.

The version is pinned at creation from `games.active_version_id`, after checking
published catalogue/version and the requested capability. Active pointer changes
never silently replace a waiting group's build. START rechecks publication and
selects an active deployment bound to that exact version. Selection is currently
deterministic by creation time/ID; region-aware selection can refine that query
without changing the browser/bootstrap contract.

## Lifecycle and concurrency

`waiting → starting → playing → results → waiting`, or `closed`.

Every mutation takes the lobby row lock before reading or changing membership.
Concurrent final-seat joins cannot both succeed. Unique membership makes rejoin
idempotent. START validates capacity and all ready flags, locks the version and
deployment, calls `distribution_prepare_online_session`, writes the round and
changes status inside one transaction. Concurrent START returns the same session.
A leave racing START either precedes the frozen roster or cancels the starting
round, closes its session and moves the remaining group to results for replay.
Leave during playing revokes future admission; the gameplay server handles its
established connection and outcome. Neither case rewrites participant identity.

Manual start requires the leader. `when_full` starts atomically when the final
member becomes ready. No game ID, two-player assumption or local countdown.
The first remaining member by join time/ID becomes leader on explicit leave;
refresh, HTTP disconnect and tab close do not transfer leadership or remove anyone.
An empty lobby closes, including its unfinished online session.

The deployment-authenticated API
`POST /api/game-server/v1/sessions/{sessionId}/lifecycle` accepts
`{"event":"playing"}` or `{"event":"results"}`. It uses the existing deployment
Bearer credential, hashes it before the DB call and checks active deployment,
credential validity and session binding. Limits and errors follow the exchange
model. Browser user tokens are not accepted. Retries and old-round notifications
are harmless. Its trusted orchestration function updates the lobby after
authoritative match admission/completion. The legacy server does not emit these
durable events yet; its adapter will switch during migration. Results close the online session, preserve
the round and permit leader replay. Replay clears readiness, retains the lobby and
version pin, and creates a fresh session only on the next START. Old tickets and
participants are not reused. Late completion events for old rounds are ignored.

## API and authorization

All endpoints authenticate an explicit portal Bearer token using server-side
`auth.getUser`. POST validates same origin for browser callers; CLI requests may
omit Origin. Bodies are strict and never accept actor, owner, roster, capacity,
deployment or online session supplied by the browser.

| Method | Route under `/api/multiplayer` | Input |
| --- | --- | --- |
| POST | `/lobbies` | `gameId`, `access`, random UUID `requestId` |
| GET | `/games/{gameId}/lobbies?after={cursor}` | public directory, 25 rows |
| GET | `/lobbies/{id}` | member-only snapshot |
| POST | `/lobbies/join-code` | `gameId`, `code` |
| POST | `/lobbies/{id}/join` | `{}`; public join or existing member rejoin |
| POST | `/lobbies/{id}/ready` | boolean `ready` |
| POST | `/lobbies/{id}/start` | `{}` |
| POST | `/lobbies/{id}/leave` | `{}` |
| POST | `/lobbies/{id}/replay` | `{}` |

Create retries use the same request UUID. START is idempotent while its round is
active. Private lookup normalizes trim/uppercase and checks 20 hex characters.
The UUID-derived code contains 74 random bits and has a unique DB constraint.
Knowing a lobby UUID does not grant private membership. The code is never an
admission ticket or a gameplay secret. Directory excludes private, expired, full,
closed, starting and unpublished versions. Pagination uses UUID keyset order.

Responses use `{data: ...}` or `{error:{code}}`. Stable errors include
`unauthorized`, `forbidden`, `invalid_request`, `lobby_not_found`, `lobby_full`,
`lobby_expired`, `not_ready`, `invalid_state`, `unsupported_access`,
`game_not_available`, `version_unavailable`, `deployment_unavailable`,
`request_conflict`, `rate_limited`, `service_unavailable` and `database_error`.
Unknown storage/SQL exceptions never reach the response. Responses are no-store.

RLS is enabled and browser roles have neither table access nor RPC execution.
Only backend service-role calls supply the verified actor. Existing deployments,
ticket hashes and credentials remain private. Role credentials never enter an
iframe, lobby projection, URL or log. Multiplayer remains authenticated-only.

## UI, GameRuntime and membership

Pages `/online`, `/private`, `/lobby/{id}` use the durable API when a catalogue
game has an active artifact version; legacy games retain their package player.
Refresh restores the member snapshot from the URL, without a join/create side
effect. Multiple tabs share membership and readiness, but each runtime still owns
its launch/generation. A tab's explicit leave affects the shared membership.

The UI uses non-overlapping polling after each completed request: five seconds
visible, thirty seconds hidden, fifteen-second HTTP deadline, cancellation on
unmount. The DB remains authoritative; presence is intentionally separate. Polling
can later be replaced with invalidation notifications without changing mutations.
Directory queries are game-scoped, indexed and bounded. No global in-memory scan.

When a round is starting/playing, GameRuntime receives only game/version and its
opaque `onlineSessionReference`. OnlineLaunchAuthorizer resolves the authenticated
participant from the existing online session. READY → runtime START creates the
fresh gameplay ticket. Public/private affects discovery, never this bootstrap.

## Expiry and maintenance

Waiting lobbies have a thirty-minute admission window, bounded by a fixed
twenty-four-hour lobby lifetime. Replay grants another waiting window within that
same ceiling. Browser presence does not extend the ceiling. API joins/start refuse
expired lobbies even before cleanup runs.

`distribution_cleanup_multiplayer()` is idempotent and uses `SKIP LOCKED` to
support shared maintenance runners. It closes expired groups/sessions and removes
closed lobbies after seven days beyond the ceiling. Closed rounds retain their
online session references until lobby retention ends; online GC respects those
references. Minute quota rows expire after an hour. No local timer or production
cron is configured. Durable long-term match results belong to the results store,
not these transient coordination records.

## SDK and remaining release prerequisites

Web and game-server consume exact public npm SDK `0.3.0`, integrationVersion 1.
Their historical Pong Git release still requires peer SDK `0.1.0`. A scoped npm
override supplies the host's `0.3.0` to that legacy package, with integration tests
protecting the retained facade. Remove this override with the package consumer.
The immutable Pong Git tag also has its own historical Git SDK devDependency
inside `prepare`; changing the platform lockfiles cannot rewrite that release.
Consequently a fresh remote Pong Git preparation can still request the old private
SDK transitively. PONG-MIGRATION removes the entire dependency and its prepare step.
No PAT, deploy key or GitHub App is part of the target build architecture.

Before activation: apply the ordered prepared migrations through the deployment
process, register a compatible active deployment, enable artifact delivery/runtime
configuration and connect authoritative lifecycle events. These are deployment
prerequisites, not operations performed by tests. No production migration here.

## Verification

`npm run test:multiplayer` validates HTTP/service boundaries and safe errors.
`npm run test:multiplayer-db` creates its own disposable PostgreSQL cluster,
applies the distribution/online/lobby migrations, tests RLS/constraints, expiry,
codes, readiness, leader transfer and replay, then exercises distinct service
instances with independent DB connections. Join/start races and a 128-participant
roster use the same RPCs as the API. Chrome mounts the actual lobby UI against
the HTTP handler and disposable database for public/private, refresh, START and
results/replay. Only auth and the artifact player are fixture adapters in this
control-plane browser test; the runtime's own browser tests cover its iframe.


## Files changed in MULTIPLAYER-SESSION-1

- `README.md`
- `app/api/game-server/v1/sessions/[sessionId]/lifecycle/route.ts`
- `app/api/multiplayer/[...segments]/route.ts`
- `app/games/[slug]/lobby/[code]/page.tsx`
- `app/games/[slug]/online/page.tsx`
- `app/games/[slug]/page.tsx`
- `app/games/[slug]/private/page.tsx`
- `components/multiplayer/ArtifactOnlineLinks.tsx`
- `components/multiplayer/DurableLobby.tsx`
- `docs/game-runtime.md`
- `docs/multiplayer-sessions.md`
- `docs/pong-extraction.md`
- `docs/sdk-extraction.md`
- `game-server/README.md`
- `game-server/package-lock.json`
- `game-server/package.json`
- `game-server/src/lobby/PublicLobbyDirectory.ts`
- `lib/game-distribution/uploads/repository.ts`
- `lib/multiplayer-lobby/client.ts`
- `lib/multiplayer-lobby/contracts.ts`
- `lib/multiplayer-lobby/service.ts`
- `lib/server/multiplayerLifecycle.ts`
- `lib/server/multiplayerLobbies.ts`
- `lib/server/onlineGamePage.ts`
- `lib/server/publishedOnlineAccess.ts`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `scripts/build-game-sdk.mjs`
- `scripts/test-sdk-extraction.mjs`
- `scripts/test-sdk-platform.mjs`
- `supabase/migrations/20261018000200_multiplayer_lobbies.sql`
- `tests/game-distribution-db.mjs`
- `tests/game-sdk.test.mjs`
- `tests/multiplayer-db-runner.mjs`
- `tests/multiplayer-lobbies.test.mjs`
- `tests/multiplayer-lobby-db.sql`
- `tests/multiplayer-lobby.browser.mjs`
- `types/database.ts`
