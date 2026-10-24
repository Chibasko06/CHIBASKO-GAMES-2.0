# GO-LIVE-GATES-1

Référence historique du 18 octobre 2026, **NO-GO à cette date**. Cette matrice ne
décrit pas l’état actuel des ressources déployées. Les preuves locales ne remplacent
ni le snapshot production ni les ressources et recettes d'infrastructure.
Les états sont : PASS (preuve obtenue sur le périmètre indiqué), BLOCKED_EXTERNAL
(accès, décision externe ou runtime absent), REQUIRES_ACTION (opération identifiée
restant à exécuter). Aucun état ne signifie qu'une ressource distante a été activée.

## Matrice

| Gate | Status | Evidence | Action |
| --- | --- | --- | --- |
| Architecture universelle | PASS | Aucun package gameplay/Git privé ; SDK public exact ; tests artefacts/runtime/control plane | Conserver ces frontières au déploiement |
| Migrations de référence | PASS | Neuf migrations couvertes par les tests PostgreSQL jetables et la référence par préfixe | Vérifier le drift et la sauvegarde avant application |
| Schema drift production | BLOCKED_EXTERNAL | Pas de connexion PostgreSQL de production configurée ; GET catalogue ne permet pas de lire FK/RLS/triggers | Exécuter le snapshot READ ONLY et le comparateur ci-dessous |
| npm runtime security | PASS | `npm ci`, audit production : 0 ; correctif source-map-js testé ; Resend patch et chaîne nettoyée | Refaire audit + empreinte lock à la release |
| Outils npm de développement | REQUIRES_ACTION | 12 alertes restantes : 11 high, 1 low, hors graphe npm de production | Ne pas exposer Miniflare/dev servers ; maintenance compatible des outils séparée, aucune rétrogradation Next automatique |
| SDK | PASS | npm exact 0.3.0 et compatibilité Bridge | Ne pas remplacer les versions publiées |
| Pong build | PASS | Build/validate/ZIP 0.3.0 avec UUID officiel, 9 fichiers ; tests moteur/admission | Vérifier conflit de version avant upload réel |
| Docker | BLOCKED_EXTERNAL | Binaire Docker absent ; aucune image construite/exécutée | Recette Docker Linux complète ci-dessous |
| Linux réel | BLOCKED_EXTERNAL | Aucune distribution WSL installée ; source et chemins audités seulement | Exécuter build/tests/container sur Linux |
| Domaine de contenu | REQUIRES_ACTION | Aucun domaine choisi ni acheté | Choisir suivant la fiche domaine ; vérifier possession/DNS/TLS |
| PRIVATE PSL | BLOCKED_EXTERNAL | Pas de candidat accepté ; aucune soumission effectuée | Acceptation + propagation tldts et Chrome/Firefox/Safari supportés |
| R2 | REQUIRES_ACTION | Port/policy/tests locaux validés ; aucun bucket nouveau créé | Buckets staging/final privés par environnement, CORS et droits minimaux |
| Queue/DLQ | REQUIRES_ACTION | Outbox/pull/retry testés localement | Créer/configurer file pull, DLQ et alertes séparées |
| Validator | REQUIRES_ACTION | Node isolé/quotas/tests statiques opérationnels localement | Déployer et mesurer scratch/quotas/kill/retry sur cible réelle |
| Artifact Gateway | REQUIRES_ACTION | Bundle et tests locaux ; aucune route distante | Configurer R2/DB, domaines et redaction amont, puis recette |
| Staging réel | REQUIRES_ACTION | Architecture et noms de configuration définis, aucune ressource créée | Reproduire la production avec isolation stricte et vraie frontière PSL |
| Server deployment | REQUIRES_ACTION | Serveur autonome et admission fixtures passent | Enregistrer deployment compatible, provisionner credential et TLS hors Git |
| Monitoring | REQUIRES_ACTION | Logs sûrs et compteurs Pong disponibles ; aucune alerte distante configurée | Connecter logs/sondes et seuils minimaux de cette fiche |
| Cleanup scheduler — code | PASS | Worker dédié, RPC transactionnelle verrouillée, tests concurrence/idempotence/RLS | Déployer le Worker seulement après migration 9 |
| Cleanup scheduler — activation | REQUIRES_ACTION | Exemple désactivé, aucun cron distant créé | Configurer env/secret et Cron Trigger 5 min ; tester alertes |
| UUID officiel Pong | PASS | GET exact slug, une seule ligne y compris hors RLS publique, UUID/type vérifiés | Utiliser cet UUID ; contrôle des capabilities actives à refaire après migrations/upload |
| Artifact preview distante | REQUIRES_ACTION | Runtime/preview testés localement, pas d'artefact uploadé ni de portail preview distant | Harness admin générique + ressources + comptes de recette ; pas de publication provisoire |
| Rollback | PASS | Procédure explicite de première version et guards SQL testés | Sauvegarder/éprouver restauration et drainage sur staging avant GO |

