# Inventaire du lot de migrations distribution/runtime

Inventaire extrait des fichiers versionnés le 18 octobre 2026. Les contraintes anonymes/FK, policies, droits et corps de RPC doivent également être comparés via `sql/production-preflight.sql` sur un export du schéma cible. Ce relevé lexical ne remplace pas les tests PostgreSQL ni une analyse de drift.

## 20261016000100_game_distribution_versions.sql

SHA-256 : `ba28b8c5bb129417c9b61265834e067842382a40802e717590ad6bad58518a3c`.

**Tables**

- `public.game_versions`

**RPC / fonctions**

- `public.guard_game_version()`
- `public.guard_active_game_version()`
- `public.set_active_game_version(p_game_id uuid,p_version_id uuid)`

**Triggers**

- `guard_game_version`
- `guard_active_game_version`

**Indexes explicites**

- `game_versions_game_status_idx`

Références FK explicites : `auth.users`, `public.game_versions`, `public.games`.

## 20261016000200_game_build_uploads.sql

SHA-256 : `0a26ad4ecf96c672b74aa9ab18ad2828c558a2a2b1fdb462af58ebac2d91c548`.

**Tables**

- `public.game_developer_members`
- `public.game_build_uploads`
- `public.game_build_outbox`
- `public.game_build_api_limits`

**RPC / fonctions**

- `public.distribution_can_upload(p_actor uuid,p_game uuid)`
- `public.distribution_api_limit(p_actor uuid,p_limit integer)`
- `public.distribution_get_upload(p_actor uuid,p_id uuid)`
- `public.distribution_create_upload(p_actor uuid,p_game uuid,p_version text,p_size bigint,p_request uuid,p_policy jsonb)`
- `public.distribution_attach_transport(p_actor uuid,p_id uuid,p_multipart text)`
- `public.distribution_begin_finalize(p_actor uuid,p_id uuid)`
- `public.distribution_resume_upload(p_actor uuid,p_id uuid)`
- `public.distribution_enqueue_upload(p_actor uuid,p_id uuid,p_etag text)`
- `public.distribution_pending()`
- `public.distribution_dispatched(p_id uuid)`
- `public.distribution_claim(p_id uuid)`
- `public.distribution_checkpoint(p_id uuid,p_lease uuid,p_checkpoint jsonb)`
- `public.distribution_complete(p_id uuid,p_lease uuid)`
- `public.distribution_fail(p_id uuid,p_lease uuid,p_code text,p_retry boolean)`
- `public.distribution_cleanup_candidates()`
- `public.distribution_cleaned(p_id uuid)`

**Indexes explicites**

- `game_build_uploads_pending`

Références FK explicites : `auth.users`, `public.game_build_uploads`, `public.games`.

## 20261016000300_game_artifact_previews.sql

SHA-256 : `cd9af80da8a2b702b521eb1397fece1e6109af107ed4de446a2e71d31abd5457`.

**Tables**

- `public.game_reviewers`
- `public.game_version_delivery_policies`
- `public.game_preview_sessions`

**RPC / fonctions**

- `public.distribution_preview_allowed(p_actor uuid,p_game uuid,p_status text)`
- `public.distribution_resolve_version(p_version uuid)`
- `public.distribution_issue_preview(p_actor uuid,p_version uuid,p_execution text,p_ticket_hash text, p_ticket_seconds integer,p_session_seconds integer,p_limit integer)`
- `public.distribution_exchange_preview(p_session uuid,p_ticket_hash text,p_cookie_hash text)`
- `public.distribution_check_preview(p_session uuid,p_cookie_hash text)`
- `public.distribution_cleanup_previews()`

**Indexes explicites**

- `game_preview_expiration_idx`
- `game_preview_actor_idx`

Références FK explicites : `auth.users`, `public.game_versions`.

## 20261017000100_game_launch_sessions.sql

SHA-256 : `f98a85a994e85f4b4d693c479d9e751054c0e6370dc7823fae7c6f372d9673ab`.

**Tables**

- `public.game_launch_sessions`

**RPC / fonctions**

- `public.distribution_authorize_launch(p_actor uuid,p_game uuid,p_version uuid,p_audience text,p_execution text)`
- `public.distribution_create_launch(p_actor uuid,p_game uuid,p_version uuid,p_audience text,p_execution text, p_capability_hash text,p_control_hash text,p_context jsonb,p_seconds integer,p_actor_limit integer,p_anonymous_limit integer)`
- `public.distribution_check_launch(p_capability_hash text)`
- `public.distribution_revoke_launch(p_id uuid,p_control_hash text)`
- `public.distribution_cleanup_launches()`

**Indexes explicites**

- `game_launch_expiry_idx`
- `game_launch_anonymous_rate_idx`

Références FK explicites : `auth.users`, `public.game_versions`.

## 20261017000200_game_launch_renewals.sql

SHA-256 : `82ba88b2ce1863972f6058134ea71a925490acd79e12062cf6e5187d6fd9e045`.

**RPC / fonctions**

- `public.distribution_renew_launch(p_id uuid,p_control_hash text,p_seconds integer)`

## 20261018000100_online_sessions.sql

SHA-256 : `f6f992365f92cc0efd8475023ffff146796baa9049cbf2b71ad27fb057559846`.

**Tables**

- `public.game_server_deployments`
- `public.game_server_deployment_versions`
- `public.game_online_sessions`
- `public.game_online_participants`
- `public.game_server_credentials`
- `public.game_connection_tickets`
- `public.game_exchange_limits`

