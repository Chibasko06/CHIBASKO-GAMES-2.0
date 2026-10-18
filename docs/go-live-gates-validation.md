# Validation GO-LIVE-GATES-1

Relevé du 18 octobre 2026. Les preuves distantes sont limitées à des GET du catalogue
exact configuré, d'abord public puis avec autorisation backend pour vérifier
l'unicité. Aucun corps/valeur de credential n'a été conservé. Aucun accès SQL de
production, mutation distante, ressource, DNS, upload ou déploiement.

| Validation | Résultat |
| --- | --- |
| npm ci plateforme et copie isolée | PASS, registre public, Git désactivé dans la copie, aucune dépendance gameplay |
| Audit complet | 17 → 12 : 11 high/1 low restants, outillage dev |
| Audit --omit=dev | 5 → 0 |
| Diff dépendances | Seulement source-map-js 1.2.2, mapping 2.11.29, Resend 6.12.4 ; Svix/UUID retirés |
| Source-map exploit regression | PASS, indexed offsets hors budget rejetés, conversion bornée, worker de test avec deadline |
| Artefact OpenNext | Aucun package source-map-js ; deux modules Next compiled/source-map distincts, aucune route de conversion de maps de jeux |
| Graphe workers/validator | 85 inputs, aucun source-map-js/PostCSS |
| npm test plateforme | PASS, inclut maintenant test:go-live ; tests storage/validator/runtime/online/lobby/admin/mail |
| Tests GO locaux | PASS, 10 tests : identité/catalogue, référence, encodages, preflight, exploit regression et maintenance |
| PostgreSQL jetable | PASS, dix préfixes de schéma, refus des altérations RLS/grants/colonnes/triggers/FK/index/SECURITY DEFINER, grants personnalisés ; maintenance concurrente/idempotente et anon refusé |
| Lobbies DB + Chrome | PASS, deux services, 128 participants, concurrence join/start, replay/refresh/public/private, publication atomique et refus répété |
| Chrome runtime | PASS, 16 tests, origine/stockage/handshake/timeout/lazy assets après 45 min |
| Gateway redaction | PASS, 13 tests ; grant placé dans un path n'est pas loggé, seulement pathSha256 |
| TypeScript/lint ciblé | PASS, y compris nouveaux outils et gateway |
| Next | PASS dans la nouvelle copie isolée avec deps corrigées |
| Cloudflare/OpenNext | PASS, aucun accès Git privé ; Windows/middleware Node gardent leurs avertissements connus, recette distante nécessaire |
| Workers dédiés | PASS, bundles validator main/child, dispatcher, gateway et session-maintenance |
| Pong | PASS, 25 tests + deux admission tests ciblés, build serveur et typecheck |
| Pong chemins | 32 sources inspectées, aucun import relatif non résolu ni différence de casse identifiée ; pas un test Linux réel |
| UUID/build Pong | GET exact unique, type cohérent ; build Web et ZIP 0.3.0 avec identité officielle, sans upload |
| Docker | BLOCKED_EXTERNAL, binaire absent ; aucune image exécutée |
| Linux | BLOCKED_EXTERNAL, aucune distribution WSL installée ; aucun run Linux prétendu |

Le premier npm ci dans l'ancienne copie de validation a rencontré un workerd.exe
verrouillé sous Windows. Une copie neuve a été créée et installée sans supprimer
ni modifier les processus d'autres tâches. Les recettes réussies utilisent cette
nouvelle copie et le nouveau lockfile.

PostgreSQL, Miniflare et le loopback Pong nécessitent une exécution locale hors
sandbox pour les sockets/fichiers temporaires. Les scripts PostgreSQL filtrent
les variables PG héritées et créent leur propre cluster. Les fichiers .env ne sont
pas copiés dans la fixture de build. Les lectures catalogue sont distinctes des tests.

La matrice [production-go-gates.md](production-go-gates.md) reste NO-GO global :
ces contrôles ne certifient aucune ressource staging/production non créée.

## Inventaire des changements

Plateforme : 33 fichiers ajoutés ou modifiés. Les huit migrations antérieures
restent inchangées.

```text
README.md
cloudflare/session-maintenance.ts
cloudflare/wrangler.maintenance.example.jsonc
contracts/production-schema.v1.json
docs/activation/pong-capabilities.json
docs/game-content-domain.md
docs/game-distribution.md
docs/go-live-gates-validation.md
docs/production-activation-checklist.md
docs/production-activation.md
docs/production-go-gates.md
docs/production-migrations.md
docs/production-npm-audit.md
docs/sql/catalogue-game-id.sql
docs/sql/production-schema-snapshot.sql
lib/game-distribution/gateway/gateway.ts
package-lock.json
package.json
scripts/build-distribution.mjs
scripts/catalogue-game-id.mjs
scripts/npm-audit-evidence.mjs
scripts/production-preflight.mjs
scripts/read-json.mjs
scripts/release-state.mjs
scripts/schema-drift.mjs
supabase/migrations/20261018000400_control_plane_maintenance.sql
tests/game-artifact-gateway.test.mjs
tests/game-distribution-db.mjs
tests/go-live-gates.test.mjs
tests/production-preflight.test.mjs
tests/production-schema-reference.mjs
tests/session-maintenance.test.mjs
tests/source-map-security.test.mjs
```

Pong : six fichiers modifiés, sans changement du gameplay.

```text
.dockerignore
Dockerfile
README.md
server/main.ts
server/standalone.ts
tests/admission.test.mjs
```

SDK : aucun fichier modifié. Les artefacts de recette sont hors des sources
versionnées. Les scans des sources modifiées ne détectent aucun credential,
lien local manquant ni formulation conversationnelle. Ces scans par motifs
complètent la revue des logs et ne constituent pas une preuve exhaustive
d'absence de secrets. Le contrôle git diff --check est exécuté dans les trois
dépôts ; aucun commit, tag ou push n'est réalisé.