## 1. Security gate

Avant : **17 alertes** (12 high, 4 moderate, 1 low), dont **5 dans le graphe npm
de production**. Après correction ciblée : **12 alertes**, toutes dev (11 high,
1 low), et **0 avec `npm audit --omit=dev`**. Aucun `audit fix --force`, override,
changement Next/React/SDK ou ajout de dépendance Git.

| Paquet initial | Direct / chaîne | Usage et atteignabilité identifiée | Correction |
| --- | --- | --- | --- |
| source-map-js 1.2.1 | Transitive : PostCSS → source-map-js ; Tailwind/node → source-map-js ; jsdom → css-tree → source-map-js | Compilation CSS et tests. Aucun flux ZIP/R2/game code ne passe dans PostCSS. Le sink est SourceNode.fromStringWithSourceMap sur indexed mappings ; il est corrigé et testé, pas seulement déclaré transitif. | **1.2.2**, patch accepté par les ranges existants |
| baseline-browser-mapping 2.10.20 | Transitive : Next → mapping ; Babel/browserslist → mapping | Outillage de cibles navigateur ; pas d'import dans les composants applicatifs ni d'entrée joueur dirigée vers son parser | **2.11.29**, même branche 2.x |
| resend 6.12.2 | Directe ; ancien parent de Svix | Serveur mail reset uniquement ; aucun import navigateur. API de mail existante préservée par patch ; tests reset et erreurs Resend passent | **6.12.4 exact**, patch |
| svix 1.90.0 | Transitive : Resend → Svix | Ancienne implémentation webhook fournisseur ; aucun endpoint webhook Svix projet | Supprimée par Resend 6.12.4, qui utilise directement standardwebhooks |
| uuid 10.0.0 | Transitive : Svix → uuid | Avis sur v3/v5/v6 avec buffer fourni ; aucune de ces primitives appelée avec une entrée externe par le projet | Supprimée avec Svix ; aucun upgrade major direct imposé |