**RPC / fonctions**

- `public.distribution_check_deployment_version()`
- `public.distribution_create_server_credential(p_deployment uuid,p_hash text,p_expires timestamptz)`
- `public.distribution_revoke_server_credential(p_id uuid)`
- `public.distribution_close_online_session(p_id text)`
- `public.distribution_remove_online_participant(p_session text,p_participant text)`
- `public.distribution_online_context(p_actor uuid,p_reference text,p_game uuid,p_version uuid,p_locale text)`
- `public.distribution_prepare_online_session(p_version uuid,p_deployment uuid,p_participants jsonb)`
- `public.distribution_issue_connection_ticket(p_launch uuid,p_control_hash text,p_generation uuid,p_ticket_hash text)`
- `public.distribution_exchange_connection_ticket(p_credential_hash text,p_ticket_hash text,p_request uuid)`
- `public.distribution_cleanup_online()`

**Triggers**

- `check_deployment_version`

**Indexes explicites**

- `game_ticket_cleanup_idx`
- `game_ticket_launch_idx`
- `game_ticket_exchange_request_unique`

Références FK explicites : `auth.users`, `public.game_launch_sessions`, `public.game_online_participants`, `public.game_online_sessions`, `public.game_server_credentials`, `public.game_server_deployment_versions`, `public.game_server_deployments`, `public.game_versions`, `public.games`.

## 20261018000200_multiplayer_lobbies.sql

SHA-256 : `c32358fddc94267179e99245bcbe32ee88f67ca7b483edf2104001ad8dcf5247`.

**Tables**

- `public.multiplayer_game_policies`
- `public.multiplayer_lobbies`
- `public.multiplayer_lobby_members`
- `public.multiplayer_lobby_rounds`
- `public.multiplayer_api_limits`

**RPC / fonctions**

- `public.distribution_multiplayer_guard()`
- `public.distribution_multiplayer_access(p_game uuid,p_version uuid,p_access text)`
- `public.distribution_multiplayer_limit(p_actor uuid,p_operation text)`
- `public.distribution_multiplayer_snapshot(p_actor uuid,p_id uuid)`
- `public.distribution_multiplayer_start(p_actor uuid,p_id uuid,p_automatic boolean default false)`
- `public.distribution_multiplayer_create(p_actor uuid,p_game uuid,p_access text,p_request uuid)`
- `public.distribution_multiplayer_mutate(p_actor uuid,p_id uuid,p_action text,p_ready boolean default false)`
- `public.distribution_multiplayer_list(p_actor uuid,p_game uuid,p_after uuid default null)`
- `public.distribution_multiplayer_lookup(p_actor uuid,p_game uuid,p_code text)`
- `public.distribution_multiplayer_round(p_session text,p_event text)`
- `public.distribution_multiplayer_server_event(p_credential_hash text,p_session text,p_event text)`
- `public.distribution_cleanup_multiplayer()`
- `public.distribution_cleanup_online()`

**Triggers**

- `multiplayer_pin`

**Indexes explicites**

- `multiplayer_directory`
- `multiplayer_expiry`
- `multiplayer_waiting_expiry`
- `multiplayer_actor_memberships`
- `multiplayer_round_active`
- `multiplayer_one_unfinished_round`

Références FK explicites : `auth.users`, `public.game_online_sessions`, `public.game_versions`, `public.games`, `public.multiplayer_lobbies`.

## 20261018000300_artifact_catalogue_and_server_roster.sql

SHA-256 : `6d40806e8e0cf1feeb266f2dacbbab8d8439211e47d02f85a9f8033bae7f8ae1`.

**RPC / fonctions**

- `public.get_published_game_runtimes()`
- `public.distribution_server_session(p_credential_hash text,p_session text)`

## 20261018000400_control_plane_maintenance.sql

Ajout GO-LIVE-GATES-1, après les huit fichiers initiaux inchangés.
SHA-256 : `e309e11187b34fb3943692f0efd14768e82c043e99674a2560c5886a67e1fb2d`.

- Fonction `public.distribution_cleanup_sessions()` ; aucune table/index/donnée créée.
- Dépend de `distribution_cleanup_multiplayer()` puis `distribution_cleanup_online()`.
- Advisory lock transactionnel partagé, service_role uniquement, doublons sans travail.
- Worker session-maintenance préparé, exemple Cron désactivé ; aucune application distante.

## Points transverses à vérifier

- Indexes de PK/UNIQUE générés par PostgreSQL en plus des indexes explicites ci-dessus ; tous les CHECK et FK doivent être validés.
- Triggers payload/lifecycle/pointeur, compatibilité deployment et pinning lobby activés ; pas de trigger métier historique incompatible.
- Tables privées en RLS, sans droits anon/authenticated ; accès service explicite. `games` conserve ses droits historiques : vérifier aussi les grants colonne.
- Projection `get_published_game_runtimes()` : SECURITY DEFINER et EXECUTE public contrôlé, données publiées uniquement. Les autres RPC sensibles sont service-only.
- Les réécritures ciblées concernent le CHECK lifetime, le CHECK safe_context et le cleanup online. Les révocations par préfixe exigent un inventaire des fonctions déjà présentes.
- Les statuts/checks ne donnent pas de permissions : vérifier séparément RLS, grants table/colonne/fonction, owner et search_path.
