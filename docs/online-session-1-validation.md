# ONLINE-SESSION-1 — validation et périmètre

## Contrat livré

SDK 0.3.0 préparé, Bridge v2 et integrationVersion 1. SDK npm 0.2.0 reste
immuable et son Bridge v1 fonctionne avec le même runtime. La licence SDK est
inchangée. Aucun SDK source n'est réintroduit dans le repository plateforme.

Le navigateur reçoit le bootstrap uniquement au START après READY. Le control
plane conserve les identités Auth, sélectionne le deployment et vérifie les
participants. Le ticket aléatoire de 256 bits, valable au plus trois minutes,
est uniquement hashé. Le serveur échange le ticket avec sa propre credential,
également hashée, pour obtenir les claims publics de session et de participant.
La réponse retry est stable pendant 30 secondes avec la même credential et la
même clé d'opération ; les autres rejeux sont refusés atomiquement en PostgreSQL.
Le serveur gameplay conserve l'unicité de l'admission et gère son reconnect.

Voir `online-sessions.md` et `sdk-browser-bridge-v2.md` pour les API, ressources,
permissions, limites, erreurs, révocation, nettoyage et transitions.

## Recette exécutée

- SDK : npm ci, build, compilation serveur sans DOM, typecheck et 25 tests
  core/client/server/React/release ; aucun nouveau runtime dependency.
- SDK : 12 tests Chrome 155, ESM et standalone, intégration au bridge réel,
  consommateur tarball extérieur, HTML sans bundler et TypeScript client/serveur.
- Plateforme : 26 tests runtime/compatibilité, 6 tests online et 16 scénarios
  Chrome runtime, dont sessions preview/published et lazy assets à 45 minutes.
- Compatibilité : 4 scénarios Chrome du vrai contrôleur GameRuntime avec son
  client HTTP, le SDK 0.2.0 installé depuis npm et le tarball 0.3.0, en local/online.
  Le scénario online v2 utilise un roster de 128 participants et reçoit le ticket
  uniquement via l'appel START. Toutes les routes HTTPS sont interceptées localement.
- PostgreSQL 18 jetable : migrations distribution/upload/preview/launch/renewal
  et online, RLS, contraintes, roster 128, expiration, rotation, révocation,
  consommation atomique, retry/replay et deux exchanges concurrents.
- Régression distribution : 8 tests build/ZIP/hash/keys, 35 tests upload/gateway
  incluant les sous-tests ZIP dangereux, TypeScript et lint ciblé.
- Build Next Webpack réussi ; bundles validator, dispatcher et Artifact Gateway
  réussis. Le build par défaut Turbopack échoue dans le traitement CSS du package
  Pong legacy, également hors sandbox Windows. Aucune correction Pong associée.
- Les tests de temps virtuel utilisent une base d'horloge backend fixe pour éviter
  une dérive avec le temps mural du runner. Aucune policy de bail n'est relâchée.
- git diff --check et scans de credentials/convention de rédaction passent.

Archive SDK préparatoire : `chibaskogames-sdk-0.3.0.tgz`, 30 fichiers, 29033 octets.
SHA-256 : `18cac82210d4fc3af2250da16adbe98da97d9700f00d9fb2af0d28ebed6c180c`.
Le tarball contient JS/déclarations, standalone/intégrité, README/CHANGELOG, licence,
FAQ et documentation publique online. Aucun test, source TS ou script interne.

## Activation et suite

Les migrations sont seulement préparées et testées sur PostgreSQL jetable.
Les flags d'activation et l'ancien parcours produit restent en place. Avant
PONG-MIGRATION : relier l'adaptateur lobby au port backend de préparation,
configurer un deployment compatible et sa policy réseau approuvée, intégrer
l'exchange dans le serveur gameplay et le contexte START dans le build Pong.
La publication séparée du SDK 0.3.0 et l'activation d'infrastructure suivent leur
procédure de release/déploiement. Le pipeline client universel est conservé.

Pong est en lecture seule pendant cette phase. Aucun tag, commit, push,
publication npm, déploiement, secret réel ou changement d'infrastructure.
Les credentials et tickets utilisés par la recette sont exclusivement des fixtures.
Les anciens accès Git privés et leur blocage Cloudflare ne sont pas contournés.

## Fichiers plateforme

```text
app/api/game-launches/[launchId]/start/route.ts
app/api/game-server/v1/tickets/exchange/route.ts
docs/game-runtime.md
docs/online-session-1-validation.md
docs/online-sessions.md
docs/sdk-browser-bridge-v1.md
docs/sdk-browser-bridge-v2.md
lib/game-distribution/gateway/launch.ts
lib/game-distribution/uploads/repository.ts
lib/game-runtime/bridge.ts
lib/game-runtime/client.ts
lib/game-runtime/contracts.ts
lib/game-runtime/controller.ts
lib/online-session/contracts.ts
lib/online-session/service.ts
lib/server/gameLaunches.ts
lib/server/onlineSessions.ts
package.json
supabase/migrations/20261018000100_online_sessions.sql
tests/game-distribution-db.mjs
tests/game-runtime.browser.test.mjs
tests/game-runtime.test.mjs
tests/helpers/runtime-harness.mjs
tests/online-session-db.sql
tests/online-session.browser.test.mjs
tests/online-session.test.mjs
```

## Fichiers SDK

```text
CHANGELOG.md
README.md
docs/online-sessions.md
docs/sdk-browser-1.md
package-lock.json
package.json
scripts/release-policy.mjs
scripts/test-consumer.mjs
src/browser-contracts.ts
src/client/browser/connection.ts
src/client/browser/errors.ts
src/client/browser/protocol.ts
src/client/index.ts
src/index.ts
src/online-contracts.ts
src/server/client.ts
src/server/index.ts
tests/browser.test.mjs
tests/client.test.mjs
tests/core.test.mjs
tests/fixtures/game-app.js
tests/fixtures/host.js
tests/helpers/fake-window.mjs
tests/release.test.mjs
tests/server.test.mjs
```
