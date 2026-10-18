# Activation production — PRODUCTION-ACTIVATION-1 PREP

État du plan : préparation locale, aucune activation distante effectuée.
L'architecture technique est celle de production ; staging utilise les mêmes
composants, avec des ressources et identités séparées. Une compilation réussie
ne valide ni les ressources distantes ni leur configuration.

La [checklist d'activation](production-activation-checklist.md) sert de journal
de passage des étapes. Le [rapport npm](production-npm-audit.md) et le
[préflight SQL](sql/production-preflight.sql) font partie des prérequis.
Les références des composants restent [game-distribution.md](game-distribution.md),
[game-runtime.md](game-runtime.md), [online-sessions.md](online-sessions.md),
[multiplayer-sessions.md](multiplayer-sessions.md) et [pong-migration.md](pong-migration.md).

## 1. Décision d'activation

**NO-GO tant que les preuves suivantes manquent :**

- schéma distant et registre des migrations rapprochés des fichiers versionnés ;
  sauvegarde restaurée avec succès dans une base distincte ;
- UUID officiel du catalogue identifié sans ambiguïté ;
- domaine de contenu choisi, exclusivement dédié, frontière PRIVATE PSL acceptée,
  intégrée à `tldts` et présente dans les navigateurs supportés ;
- recette Linux/Docker, vraie API R2 multipart et vraie Queue pull validées en staging ;
- rapport de sécurité npm réévalué et exposition des alertes high levée ou
  démontrée absente sur les artefacts effectivement déployés ;
- nouvelle API disponible sur un déploiement parallèle contrôlé avant les opérations
  d'upload/preview, sans promotion prématurée du portail public ;
- surveillance et tâche partagée de nettoyage online/lobby opérationnelles ;
- serveur compatible, credential provisionnée hors Git, politique réseau approuvée,
  artefact publié et pointeur actif vérifiés avant ouverture du parcours.

Ces conditions sont indépendantes. Le préflight local ne certifie pas la production.
Aucun domaine réel, identifiant de ressource, UUID officiel ou secret n'est fixé ici.

## 2. Architecture et dépendances

```text
Portail OpenNext → API authentifiée → Supabase (control plane durable)
    upload multipart signé → R2 staging privé
    finalize → outbox DB → dispatcher Worker planifié → Cloudflare Queue
    Queue pull → validateur Node 24 isolé → R2 final privé → game_version DRAFT
    review/publish → games.active_version_id
    launch → hostname capability unique → Artifact Gateway Worker → R2 final
    lobby durable → online session → START v2/ticket frais
    iframe → admission HTTPS Pong → exchange API → serveur authoritative autonome
```

Le portail ne consomme aucun package gameplay. Le SDK reste une dépendance npm
publique exacte `0.3.0`. Aucun accès Git privé n'est nécessaire au build Cloudflare.
Public/privé concerne le lobby ; le chemin gameplay et l'admission sont identiques.

## 3. Base de données : préflight, ordre, drift

Les huit fichiers ci-dessous constituent le lot préparé. Leur SHA-256 est émis
par `node scripts/production-preflight.mjs`. Archiver ce relevé avec le journal
de release, sans y joindre d'environnement ou de secret.

| Ordre / fichier dans supabase/migrations | Impact et dépendances | Retrait / rollback |
| --- | --- | --- |
| 1. `20261016000100_game_distribution_versions.sql` | `game_versions`, pointeur composite `games.active_version_id`, guards d'immuabilité/lifecycle, RPC `set_active_game_version`. Requiert `games.id uuid`, `auth.users`, rôles et générateur UUID. RLS privée ; service insert/update, pas de delete des versions. Refuse table/pointeur préexistants. | Garder le schéma et désactiver le parcours. Retrait seulement sur base vide de versions, après inventaire des FK/guards et sauvegarde ; jamais `DROP CASCADE`. Les builds/versions existants ne sont pas effaçables par le contrat normal. |
| 2. `20261016000200_game_build_uploads.sql` | `game_developer_members`, `game_build_uploads`, `game_build_outbox`, `game_build_api_limits` ; RPC d'autorisation, quotas, multipart/finalize, outbox, lease, checkpoint, completion et cleanup. Dépend de 1 + `admin_users(user_id)` et `auth.users`. | Arrêter nouveaux uploads, drainer outbox/leases et conserver les lignes d'audit. Ne pas retirer ce schéma tant que des jobs existent. Ne jamais supprimer leurs objets finaux sans rapprochement DB. |
| 3. `20261016000300_game_artifact_previews.sql` | `game_reviewers`, `game_version_delivery_policies`, `game_preview_sessions`, résolution et autorisation preview ; dépend de 1/2/admin. RLS et RPC service seulement. | Désactiver émission preview, attendre expiration (ticket 1 min/session top-level 15 min), garder policies et résolution nécessaires au runtime. Pas de retrait si les lancements suivants en dépendent. |
| 4. `20261017000100_game_launch_sessions.sql` | `game_launch_sessions`, limites de lancement, RPC create/check/revoke/cleanup/authorize ; dépend des versions, droits et policies précédents. Hashes, génération et contexte safe. | Arrêter nouveaux lancements, conserver lecture/renouvellement jusqu'au drainage. Les tickets de 6 dépendent de ces lignes. Ne pas couper le gateway au milieu des parties. |
| 5. `20261017000200_game_launch_renewals.sql` | Remplace le CHECK de durée en le trouvant par ses colonnes ; un seul CHECK created/expires attendu. Ajoute plafond fixe 24 h + RPC renew. | Revenir à l'ancien CHECK échoue sur les longues leases. Attendre leur expiration/révocation explicite avant toute réduction. Garder le renouvellement pour les sessions en cours. |
| 6. `20261018000100_online_sessions.sql` | Deployments/compatibilités, sessions/participants, credentials, tickets, exchange limits ; RPC prepare/context/ticket/exchange/revoke/cleanup. Dépend de launch et versions. Remplace **par son nom** `game_launch_sessions_safe_context_check` par limite 1 MiB. | Désactiver nouveaux départs, laisser finir les connexions établies ; fermer/révoquer explicitement si incident. Conserver historique/roster et hashes. Une credential révoquée n'est pas réactivée pour contourner un incident. |
| 7. `20261018000200_multiplayer_lobbies.sql` | Policies, lobbies, members, rounds, API limits, pin trigger et RPC publiques/privées via serveur ; dépend de 6 + `profiles(id,username)` et catalogue publié. Remplace `distribution_cleanup_online` pour préserver les FK des rounds. | Fermer/drainer les lobbies, conserver rounds/sessions. Ne pas restaurer l'ancien cleanup online : il pourrait tenter de supprimer des sessions encore référencées. Aucun annuaire mémoire de secours. |
| 8. `20261018000300_artifact_catalogue_and_server_roster.sql` | Aucune table. Projection `get_published_game_runtimes()` et RPC serveur `distribution_server_session(text,text)`. Dépend de 1/6/7. Projection catalogue EXECUTE anon/auth/service ; roster strictement service. | Conserver tant que le nouveau portail/serveur fonctionne. Retirer ces deux RPC uniquement après rollback du consommateur ; retrait de la projection rendrait les parcours indisponibles. |

Le détail des objets est dans [production-migrations.md](production-migrations.md).
Les migrations sont transactionnelles mais **le lot entier ne l'est pas** : après
chaque commit, vérifier le post-état et consigner l'application. Un lock timeout
ou une erreur interrompt le lot ; aucun fichier suivant n'est appliqué à l'aveugle.
Ne pas réappliquer les fichiers déjà exécutés. Ne pas réécrire les migrations.

### Préflight distant à exécuter lors de l'activation

1. Exporter le schéma, les grants/policies, triggers/indexes/FK/fonctions et le
   registre `supabase_migrations.schema_migrations` depuis une connexion vérifiée.
   Effectuer une sauvegarde des données et une restauration isolée. Mesurer durée
   et verrouillage ; vérifier la compatibilité avec la version PostgreSQL distante.
2. Exécuter, avec une session sans historique de secrets :

   ```sh
   psql -X -v ON_ERROR_STOP=1 --file=docs/sql/production-preflight.sql
   ```

   La connexion est fournie hors ligne de commande via la configuration sécurisée
   de l'environnement. Le SQL démarre une transaction READ ONLY, retourne les
   définitions/grants nécessaires et termine par ROLLBACK. Il n'applique rien et
   ne lit aucun hash/ticket/credential. Le résultat est un inventaire à comparer,
   pas une certification automatique d'absence de drift.
3. Vérifier `games.id uuid`, `auth.users.id uuid`, `admin_users.user_id uuid`,
   `profiles.id uuid/username`, les colonnes catalogue et les rôles `anon`,
   `authenticated`, `service_role`. Confirmer le statut réel de la migration
   `20261013000100_secure_admin.sql` et de `20261008000100_catalogue_game_types.sql`.
   La migration admin modifie largement les policies du catalogue : elle ne doit
   pas être réappliquée comme simple prérequis si un schéma de rôles existe déjà.
4. Comparer tout objet déjà présent portant les noms du lot. Les migrations 2
   et 7 révoquent des fonctions par préfixe (`distribution_%`,
   `distribution_multiplayer_%`) : inventorier les surcharges/fonctions antérieures
   avant application. Pas de suppression automatique de conflit de nom.
5. Contrôler tous les droits table **et colonne** : le navigateur ne doit pas
   pouvoir écrire `games.active_version_id`, membres développeur, credentials,
   hashes ou états lobby/session. `games` conserve ses policies existantes ;
   le guard du pointeur valide la cohérence, pas l'identité de l'appelant.
6. Avant 5, un seul CHECK contient les deux colonnes created/expires ; avant 6,
   le CHECK de safe_context porte exactement le nom attendu. Comparer toutes
   les signatures RPC, `search_path`, SECURITY INVOKER/DEFINER, owner et EXECUTE.
7. Appliquer **uniquement** le suffixe manquant de ce lot, avec arrêt à la première
   erreur et sauvegarde avant opération. Exemple d'une étape approuvée :

   ```sh
   psql -X -v ON_ERROR_STOP=1 --file=supabase/migrations/20261016000100_game_distribution_versions.sql
   ```

8. Refaire le préflight, contrôler RLS/contraintes/indexes, puis recharger le cache
   de schéma PostgREST suivant la procédure Supabase. Vérifier les RPC avant API.

`sql/tables.sql` est un script historique de reconstruction, pas un dump certifié
de la production courante. Les migrations datées 20260430 et 20260508 ont plusieurs
fichiers pour la même date et des dépendances historiques ; un `supabase db push`
global ou un reset n'est pas une procédure d'activation sûre. Aucune comparaison
live n'a été effectuée pendant PREP : l'absence de drift reste à démontrer.

Un rollback DB normal est **opérationnel** : arrêter l'émission, drainer, conserver
schéma et données, corriger par une nouvelle migration. Un retrait structurel exige
une migration explicite examinée sur une restauration ; aucun down destructif
automatique n'est préparé. Une restauration PITR affecte aussi auth/catalogue et
nécessite un incident déclaré avec fenêtre de perte de données connue.

## 4. Identité et build Pong

Aucun UUID officiel fiable n'est présent dans les sources versionnées. À exécuter
en lecture seule sur le catalogue officiel :

```sql
begin transaction read only;
select id, title, slug, game_type, multiplayer_game_id, is_published
from public.games
where slug = 'chibasko-pong' or multiplayer_game_id = 'chibasko-pong';
rollback;
```

Exiger exactement une ligne et vérifier son identité catalogue. Zéro ou plusieurs
lignes bloque le build ; ne pas créer un nouvel UUID ni reprendre une fixture.
Après rapprochement, affecter `PONG_GAME_ID=<uuid officiel>` hors du dépôt.

Le premier artefact production est **0.3.0** : cohérent avec le repository préparé,
indépendant du SDK 0.3.0 et des anciens tags package. Vérifier qu'aucune version
`gameId/0.3.0` n'existe avant l'upload. Une DRAFT existante est déjà immuable :
reprendre son workflow ou utiliser une nouvelle version, jamais écraser.

Commandes futures, depuis le dépôt Pong ; aucun tag nécessaire :

```powershell
if (-not $env:PONG_GAME_ID) { throw 'PONG_GAME_ID requis' }
npm ci
npm run build:web -- --game-id=$env:PONG_GAME_ID --game-version=0.3.0
npm run validate:web -- --game-id=$env:PONG_GAME_ID --game-version=0.3.0
npm run pack:web -- --game-id=$env:PONG_GAME_ID --game-version=0.3.0
Get-FileHash dist/releases/chibasko-pong-0.3.0.zip -Algorithm SHA256
npm run build:server
```

Le code de build refuse l'UUID fixture hors `--fixture`. Ne jamais passer ce flag
dans une release. Le ZIP contient `chibasko.json` à la racine, `local/index.html`,
`online/index.html`, assets et notices ; pas de sources ni de serveur. Garder le
rapport d'inventaire et le SHA de l'archive. Le serveur recalcule ses propres hashes.
Le `gameVersionId` est attribué par l'upload, distinct de `gameId` et de `0.3.0`.

## 5. Ressources R2 et Queue

Deux buckets privés de distribution sont nécessaires, en plus du bucket média
existant `CHIBASKO_ASSETS`. Leurs noms définitifs sont de la configuration externe.

| Ressource | Usage / accès | Rétention |
| --- | --- | --- |
| Staging (`GAME_BUILDS_STAGING_BUCKET`) | `staging/uploads/<uploadId>/source.zip`, multipart signé par le portail ; validateur read/delete/abort ; aucun accès gateway | Sessions 24 h. Cleanup DB-aware des états terminaux après 1 jour ; abandon multipart couvert aussi par règle bucket. Pas de TTL aveugle supprimant un job queued/validating. |
| Final (`GAME_BUILDS_ARTIFACTS_BUCKET`) | Écriture conditionnelle par validateur, lecture via binding `ARTIFACTS` du gateway ; aucune URL publique R2 | Pas de règle d'expiration générale. Garder versions, archive et inventory tant que référencés. Suppression orpheline seulement après preuve DB et grâce. |
| Média existant (`CHIBASKO_ASSETS`) | Avatars/miniatures catalogue, chemin média du portail | Ne pas réutiliser comme staging/final et ne pas modifier sa rétention pendant cette activation. |

Convention finale unique :

```text
games/<gameId>/versions/<versionId>/<contentSha256>/
  client/<path>
  inventory.json
  archives/<archiveSha256>.zip
```

Preview et published utilisent les mêmes objets. Le gateway ne sert que `client/`,
jamais inventory, archive, staging ou clés arbitraires. Les writes finaux utilisent
`If-None-Match: *` et vérifient hash/taille d'un objet déjà présent. Archive conservée
pour audit/reproduction. Publication et rollback changent la DB, pas les objets.

CORS staging : origines exactes des portails autorisés (staging/prod séparés), PUT,
headers nécessaires au navigateur et à la signature, exposer `ETag`. Une part signée
lie taille/numéro/clé/expiration ; aucun wildcard d'accès authentifié. Vérifier la
vraie requête browser : `Content-Length` est fixé par le navigateur, pas par JS.
Le final n'a pas besoin de CORS R2 public : le navigateur parle au gateway.

Multipart : parts fixes 32 MiB sauf dernière, URLs 15 min bornées par expiration
upload, 32 signatures par appel, reprise via liste de parts. Cela respecte le
[contrat R2 multipart](https://developers.cloudflare.com/r2/objects/upload-objects/).
Configurer l'abandon des multiparts incomplets après 2 jours, puis tester qu'aucun
upload autorisé n'est interrompu. Les objets assemblés sont nettoyés par état DB,
pas par âge seul. Les [lifecycle rules R2](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
ne remplacent pas le rapprochement des jobs.

Queue : une file de validation par environnement et une DLQ. Producteur :
`cloudflare/build-dispatcher.ts`, binding `BUILD_VALIDATIONS`, outbox DB durable,
cron minute. Message texte exact `{type:"validate_game_build",uploadId}`. Consumer :
service Node pull, un message par poll, visibilité **7 200 000 ms**, retry 60 s,
poll au repos 5 s ; idempotence/lease en DB, redispatch outbox après 1 h.

Configurer la file avec consumer **HTTP pull** suivant la
[procédure Cloudflare](https://developers.cloudflare.com/queues/configuration/pull-consumers/),
pas comme un consumer ZIP dans le Worker du portail. Le code utilise bien
`visibility_timeout_ms` conformément à l'[API pull](https://developers.cloudflare.com/api/resources/queues/subresources/messages/methods/pull/).
Prévoir **5 redeliveries Queue** puis DLQ, distinctes des **3 tentatives métier DB**.
Ce paramètre Queue est une configuration à appliquer/tester, pas une ressource
déjà créée. Alerter sur DLQ, âge outbox et jobs bloqués. Aucun replay aveugle DLQ.
Un échec métier traité par `processUpload` est enregistré en DB puis acquitté :
sa nouvelle tentative vient de l'outbox, pas d'une redelivery Queue forcée.
Une exception non traitée du cycle déclenche le retry Queue ; un message de forme
invalide est acquitté sans exécuter de job. Surveiller donc aussi les échecs DB,
pas seulement la DLQ.

## 6. Validateur dédié

Build `npm ci && npm run build:distribution`, exécution
`node .distribution/validator/main.mjs`, Node **24**, Linux/container isolé du portail.
Déployer `main.mjs` **et** `child.mjs` au chemin attendu. Service sans port public,
utilisateur non-root, racine en lecture seule, scratch privé avec quota et nettoyage,
pas de Docker socket, capabilities OS retirées, egress limité R2/Supabase/Queue.

Le parent lit l'archive en stream sur disque ; le child statique a heap 384 MiB,
permission Node limitée au module et scratch, environnement minimal sans credentials,
pas d'exécution de JS du jeu. Ce modèle Node est une défense supplémentaire, pas
un remplacement de l'isolation OS. Tester disque plein, timeout et kill/crash.
Scratch : jusqu'à 4 GiB archive + 16 GiB décompressés + métadonnées ; réserver au
moins cette capacité avec marge (40 GiB par job comme budget de recette, à mesurer).

Policy centrale `lib/game-distribution/uploads/policy.ts`, révision 1 : archive 4 GiB,
total 16 GiB, fichier 4 GiB, 50 000 fichiers, manifest 64 KiB, profondeur 32,
ratio 200, extraction 15 min, job 1 h, lease job + 120 s, 3 tentatives, 2 uploads
actifs et 20/jour par acteur, 120 requêtes/min. Ces limites ne sont pas des variables
d'environnement inventées ; une évolution passe par la policy versionnée et ses tests.

Le validateur lance aussi `cleanupUploads` chaque minute : terminaux de plus d'un
jour, abort multipart/delete staging ; suppression des fichiers partiels seulement
pour un job non completed avec checkpoint. Les fichiers finalisés réussis restent.
Un crash avant checkpoint n'a encore écrit aucun objet final. DB completion arrive
après inventory écrit en dernier. Un échec R2/DB reste retry-safe ; pas de DRAFT créée
avant validation + écritures finales. Sur perte du service, la Queue/outbox reprend.

La recette réelle de quotas volumineux et des limites mémoire/disque reste nécessaire.
Ne pas annoncer des builds de plusieurs GiB validés sur la seule base des fixtures.

## 7. Gateway, domaine et PSL

Worker dédié `cloudflare/artifact-gateway.ts`, binding R2 **`ARTIFACTS`** vers le
bucket final, RPC Supabase via `SUPABASE_URL` et secret service_role. Configuration :
`GAME_CONTENT_PUBLIC_BASE`, `GAME_CONTENT_PREVIEW_BASE`, `GAME_CONTENT_BASE_DOMAIN`,
`GAME_PORTAL_ORIGINS`, flag `GAME_ARTIFACT_GATEWAY_ENABLED`. Exemple désactivé :
`cloudflare/wrangler.artifacts.example.jsonc`. Cron 15 min : previews et launches.
Pas de credential S3 dans ce Worker. Routage wildcard exclusivement vers ce Worker.

`GAME_CONTENT_BASE_DOMAIN` est une base dédiée sur un **domaine enregistrable distinct**
de `chibaskogames.fr`. `ARTIFACT_GATEWAY_HOST` est un placeholder opérationnel de
routage, **pas une variable lue par le code**. Les bases public/preview peuvent
coïncider avec la base de lancement pour un seul wildcard ; pas de sous-niveaux
non couverts par le certificat wildcard. Aucun domaine acheté n'est supposé.

La base doit être un suffixe **PRIVATE PSL**, afin que chaque lancement soit un site
distinct et ne puisse poser un cookie parent partagé. Procédure future : vérifier
possession/usage du domaine, préparer les preuves demandées et déposer une demande
suivant les [règles PSL](https://publicsuffix.org/submit/), attendre décision,
intégration upstream, mise à jour lockée de `tldts`, puis propagation réelle dans
les navigateurs supportés. L'acceptation n'est pas garantie, notamment pour un
service expérimental. Définir une matrice de versions navigateur supportées et
prouver par un test cookie Domain que la frontière est appliquée ; la PSL serveur
ne change pas celle du navigateur.

Staging exige lui aussi une base qui satisfait ce contrôle. Avec une entrée PSL
exacte pour la base production, ajouter simplement `staging.` devant cette base
**ne suffit pas** : le suffixe reconnu ne correspondrait plus à la configuration.
Prévoir deux bases reconnues séparément, ou une entrée PRIVATE wildcard couvrant
les bases d'environnement, seulement si elle est acceptée et effectivement reconnue.
Chaque environnement garde son propre wildcard DNS/TLS/routage vers sa DB/bucket.
Ne pas utiliser la même base l- avec deux gateways/DB sans mécanisme de routage
prévu, et ne pas partager la production pour simuler un staging. Tant que la
frontière staging manque, seule la recette locale/DB/storage est possible ; la
recette staging complète reste bloquée.

**Avant cette acceptation :** build, DB, stockage, validation statique et tests locaux
restent possibles ; les lancements runtime de production restent bloqués
`content_cookie_boundary_required`. Ni un wildcard DNS/TLS seul ni un flag manuel
ne satisfait cette garantie. Ne pas utiliser un domaine tiers de fixture comme
infrastructure. Si PSL refuse, une révision d'architecture est nécessaire avant
activation, pas un contournement dans la configuration.

Format : `https://l-<48 hex aléatoires>.<GAME_CONTENT_BASE_DOMAIN>/<entrypoint>`.
192 bits de capability, hash SHA-256 en DB, aucun identifiant humain/game/Auth.
Origine jamais réutilisée. Lease 30 min renouvelée avant échéance, plafond **24 h**
depuis création ; nouvelles permissions/statuts vérifiés à chaque renouvellement.
Les assets lazy restent accessibles après 45 min si le runtime renouvelle. Après
plafond, relancement explicite ; pas de promesse de session infinie. Teardown
révoque le lancement ; aucun cookie third-party requis. Preview iframe identique.

Le hostname est lui-même une capability. Désactiver/redacter les logs DNS/proxy/CDN,
analytics et traces qui enregistrent hostname/URL/Referer ; ne pas ajouter l'URL de
lancement dans le journal de recette. Le Worker journalise seulement sa projection
sûre ; le réglage `invocation_logs=false` doit aussi être conservé côté gateway.

Headers : nosniff, no-referrer, sandbox scripts/same-origin/pointer-lock, aucune
navigation top/popups, frame-ancestors des seuls portails approuvés, workers web
possibles mais **service workers refusés** par le gateway. Profils réseau contrôlés
en DB, pas dans le manifest. `web-v1` convient au build Pong ; `connect_origins`
doit autoriser **HTTPS admission et WSS gameplay** de son deployment, `asset_origins`
vide pour build autonome. Sans cela, l'online échoue CSP même si le serveur est sain.
Hosts `v-` published : cache public immuable ; hosts preview `p-` et tous les `l-` :
private/no-store. Ne jamais ajouter une règle CDN « cache everything » sur les launches.

## 8. Inventaire des variables et secrets

Les noms ci-dessous sont les seules données de configuration publiées ici.
`D/S/P` = dev, staging, production. En dev, les flags peuvent rester à 0 ; staging
et production actifs exigent les valeurs et bindings correspondants. Staging ne
réutilise ni credentials, ni bucket, ni Queue, ni base de production.

| Nom | Composant / caractère | Source, environnement, obligation |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Portail, public | Projet Supabase D/S/P ; build + runtime requis |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Portail, clé publique publishable/anon | Projet D/S/P ; build + runtime requis, RLS indispensable |
| `NEXT_PUBLIC_SITE_URL` | Portail, public | Origine portail canonique D/S/P ; auth/reset/origin checks |
| `SUPABASE_SERVICE_ROLE_KEY` | Portail/gateway/dispatcher/validator, **secret** | Supabase du même environnement ; Cloudflare secret ou secret runtime Node, jamais NEXT_PUBLIC ni bundle |
| `SUPABASE_URL` | Gateway/dispatcher/validator, public | Même projet que NEXT_PUBLIC_SUPABASE_URL ; S/P requis |
| `PASSWORD_RESET_CODE_SECRET` | Portail, **secret** | Secret manager → Cloudflare secret ; D/S/P pour reset |
| `RESEND_API_KEY` | Portail, **secret** | Resend → Cloudflare secret ; S/P mail, compte/sender de recette distincts |
| `RESEND_FROM_EMAIL` | Portail, public | Expéditeur vérifié, S/P mail requis |
| `CHIBASKO_CLOUDFLARE` | Portail, public | `1` build/runtime Cloudflare ; injecté aussi par le script build |
| `GAME_DISTRIBUTION_UPLOADS_ENABLED` | Portail, flag | `0` au déploiement parallèle ; `1` après DB/R2/Queue/validator/CORS |
| `GAME_ARTIFACT_PREVIEWS_ENABLED` | Portail, flag | Preview top-level cookie uniquement ; facultatif, ne remplace pas runtime preview |
| `GAME_RUNTIME_LAUNCHES_ENABLED` | Portail, flag | Lanceur et exchange online ; `1` après gateway/domaine/DB/API prêtes |
| `GAME_ARTIFACT_GATEWAY_ENABLED` | Gateway, flag | `0` avant ressources et domaine ; `1` avant les premiers launches |
| `GAME_CONTENT_BASE_DOMAIN` | Portail/gateway, public | Base PRIVATE PSL validée ; S/P runtime requis |
| `GAME_CONTENT_PUBLIC_BASE` | Portail/gateway, public | Base des hosts v- ; S/P requis |
| `GAME_CONTENT_PREVIEW_BASE` | Portail/gateway, public | Base des hosts p- ; S/P requis |
| `GAME_PORTAL_ORIGINS` | Portail/gateway, public | Liste d'origines HTTPS exactes, séparées par virgules ; S/P requis |
| `GAME_BUILDS_R2_ACCOUNT_ID` | Portail/validator, identifiant non secret | Compte Cloudflare, S/P upload requis |
| `GAME_BUILDS_R2_ACCESS_KEY_ID` | Portail/validator, **credential** | Paire S3 R2, secret store même si l'ID seul ne suffit pas à signer |
| `GAME_BUILDS_R2_SECRET_ACCESS_KEY` | Portail/validator, **secret** | R2 API, runtime seulement ; portail scope staging, validator staging+final |
| `GAME_BUILDS_STAGING_BUCKET` | Portail/validator, non secret | Nom bucket privé de l'environnement |
| `GAME_BUILDS_ARTIFACTS_BUCKET` | Validator, non secret | Nom final privé, distinct du staging |
| `GAME_BUILDS_QUEUE_ID` | Validator, identifiant non secret | Queue HTTP pull de l'environnement |
| `GAME_BUILDS_QUEUE_TOKEN` | Validator, **secret** | Cloudflare API, permissions Queue pull/ack limitées au compte requis ; rotation/expiration surveillées |
| `NODE_ENV` | Node/portail, public | Production aux builds/exécutions S/P |
| `VERCEL` | Ancien adaptateur hébergement, public | Non requis sur Cloudflare ; ne pas l'ajouter pour cette activation |

Bindings, pas variables texte : portail `ASSETS` (sortie `.open-next/assets`) et
`CHIBASKO_ASSETS` (médias existants) ; gateway `ARTIFACTS` ; dispatcher `BUILD_VALIDATIONS`.
`PATH`, `SYSTEMROOT`, `TEMP`, `TMP` sont des paramètres système du validateur, pas
des secrets ni des identifiants d'infrastructure. Configurer un scratch propre.

Le code S3 utilise une paire par process : déployer le portail avec accès staging
seulement, le validateur avec staging+final. Ce dernier a actuellement des droits
delete pour le cleanup orphelin : pas de promesse de WORM R2 ; l'immuabilité est
garantie par le chemin applicatif et les permissions de déploiement contrôlées.
Prévoir audits et sauvegardes pour la suppression administrative accidentelle.

Les credentials de déploiement Cloudflare/CI et de connexion DB sont des secrets
d'exploitation hors application ; aucun nom de token persistant n'est imposé par
ce plan. Aucun PAT GitHub, accès Git privé ou NPM_TOKEN n'est requis pour le portail.

## 9. Serveur Pong : enregistrement, credential, Linux

Le build Web 0.3.0 utilise le même SDK public. Le serveur est un déploiement
autonome Node/container, sur le VPS Docker Linux prévu ; aucun nouveau fournisseur
n'est sélectionné. Une instance authoritative par deployment initialement : un
scale horizontal exige un routage sticky par onlineSessionId avant ajout de replicas.

| Variable serveur | Secret ? | Exigence |
| --- | --- | --- |
| `HOST` | Non | `0.0.0.0` dans container ; écoute interne seulement |
| `PORT` | Non | 2567 par défaut ; port interne cohérent reverse proxy/health |
| `NODE_ENV` | Non | production |
| `CHIBASKO_PLATFORM_API_URL` | Non | Origine HTTPS de l'API nouvelle du même environnement |
| `CHIBASKO_DEPLOYMENT_CREDENTIAL` | **Oui** | Secret 256 bits généré par provisioning, uniquement au runtime serveur |
| `PONG_CONTENT_BASES` | Non | Bases de contenu approuvées, virgules ; couvre les origins de launch dynamiques |
| `PONG_ALLOWED_ORIGINS` | Non | Origines HTTPS exactes supplémentaires si nécessaires ; facultatif si bases configurées |

En production au moins une base/origine doit être configurée. Aucun secret serveur
dans le Web build ou le manifest. Injecter via secret manager/fichier env privé hors
Git, permissions restreintes ; pas de secret dans image, build-arg ou ligne de commande.
Les listes Pong sont séparées par virgules sans espaces et propres à l'environnement ;
ne pas autoriser une base staging dans le serveur production pour faciliter une recette.

Séquence d'enregistrement (opérations futures backend/service-role uniquement) :

1. Après création DRAFT, noter son `GAME_VERSION_ID`. Choisir `hosting_mode=self_hosted`
   pour le VPS, endpoint HTTPS du reverse proxy (racine pour admission). Le même
   contrat supporte `chibasko_hosted` ultérieurement ; ne pas mentir sur l'hébergement.
2. Insérer `game_server_deployments(game_id,hosting_mode,endpoint,status)` en **disabled**,
   puis `game_server_deployment_versions(deployment_id,game_id,version_id)` vers cette
   version exacte. Endpoint public HTTPS/WSS, sans credential/query/hash ni IP locale.
   Le helper `gameplayEndpoint` valide une destination navigateur, pas une protection
   SSRF pour de futurs appels backend. Pong a besoin d'admission HTTPS et du WSS associé.
3. Utiliser `onlineSessionService.createCredential(deploymentId, expiresAt)` depuis
   un processus de provisioning de confiance. Il génère 32 octets aléatoires, écrit
   seulement SHA-256 via `distribution_create_server_credential`, retourne le secret
   une seule fois au secret manager. Il n'existe pas d'UI/API publique de provisioning.
   Alternative SQL/RPC contrôlée : transmettre `p_deployment`, `p_hash` SHA-256 d'un
   secret généré dans le secret manager, `p_expires` (entre 1 h et 90 jours).
   Ne jamais générer le secret dans l'historique SQL ni stocker sa valeur dans le dossier
   de release. Consigner uniquement credential ID, expiry et deployment ID.
4. Injecter la credential au serveur, démarrer, valider health/TLS/origins. **Un exchange
   valide est impossible tant que le deployment reste disabled.** L'activer pour une
   fenêtre de preview contrôlée sans catalogue ouvert, préparer la session de test,
   puis vérifier exchange/admission. En cas d'échec, disabled + diagnostic, pas de
   contournement du guard. L'ouverture au trafic joueur arrive seulement après recette.
5. Rotation : créer une seconde credential, injecter/restart contrôlé, vérifier nouvel
   exchange et lifecycle, révoquer l'ancienne par `distribution_revoke_server_credential`.
   Les deux peuvent coexister pendant la rotation. Prévoir rappel avant expiration.

Commandes futures de recette, dans une copie Linux du dépôt Pong :

```sh
docker build --pull -t chibasko-pong-server:RELEASE_ID .
docker run -d --name chibasko-pong-server --restart unless-stopped \
  --env-file /secure/chibasko-pong/server.env \
  -p 127.0.0.1:2567:2567 chibasko-pong-server:RELEASE_ID
curl --fail http://127.0.0.1:2567/health
docker stop --time 30 chibasko-pong-server
docker start chibasko-pong-server
```

Remplacer RELEASE_ID par une référence immuable et conserver le digest d'image.
Avant cette recette, créer le fichier secret hors dépôt via le mécanisme sécurisé
du VPS. Le reverse proxy existant doit fournir TLS HTTPS/WSS, Upgrade WebSocket,
timeouts compatibles parties longues et logs sans body, Authorization ou query
de réservation Colyseus. Exposer seulement le proxy, pas le port Node sur Internet.

**Docker/Linux non validé pendant les phases précédentes ni certifié par ce plan.**
Checklist obligatoire : image multi-stage/non-root, health, échec sans credential,
admission valide/invalide/expired/replay, deux navigateurs en WSS, restart,
SIGTERM/graceful shutdown, logs expurgés, mémoire/CPU/disque au repos et sous charge,
forfait/crash, livraison lifecycle et stratégie de routage unique. Mesurer les limites
CPU/RAM avant fixation des quotas ; les namespaces/quotas du futur Hosting restent
distincts du control plane.

### CORS gameplay

Le serveur parse `Origin` en URL, impose `url.origin === valeur`, HTTPS sans port
explicite non standard pour les bases, et compare la frontière de label
`hostname.endsWith('.' + base)` à une base configurée validée ; ce n'est pas un
suffixe textuel sans point. Origines explicites comparées exactement. Les bases
sont exclusivement contrôlées par Chibasko Games ; pas d'allowlist par lancement.
Rejeter null, userinfo, path/query, suffixes trompeurs, domaine parent et lookalikes.
Les sous-domaines imbriqués de la base sont actuellement admis : ne jamais y héberger
un autre service de confiance différente. Tester aussi une véritable origine l-.
Origin n'authentifie pas un client non navigateur ; le ticket reste obligatoire.

## 10. Upload, preview et publication

Les API nouvelles doivent exister **avant** l'upload. Voir section 11 pour le
déploiement parallèle nécessaire ; l'ancien portail ne fournit pas magiquement ces routes.
L'API est utilisable par outil HTTP, futur CLI ou futur Developer Portal ; pas de
CLI de publication officielle existante à inventer.

| Étape | Requête / contrôle |
| --- | --- |
| Autorisation | Compte authentifié membre owner/editor de `game_developer_members` du jeu officiel, ou admin. Le manifest n'accorde aucun droit. |
| Création | `POST /api/developer/games/{gameId}/uploads`, Bearer utilisateur vérifié, `Idempotency-Key` UUID conservé pour retry ; JSON `{version:"0.3.0",archiveSize:<octets exacts>}`. 201 et upload ID, état uploading. |
| Signature | `POST /api/developer/uploads/{uploadId}/parts`, JSON `{partNumbers:[1,...]}`, 1..32 numéros ; réponse méthode PUT, taille, URL signée temporaire. Ne pas journaliser ces URLs. |
| Envoi | Couper le ZIP aux tailles demandées, PUT direct R2 ; ne pas relayer le ZIP via Next. `GET /api/developer/uploads/{uploadId}/parts` permet reprise vérifiée. |
| Finalize | `POST /api/developer/uploads/{uploadId}/finalize`, 202 idempotent ; vérification taille/parts/ETag puis queued/outbox. |
| Suivi | `GET /api/developer/uploads/{uploadId}` avec Bearer ; polling borné avec backoff. queued → validating → completed ou failed/expired. |
| Résultat | completed + `gameVersionId`, ligne version draft, hashes/inventory/objets vérifiés. Une version conflit n'est jamais écrasée. |

Arrêt sur unauthorized/forbidden, upload_expired, upload_incomplete non résolu,
validation_failed, version_conflict ou storage_error persistant. Pas de répétition
d'upload avec nouvelle identité pour contourner un conflit de version. Les limites
et droits restent identiques pour les jeux officiels et tiers.

### Preview réelle

Préparer un portail de recette protégé sur l'origine inscrite dans `GAME_PORTAL_ORIGINS`.
Le composant générique `GameRuntime` sait lancer `audience=preview`, mais il n'existe
pas encore de Developer Portal de preview complet. La recette exige un harness
d'administration authentifié utilisant ce composant, sans coder une route spéciale
Pong ni exposer de secret. Ce harness/procédure d'opération reste à préparer avant
la fenêtre d'activation ; le test navigateur local n'est pas une UI production.

`POST /api/game-launches` : `{gameId,gameVersionId,execution:"local",audience:"preview",locale:"fr"}`,
Bearer du reviewer autorisé. Réponse descriptor/controlToken réservée au parent,
iframe unique l-, Bridge SDK réel READY/START/STOP. Owner/editor/admin ou reviewer
in_review/approved suivant les RPC. Pas de JWT dans l'iframe, pas de cookie tiers.
La preview top-level `POST /api/developer/game-versions/{id}/preview` est distincte
(ticket/cookie) et ne prouve pas le bon fonctionnement du Bridge iframe.

Pour online DRAFT, le backend de confiance doit préparer un roster de comptes de
recette avec `distribution_prepare_online_session(p_version,p_deployment,p_participants)`
via `onlineSessionService.prepare`. Deployment actif et compatible ; participants
auth réels conservés seulement backend. Passer la référence opaque retournée à
`onlineSessionReference` du launch preview. Le lobby public ne peut pas créer une
partie DRAFT : ne pas publier provisoirement pour contourner cette règle.

Exiger local sans auth, contrôles clavier/touch, formats 390×844/768×1024/844×390/desktop,
online deux comptes, ticket START frais ≤3 min, exchange idempotent, résultat/replay,
quitter/refresh, mauvais Origin/ticket/expired, absence de logs sensibles, lazy asset
après 45 min avec lease renouvelée et aucune fuite de stockage inter-launch.

### Publication et pointeur

Pas d'API publique de publication actuelle : opérations service-role/SQL contrôlées,
avec preuves de review conservées hors manifest. Le trigger impose :
`draft → in_review → approved → published`. Faire review et approval comme opérations
distinctes avec assertions statut/jeu/version/rowcount. Une version rejected revient
in_review après correction de procédure ; son contenu n'est pas modifié.

La promotion finale doit être atomique. Template SQL pour paramètres psql vérifiés,
uniquement lors de l'activation, après preuve de santé du serveur :

```sql
\set ON_ERROR_STOP on
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
with locked as (
 select id from public.games where id=:'game_id'::uuid for update
) select count(*)=1 as game_ok from locked \gset
\if :game_ok
\else
 rollback;
 do $$ begin raise exception 'activation_game_not_found'; end $$;
\endif
with locked as (
 select id from public.game_versions where id=:'version_id'::uuid
 and game_id=:'game_id'::uuid and version=:'game_version' and status='approved'
 for update
) select count(*)=1 as version_ok from locked \gset
\if :version_ok
\else
 rollback;
 do $$ begin raise exception 'activation_version_mismatch'; end $$;
\endif
with changed as (
 update public.game_versions set status='published'
 where id=:'version_id'::uuid and game_id=:'game_id'::uuid
 and version=:'game_version' and status='approved' returning id
) select count(*)=1 as changed_ok from changed \gset
\if :changed_ok
\else
 rollback;
 do $$ begin raise exception 'activation_publication_failed'; end $$;
\endif
select public.set_active_game_version(:'game_id'::uuid, :'version_id'::uuid);
commit;
```

Les trois paramètres psql `game_id`, `version_id`, `game_version` proviennent des
contrôles précédents ; `game_version=0.3.0` pour le premier Pong. Les assertions
annulent et sortent sans changement si l'identité ou l'état diffère. Le trigger
valide statut publié et même jeu. Ne pas modifier timestamps,
manifest ou clés R2. Conserver le catalogue masqué (`is_published=false`) durant
la préactivation : la projection publique filtre aussi ce champ. L'ouverture finale
réactive le catalogue après validation du portail et des lobbies.

Pong : capabilities du build local 2/2, online public+private 2/2 ; policy plateforme
initiale recommandée **manual** (default actuel), démarrage après tous prêts par leader.
Si la décision produit retient when_full, configurer `multiplayer_game_policies`
avant création des lobbies et refaire la recette correspondante ; aucun moteur spécial.
La version est figée à la création du lobby. Chaque replay garde le lobby et crée une
nouvelle session/roster/tickets. Le transfert de leader et les limites viennent de la DB.

## 11. Activation, flags et premier push

Le prochain portail dépend de routes nouvelles pour upload, launch, exchange,
roster et lifecycle. **Exiger un artefact déjà publié avant toute mise à disposition
de ces API crée une dépendance circulaire.** Un simple push de la branche principale
qui déploie immédiatement le nouveau parcours est donc exclu.

Chemin retenu : déploiement parallèle contrôlé de **la même release finale**, d'abord
en staging puis sur une cible de préactivation production sans trafic catalogue.
Les routes applicatives restent les mêmes ; seule l'origine/configuration diffère.
Cette mise à disposition nécessite une phase de déploiement future explicitement
autorisée et un canal ne promouvant pas automatiquement la branche principale.
Si ce canal n'existe pas, **activation bloquée** ; ne pas faire le premier upload
via une ancienne route ni un script qui écrit directement une game_version.

1. Nouvelle cible parallèle, bonnes env et bindings, catalogue Pong masqué sur la
   base cible ; tous flags nouveaux à `0`. Les assets/auth existants restent fonctionnels.
2. Gateway prêt et domaine/PSL/TLS validés → flag gateway `1`.
3. DB + R2 + outbox + Queue + validateur + CORS prêts → uploads `1`.
4. API d'exchange/roster/lifecycle joignable, origin checks validés et gateway prêt →
   launches `1`, uniquement trafic de recette. Cette variable protège aussi l'exchange
   : la mettre à 0 n'est pas un bouton « arrêter seulement nouveaux jeux ».
5. DRAFT uploadée, serveur compatible opérationnel, preview, review, publication
   et pointeur correct. Le catalogue reste masqué pendant ces contrôles.
   Terminer/fermer les sessions de preview avant publication : une version published
   n'est plus previewable, et la vérification courante des droits invalide leurs leases.
6. Configurer l'URL d'API publique finale et tester les callbacks serveur avant
   promotion. Si le serveur utilisait l'origine parallèle pour la recette, son
   changement d'URL est un rollout contrôlé à vérifier, pas un oubli de configuration.
7. Alors seulement préparer le commit/push autorisé du portail, ou promouvoir
   l'artefact identique déjà construit via le canal retenu. Aucun push n'est effectué
   dans PREP. Vérifier les paramètres build publics embarqués et les secrets runtime.
8. Sondes HTTP/auth sur origine canonique, puis ouverture contrôlée du catalogue
   et smoke tests positifs immédiats. Un lancement published/lobby positif exige
   `is_published=true` : il ne peut pas être testé tout en promettant un catalogue
   toujours masqué. Le flow complet a d'abord été éprouvé en staging ; en production,
   arrêter/refermer selon le rollback dès un échec bloquant de cette fenêtre.

Le domaine canonique du portail ne change pas. Les API de mutation comparent Origin
à l'origine de la requête et contrôlent Sec-Fetch-Site ; `NEXT_PUBLIC_SITE_URL` sert
aussi à la configuration du site et des liens. Un simple alias URL de preview ne
transforme pas l'API en service multi-origin. Chaque cible doit être configurée pour
son origine réelle ; staging ne partage pas le build public paramétré production.

Ressources Cloudflare à préparer dans cette phase future : Worker portail/OpenNext
(`cloudflare/worker.mjs`, nodejs_compat, compatibility_date actuelle 2026-10-07), assets
OpenNext, binding média existant, Worker gateway (date exemple 2026-10-16), wildcard
DNS/TLS/route de contenu, Worker dispatcher cron minute, Queue+DLQ/pull, deux R2 privés,
cron gateway 15 min, variables et secrets inventoriés. Les `name`/routes de
`wrangler.jsonc` actuels pointent déjà le portail canonique malgré le nom preview :
**ne pas utiliser ce fichier comme cible parallèle sans configuration séparée**.
`npm run build:cloudflare` construit seulement ; `deploy:cloudflare` déploie et ne doit
pas être exécuté pendant PREP. Le script retire les fallbacks `.env` privés d'OpenNext ;
les bindings runtime restent indispensables.

### Nettoyage partagé manquant à raccorder

Les RPC `distribution_cleanup_multiplayer()` et `distribution_cleanup_online()`
existent, mais aucun scheduler production de ces deux opérations n'est câblé dans
le dépôt. Préparer une tâche partagée backend, par exemple planifiée toutes les
5 min, qui appelle **lobby puis online**, avec service-role, timeout, retry et alerte.
Ne pas confondre avec le cron gateway (preview/launch seulement), le cleanup upload
du Node validator ou un timer local Next.js. Le choix exact du scheduler et sa recette
doivent être terminés avant ouverture. Le cleanup clôt les lobbies expirés, conserve
7 jours les fermés, purge sessions fermées non référencées après 1 jour et tickets
après expiration +1 h. Les parties et lobbies ne sont pas des sessions infinies.

## 12. Rollback du premier passage

Conserver avant activation : identifiant/digest du déploiement portail précédent,
configuration compatible sauvegardée hors Git, catalogue/pointeur précédent,
image serveur, état des flags et schéma restaurable. Ne jamais stocker les secrets
dans le journal. Définir une fenêtre de recette sans nouveaux joueurs.

- **Avant ouverture** : garder Pong masqué, arrêter nouveaux uploads si nécessaire,
  ne pas publier/sélectionner la DRAFT ; corriger puis recommencer les contrôles.
- **Après ouverture, incident jeu** : masquer le jeu et bloquer les nouvelles parties,
  notifier/drainer les parties en cours. `is_published=false` révoque aussi les
  autorisations des launches published lors des contrôles/renouvellements : ce n'est
  pas un drain transparent. Pour un incident exigeant arrêt immédiat, accepter cette
  interruption et fermer/révoquer explicitement les sessions ; consigner l'impact.
- Première version : **aucun ancien artefact à repointer**. Après fermeture des
  lobbies/sessions concernés, `set_active_game_version(gameId,NULL)` rend le nouveau
  parcours indisponible. Ne pas archiver la version active avant retrait du pointeur.
  Garder les objets immuables et les données pour analyse. Le contrôle d'accès garde
  les drafts privées ; la distribution publique v- d'une version published reste
  publique/cachable jusqu'à archive et éventuelle purge d'urgence. Les copies déjà
  téléchargées ne peuvent pas être rappelées.
- Le rollback du **déploiement portail** vers son artefact immuable précédent est
  possible seulement si sa configuration et son backend gameplay historique sont
  encore disponibles et sûrs. Leur existence n'est pas garantie par les sources
  actuelles. Sinon le rollback sûr est portail courant + Pong indisponible ; aucun
  fallback legacy caché et aucune réinstallation Git privée en production.
- Rollback futur : version précédente publiée et serveur compatible, changement
  transactionnel du pointeur ; les lobbies déjà créés restent épinglés à leur version.
  Drainer ou fermer ceux incompatibles avant retrait de deployment.
- Ne pas réduire les leases, retirer les RPC ou effacer les tables pendant le
  rollback applicatif. Les migrations DB restent en place ; correction additive.

## 13. Observabilité et critères de recette

Avant ouverture, alertes mesurables et responsables d'exploitation définis :

| Composant | Signaux à surveiller / données autorisées |
| --- | --- |
| Upload/outbox | failed/expired, âge queued/validating, leases, tentatives, dispatch failures ; uploadId/gameId/versionId, jamais URL signée |
| Validator | codes d'échec, durée/tailles, disque/RAM, redelivery/DLQ, échec cleanup, restart ; pas d'archive/manifest complet dans logs |
| Gateway | taux 2xx/4xx/5xx, storage_error, Range/HEAD, latency ; requestId/versionId/path normalisé, pas de hostname capability ni cookies |
| Runtime | descriptor/handshake/ready timeouts, renew/revoke failures, stale generation ; aucune URL/controlToken/context intégral |
| Exchange/lobby | erreurs par code, rate limits, session/deployment opaques, conflits START/replay, cleanup ; aucun ticket/credential/JWT |
| Pong | health, nombre de rooms actives, admissions/forfaits, delivery lifecycle, crash/restart, CPU/RAM ; pas de bodies/headers/query réservation |

Le code actuel offre des logs gateway expurgés, une erreur générique du validateur
et `/health` Pong. Il **n'offre pas encore une stack complète de métriques**, notamment
active rooms et alertes crash/échec lifecycle. Préparer l'instrumentation/supervision
avant activation ; ne pas présenter ces métriques comme déjà exposées. Les journaux
proxy et Cloudflare automatiques doivent être contrôlés en plus des console.log.

Les tests production utilisent deux comptes de recette et du trafic borné : voir
checklist. Aucune credential réelle ni ticket n'est copié dans captures, rapports,
history shell ou outils analytics. Les captures réseau conservées doivent être expurgées.

## 14. Automatisation locale et preuves

```powershell
node scripts/production-preflight.mjs
node --test tests/production-preflight.test.mjs
node tests/game-distribution-db.mjs --multiplayer --production-preflight
npm test
npm run test:game-runtime-browser
npx tsc --noEmit
npm run build
npm run build:cloudflare
git diff --check
```

Le script preflight ne fait ni réseau, ni subprocess, ni écriture. Il vérifie les
dépendances registre, l'ordre/transactions/SHA des migrations. Option
`--component=portal|gateway|dispatcher|validator` : contrôle présence/forme des
variables **déjà injectées**, jamais leur valeur dans la sortie. Aucun `.env` chargé
automatiquement ; pas de test de credential, de binding distant ou de permission.
Un succès local ne valide pas l'activation ; `remoteReadiness`/`bindingReadiness`
restent `not_checked`. Les preuves distantes doivent être recueillies séparément.

Le test SQL utilise PostgreSQL jetable loopback, pas un DSN Supabase hérité.
Les références Pong/SDK restent inchangées ; le build fixture Pong sert seulement
de recette locale, jamais d'upload production. Aucune migration distante, ressource,
credential, DNS, upload, publication, commit ou push n'est effectué pendant PREP.
