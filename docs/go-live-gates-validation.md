# Référence de validation GO-LIVE-GATES-1

Relevé historique du 18 octobre 2026, distinct de l’état courant de production.
Les preuves distantes sont limitées à des GET du catalogue
exact configuré, d'abord public puis avec autorisation backend pour vérifier
l'unicité. Ce périmètre ne certifie ni le schéma SQL ni les ressources distantes.

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

La matrice historique [production-go-gates.md](production-go-gates.md) indique NO-GO à cette date :
ces contrôles ne certifient aucune ressource staging/production non créée.