Le [patch Resend officiel](https://github.com/resend/resend-node/releases/tag/v6.12.4)
et les métadonnées npm confirment cette évolution. Le
[correctif source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
est 1.2.2. Son test isolé vérifie le refus d'un offset hors budget et une conversion
bornée avec un offset d'un million de lignes sur un seul caractère de source.
Un worker de test est arrêté après 3 s en cas de régression ; aucune bombe n'est
envoyée à l'application.

### Preuves de présence et de chemin

- `npm explain source-map-js --json` et `npm ls ... --all` donnent les parents et
  la résolution unique 1.2.2 ; le lockfile conserve les intégrités du registre public.
- Le graphe esbuild des gateway/dispatcher/maintenance/validator main+child contient
  85 modules et **aucun source-map-js/PostCSS**. Le validateur extrait les fichiers
  comme données, ne compile ni CSS ni JS de jeu.
- L'ancien artefact OpenNext ne contenait aucun package nommé source-map-js.
  Deux modules **Next `dist/compiled/source-map`** restent distincts : ne pas les
  confondre avec le package npm corrigé. Les sourcemaps de traces serveur portent sur
  les chunks du portail ; les builds jeu sont servis en iframe et ne sont pas exécutés
  dans ce process. Aucune route de conversion de sourcemap fournie par un jeu n'existe.
- La sortie OpenNext reconstruite après `npm ci` a été inspectée de nouveau : aucun
  package source-map-js, les deux mêmes modules Next compiled/source-map. Un compteur
  npm nul ne constitue pas à lui seul cette analyse de flux.

**Security gate runtime : PASS pour staging/prod sur cette release candidate**, sous
réserve des validations de build de ce relevé et d'un audit frais à la promotion.
Les outils dev vulnérables ne deviennent pas des services publics : en particulier
Wrangler/Miniflare et leur sharp imbriqué restent limités à des recettes locales
de confiance. Les alertes héritées ESLint/glob ne justifient pas un downgrade Next 16
vers 14. Le [rapport PREP](production-npm-audit.md) reste le relevé historique avant correction.

## 2. Drift : snapshot READ ONLY et comparaison des objets

Le snapshot `docs/sql/production-schema-snapshot.sql` démarre READ ONLY et termine
par ROLLBACK. Aucun appel de mutation ni lecture de lignes credentials/tickets.
Il exporte métadonnées uniquement : colonnes/types/defaults, PK/FK/CHECK/UNIQUE,
indexes, triggers activés, RLS/policies, privilèges effectifs navigateur/service,
signatures/config/security/empreinte SHA-256 des corps de fonctions. Les corps
SQL eux-mêmes et leurs éventuels littéraux ne sont pas exportés.

`scripts/schema-drift.mjs` ne se connecte pas au réseau et n'écrit aucun fichier.
Il compare à `contracts/production-schema.v1.json`, produite sur PostgreSQL jetable
depuis les migrations versionnées : dix états connus (avant lot, puis après chacun
des neuf fichiers). La référence vérifie les SHA des migrations, pas leur ledger seul.

- PASS : objet conforme à un état connu et préconditions satisfaites.
- DIFFERENCE_EXPECTED : objet absent car sa migration fait partie du suffixe restant.
- BLOCKING_DRIFT : objet altéré/inconnu, manque dans un état partiel, droit plus large,
  trigger/RLS désactivé, FK/index/colonne/fonction différents ou précondition manquante.

Un ensemble d'objets individuellement plausibles ne suffit pas : le schéma géré doit
correspondre à **un préfixe entier**. Les tables historiques sont vérifiées sur leurs
préconditions nécessaires (PK, UUID/types, slug unique, FK identité, policies/grants,
lecture profils) ; les autres données historiques restent à auditer avec le préflight
SQL détaillé. Des triggers catalogue historiques non reconnus bloquent pour examen,
ils ne sont jamais supprimés automatiquement. Une différence de rendu metadata entre
versions PostgreSQL doit être examinée, pas ignorée ni transformée en PASS automatique.

Commande production, avec le service PostgreSQL/pgpass **déjà géré** dans l'environnement :

```powershell
$snapshot=Join-Path $env:TEMP 'chibasko-production-schema.json'
psql -X --no-password -v ON_ERROR_STOP=1 -f docs/sql/production-schema-snapshot.sql |
  Set-Content -Encoding utf8 -LiteralPath $snapshot
if ($LASTEXITCODE -ne 0) { throw 'Snapshot production indisponible' }
node scripts/schema-drift.mjs $snapshot
```

Pas de mot de passe/DSN dans la commande ou le dépôt. Les lecteurs JSON acceptent
UTF-8/BOM et la redirection UTF-16LE de Windows PowerShell 5. Une credential REST
Supabase ne remplace pas un accès PostgreSQL autorisé aux métadonnées ; ce gate reste
BLOCKED_EXTERNAL. Le résultat expose aussi `dataIntegrity=not_checked` : les données,
backups et conflits de versions exigent encore leurs contrôles d'activation.

Régénération/régression **locale seulement** :

```text
node tests/production-schema-reference.mjs --write
node tests/production-schema-reference.mjs
```

Ce builder crée son propre cluster loopback, filtre les variables PG héritées et
ne prend pas de DSN. Les altérations RLS/grants/colonnes/triggers sont injectées
uniquement dans ce cluster pour prouver leur refus.

## 3. Identité officielle et build

Lecture GET effectuée sur le catalogue du projet correspondant à la configuration
versionnée : slug exact `chibasko-pong`, une seule ligne visible également avec
la credential backend existante, type `multiplayer_chibasko`.

```text
PONG_GAME_ID=c4245041-271b-4b10-a133-89a3fa8c2119
GAME_BUILD_VERSION=0.3.0
```

Ce sont des métadonnées catalogue, pas des credentials. Aucune identité fixture
n'est utilisée. Le build réel valide localement local 2/2, online public+private 2/2.
La présence/cohérence d'une version active en production n'a pas été certifiée par
la lecture initiale ; elle devra être contrôlée après le snapshot et l'upload.

Nouvelle vérification SQL, exacte et sans écriture :

```powershell
$catalogue=Join-Path $env:TEMP 'chibasko-catalogue-identity.json'
psql -X --no-password -v ON_ERROR_STOP=1 -v game_slug=chibasko-pong -f docs/sql/catalogue-game-id.sql |
  Set-Content -Encoding utf8 -LiteralPath $catalogue
if ($LASTEXITCODE -ne 0) { throw 'Lecture catalogue indisponible' }
node scripts/catalogue-game-id.mjs $catalogue chibasko-pong docs/activation/pong-capabilities.json multiplayer_chibasko
```

Le contrôle refuse zéro/deux lignes, slug différent, UUID fixture/invalide, mauvais
type ou linkage/capabilities actifs incohérents. Sans active_version_id, il indique
DIFFERENCE_EXPECTED pour les capabilities actives, pas un faux contrôle réussi.
Le type catalogue attendu est un paramètre explicite (`classic` est aussi accepté) ;
il ne se déduit pas du moteur ou du manifest.
Un fichier de capabilities attendu est un input d'activation, jamais un traitement
gameId spécial dans les services runtime/distribution.

Le ZIP 0.3.0 a été construit **localement seulement** avec cette identité :
9 fichiers, 430 324 octets décompressés, ZIP 140 148 octets,
SHA-256 `b93370e99cc4dcc5e372c35aaa675eff5aae47807246c0e38840820794be05ea`.
Aucun upload ni création de game_version effectué. Refaire le contrôle d'unicité
game/version avant publication ; une DRAFT préexistante est déjà immuable.

## 4. Docker et Linux

Audit source Pong : multi-stage Node 24 bookworm-slim, npm ci verrouillé,
build serveur puis prune --omit=dev, image finale sans sources/tests, USER node,
NODE_ENV production, HOST 0.0.0.0, PORT 2567, CMD exec Node. Healthcheck Node natif
ajouté (pas de curl à installer), secrets/configs/caches exclus du build context.
Les credentials restent injectées à l'exécution, aucune valeur réelle dans l'image.

Le health HTTP est un **liveness check**, pas une preuve de credential valide ou de
deployment actif : une admission et un exchange de recette restent obligatoires.
SIGTERM/SIGINT appellent le graceful shutdown ; les tests admission/WebSocket
locaux passent mais ne prouvent pas les signaux Unix/PID 1 d'un container.

Les scripts utilisent Node/path/URLs, pas de commandes shell Windows dans le runtime.
Imports/casse et sorties compilées sont audités ; aucun chmod ou script .sh nécessaire
au CMD. Les fins de ligne SQL des tests sont normalisées ; le lecteur metadata gère
les encodages PowerShell. **Linux n'a pas été exécuté** sur ce poste.

Docker absent et aucune distribution WSL installée : BLOCKED_EXTERNAL, sans
certification de taille d'image. À exécuter sur Linux, avec fixtures exclusivement :

1. docker build avec version/digest conservés ; mesurer taille réelle.
2. démarrer le serveur HTTP fixture d'exchange/roster/lifecycle de la recette dans
   un réseau Docker privé ; aucune credential production ni mode bypass du serveur.
3. docker run Node avec HOST/PORT, API fixture, credential fictive et origins de recette.
4. vérifier boot, /health, admission valide/invalide/expired/replay, deux clients WSS
   via proxy de recette, puis résultat/forfait.
5. envoyer docker stop (SIGTERM), vérifier fermeture et exit, docker start puis health,
   retester une nouvelle session ; pas de reconnect garanti après crash.
6. vérifier logs sans valeurs sensibles, compteurs, CPU/RAM et redémarrage Docker.

Les commandes d'image et de runtime sont dans le runbook ; les tests
`npm test`, `npm run test:admission`, `npm run typecheck` passent sur le poste actuel.
Ne pas utiliser le test Node Windows comme substitut à cette checklist Linux.

## 5. Domaine et staging

La [fiche domaine](game-content-domain.md) fixe les critères sans choisir/acheter
de domaine ni traiter les coûts. Aucun nom réel supplémentaire n'est configuré.
Le runtime public reste NO-GO avant la chaîne : possession d'un domaine dédié distinct
→ wildcard DNS/TLS/routage → acceptation PRIVATE PSL → tldts verrouillé mis à jour
→ Chrome/Firefox/Safari supportés avec test de rejet cookie parent et isolation stockage.
Une demande PSL peut être refusée ; pas de flag de contournement.

En local, fixtures interceptées/contrôlées sous un suffixe connu peuvent prouver le
comportement du navigateur sans déployer sur ce domaine. Cela ne valide ni DNS/TLS
ni un nouveau domaine distant. Un staging distant exige lui aussi une base reconnue.
`staging.<base-production>` n'est pas automatiquement un suffixe privé reconnu.
Prévoir deux bases acceptées ou une entrée PRIVATE wildcard acceptée qui couvre
les bases d'environnement ; valider les deux avec le même code et les navigateurs.

| Composant staging | Configuration à fournir | Isolation requise |
| --- | --- | --- |
| Supabase | NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, SUPABASE_URL/SERVICE_ROLE_KEY propres | Projet/DB et comptes séparés de production |
| Portail Worker | NEXT_PUBLIC_SITE_URL, flags, ASSETS, CHIBASKO_ASSETS | Build public paramétré pour l'origine staging, médias staging |
| R2 distribution | GAME_BUILDS_R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY, STAGING_BUCKET/ARTIFACTS_BUCKET | Deux buckets privés staging, permissions ne couvrant pas les buckets prod |
| Queue | BUILD_VALIDATIONS, GAME_BUILDS_QUEUE_ID/QUEUE_TOKEN, DLQ | Producer/pull/ack staging uniquement |
| Validator | DB/R2/Queue staging, scratch isolé | Aucun secret/endpoint prod injecté |
| Gateway | ARTIFACTS, bases de contenu, GAME_PORTAL_ORIGINS staging | Binding final staging, DB staging, route wildcard de cette base seulement |
| Maintenance | SUPABASE_URL/SERVICE_ROLE_KEY staging, flag dédié | Le cron staging ne peut pas muter la DB prod |
| Pong deployment | CHIBASKO_PLATFORM_API_URL, DEPLOYMENT_CREDENTIAL, PONG_CONTENT_BASES | Credential et endpoint staging, pas d'origin staging autorisée sur serveur prod |

Les noms courts du tableau correspondent aux variables complètes `GAME_BUILDS_*`
et `CHIBASKO_*` du runbook. Aucun nom de bucket/account/domain n'est une valeur finale
inventée. Faire valider le mapping complet des IDs, bindings et credentials avant
activation ; le preflight présence/forme ne certifie pas leurs scopes distants.

### Cible parallèle retenue

Le **staging dédié** est la recette complète finale, pas un simple URL aléatoire
workers.dev sur la DB prod. Une preview Cloudflare seule ne reproduit pas les
ressources/PSL/identités et ne lève pas ce gate.

Pour préparer ensuite la première version dans la vraie DB prod, une **préactivation
production parallèle, protégée, de la même release finale** reste nécessaire :
API upload/launch/exchange disponibles, ressources prod, origine explicite approuvée,
catalogue Pong masqué et trafic limité aux comptes de recette. Elle ne remplace pas
le staging et ne doit pas être servie aux joueurs. Choisir un canal de promotion
sans déploiement automatique de la branche principale ; l'exemple Wrangler canonique
ne doit pas être utilisé tel quel comme config parallèle. Aucun de ces déploiements
n'est créé ici. Le backend autorise les opérations par Bearer et Origin, pas par le
simple fait de connaître l'URL parallèle.
La protection additionnelle du portail de recette doit viser l'UI/harness ; un
challenge interactif Cloudflare Access sur toutes les routes bloquerait aussi les
appels serveur-à-serveur du SDK. Les routes exchange/roster/lifecycle conservent leur
authentification deployment et leurs quotas ; ne pas leur imposer un cookie de
preview ou un header Access non prévu par le contrat. Toute protection réseau
supplémentaire doit être testée avec le vrai serveur avant activation.

## 6. Cleanup, supervision et redaction

Migration ajoutée **20261018000400_control_plane_maintenance.sql**, après les huit
existantes inchangées. `distribution_cleanup_sessions()` prend un advisory xact lock
partagé, puis exécute lobby → online dans la même transaction. En cas de concurrence,
le deuxième appel retourne false sans travail ; en cas d'erreur tout est annulé.
Service-only, navigateur refusé. Deux appels successifs sont idempotents.

Worker `cloudflare/session-maintenance.ts`, exemple non actif
`cloudflare/wrangler.maintenance.example.jsonc`, Cron Trigger cinq minutes,
`GAME_SESSION_MAINTENANCE_ENABLED=0` par défaut. Pas de route publique de mutation.
Env uniquement SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY et flag. Logs bornés
completed/already_running/failed + durée ; aucun détail SQL. Les cron preview/launch,
outbox et cleanup uploads conservent leurs responsabilités distinctes.

Minimum de supervision sans nouvelle stack imposée : logs structurés existants,
sondes health, compteurs stdout Pong et alertes du fournisseur Cloudflare/VPS.

| Signal | Seuil initial de recette / action |
| --- | --- |
| Portail 5xx | Alerte >=5 erreurs/5 min ou taux >2% avec >=100 requêtes ; examiner codes sans bodies |
| Launch/exchange/lobby failures | Alerte >=5 échecs inattendus/5 min ; exclure refus auth/expired attendus de recette |
| Upload/validator | Alerte tout job failed persistant, validation dépassant son budget, scratch >=80% |
| Queue/outbox/DLQ | DLQ >0 ; âge queued/outbox >10 min ; validator absent/aucun cycle réussi |
| Gateway | 5xx >=5/5 min ; hausse anormale 4xx/résolution ; sonde d'un artefact de recette sans journaliser hostname capability |
| Cleanup | Aucun succès depuis 15 min ou outcome failed ; already_running prolongé exige inspection du lock/job |
| Pong | Health KO deux sondes consécutives, crash/restart, admissions/exchange failures, pendingLifecycle durable |

Ces seuils sont des points de départ à calibrer en staging, pas des alertes distantes
déjà configurées. Le serveur Pong émet toutes les 60 s une projection à clés fixes :
uptimeSeconds, activeRooms, pendingLifecycle, admissions, admissionFailures,
exchangeFailures. Nombres agrégés seulement, zéro identité/room/ticket/request body.
Le restart se surveille via Docker/superviseur et remise à zéro de l'uptime.

Audit des logs : gateway projection sûre sans host/URL/cookies et chemin demandé
remplacé par son SHA-256 (même un secret placé dans un path ne doit pas être loggé), exchange codes
bornés, upload/validator erreurs génériques, maintenance sans détails d'exception,
Colyseus logger privé désactivé. Les logs ne doivent contenir aucun ticket/JWT/credential.
Les logs HTTP automatiques du gateway doivent rester désactivés/expurgés ; les
logs DNS/CDN/proxy sont un gate d'infrastructure. Le hostname l- est une capability,
et la query de réservation WebSocket Colyseus est également sensible : ne pas les
enregistrer. Désactiver capture bodies/Authorization et analytics sur ces chemins.

## 7. Release state et contrôles reproductibles

Référence Git locale du 18 octobre 2026, sans actualisation des refs distantes :

| Dépôt | Branch / HEAD | Ahead / behind | Tags existants | Working tree |
| --- | --- | --- | --- | --- |
| Plateforme | main / 7ed34aee4d4d34dec18ac8d098df79580f54c1ea | 2 / 0 | aucun | Modifications GO-LIVE-GATES-1 |
| SDK | main / 861dad6db9d9a7b389029658b363055f43ea009d | 0 / 0 | v0.1.0, v0.2.0, v0.3.0 | Propre, non modifié |
| Pong | main / ab09544c9b8e8ecdbaf86fad90e66d72f42d530d | 1 / 0 | v0.1.0 | Docker/metrics/tests |

Commits plateforme non présents dans son upstream local : 97a0aa341c081b1fed4c445ad6ea43112adbc241,
7ed34aee4d4d34dec18ac8d098df79580f54c1ea. Pong : ab09544c9b8e8ecdbaf86fad90e66d72f42d530d.
Les refs distantes peuvent évoluer : ce relevé n'est pas un fetch de l'état GitHub.

```powershell
npm ci
npm audit --json | Set-Content -Encoding utf8 (Join-Path $env:TEMP 'npm-audit-all.json')
npm audit --omit=dev --json | Set-Content -Encoding utf8 (Join-Path $env:TEMP 'npm-audit-runtime.json')
node scripts/npm-audit-evidence.mjs (Join-Path $env:TEMP 'npm-audit-runtime.json') |
  Set-Content -Encoding utf8 (Join-Path $env:TEMP 'runtime-evidence.json')
node scripts/production-preflight.mjs --audit-report="$env:TEMP/runtime-evidence.json"
node scripts/release-state.mjs . ../chibasko-games-sdk ../chibasko-pong
```

L'evidence lie les compteurs au SHA-256 du lockfile courant. Le preflight reste
sans réseau/subprocess/écriture ; les commandes npm et Git de collecte sont séparées.
Le relevé d'audit est une preuve opératoire à dater, pas une attestation signée de npm.
La présence des env/bindings n'autorise aucune création ni activation automatique.

Les commandes du [runbook](production-activation.md) doivent être confrontées aux
migrations et configurations de la release cible. Le référentiel décrit ici
couvre neuf migrations ; il ne certifie pas les migrations ultérieures.
