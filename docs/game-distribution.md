# Game Distribution v1 — architecture, fondation et pipeline d'upload

Le portail ne contient ni code source de jeu ni serveur gameplay. Les builds Web
sont distribués séparément. Les contrats de preview top-level des sections 27–29
sont historiques : ils ne sont pas le parcours du Worker de production. Le
[Gateway production](artifact-gateway-production.md) décrit le domaine, les hosts
de launch et les règles d’autorisation actuels.

## 1. Architecture actuelle

Le portail ne contient ni code gameplay ni dépendance Git privée de jeu. Il
référence des versions Web immuables dans R2 et des deployments serveur autonomes.
`games.id` identifie le jeu ; `developer_name` est un texte public, jamais une
autorisation. Les memberships et les RPC contrôlent les droits de publication.
Le bucket de médias `CHIBASKO_ASSETS` est distinct du staging et des artifacts ;
il ne sert pas de stockage HTML pour les jeux tiers.

## 2. Cible : source distincte du build

```text
projet quelconque → build Web → ZIP + chibasko.json → upload privé
 → validation serveur isolée → objets immuables R2 + game_version
 → preview → review → publication + active_version
 → GameRuntime générique → origine de contenu dédiée / iframe

online : même client → déploiement serveur sélectionné par la plateforme
```

Le repo, moteur, langage et build system ne sont ni stockés comme dépendances de
la plateforme, ni requis par l'API. HTML/JS, Phaser, Construct, GDevelop et exports
Unity/Godot sont des producteurs de fichiers Web. Un changement de version n'exige
aucun import de module ni rebuild du portail. Pas de format propriétaire `.cgame`.

## 3. Parcours développeur

Créer une fiche → recevoir le gameId UUID → produire un build → validate/pack
local facultatif → créer un upload autorisé → transférer le ZIP en quarantaine
→ finaliser → job de validation obligatoire → version draft → preview → soumettre
→ review → approved → published → activer. L'interface, la CLI et la CI appellent
la même API ; elles ne possèdent aucune autorité de publication.

La future relation d'ownership doit relier un principal éditeur (utilisateur ou
équipe) au jeu et à ses permissions. Elle sera créée avant toute API développeur.
L'identité du manifest ne prouve jamais cette permission. Aucun compte n'est
attribué propriétaire/admin par la fondation.

## 4. Manifest versionné

`chibasko.json` est **obligatoire à la racine** du répertoire/ZIP, sans dossier
conteneur implicite. Son schéma canonique est
`lib/game-distribution/chibasko.schema.v1.json` (JSON Schema 2020-12, ID URN).
Il n'est pas encore servi depuis une URL publique. Exemple de contrat, pas une
fiche réellement enregistrée :

```json
{
  "schemaVersion": 1,
  "gameId": "11111111-1111-4111-8111-111111111111",
  "version": "1.2.0",
  "integrationVersion": 1,
  "capabilities": {
    "online": {"access": ["public", "private"], "players": {"min": 2, "max": 4}},
    "local": {"players": {"min": 1, "max": 2}}
  },
  "client": {
    "entrypoints": {"online": "index.html", "local": "local/index.html"},
    "requirements": {"crossOriginIsolation": false}
  }
}
```

- gameId = UUID stable `games.id` attribué par la plateforme, pas le slug ni
  l'ancien identifiant technique multiplayer_game_id. L'API autorise d'abord la
  cible ; le validateur compare ensuite gameId ET version à cette cible.
- SemVer obligatoire, préversions possibles ; pas de `+buildmetadata`, pour éviter
  les alias de même priorité. Pas de `latest`. La sélection utilise un version_id,
  pas une comparaison sémantique automatique.
- schemaVersion décrit le fichier de distribution. integrationVersion décrit les
  sémantiques plateforme/jeu ; tous deux sont ici 1, sans lien avec SDK 0.1.0.
  Le protocole wire du futur bridge aura son propre discriminateur/version de
  handshake. **Le SDK actuel n'est pas encore un bridge iframe.**
- Un ou deux entrypoints HTML relatifs ; partager index.html est permis. Les clés
  online/local doivent correspondre exactement aux capacités déclarées.
- Public/privé sont des accès au même online, pas deux moteurs de gameplay.
  Les capacités locales/online peuvent avoir des capacités joueurs différentes.
- crossOriginIsolation signale un besoin technique, jamais une permission accordée.

## 5. Exclusions volontaires

Titre, description, catégories, miniature, éditeur affiché, modération et publication
restent en DB catalogue. Aucun email, Auth UUID, token, secret, repo, classe Room,
endpoint serveur, roomType, hosting, CORS/CSP arbitraire ou URL de script privilégié
dans le manifest. Les propriétés inconnues sont refusées.

## 6. Base : game_versions et active_version

Migration à vérifier dans l’historique de l’environnement cible :

- game_versions : id, game_id, version, schema_version, integration_version,
  status, manifest, artifact_sha256/size, file_count, archive_sha256/size optionnels,
  storage_prefix généré, created_by, created_at, validated_at, published_at.
- UNIQUE(game_id,version), clé composite(id,game_id) pour le pointeur actif.
- games.active_version_id nullable ; toutes les lignes existantes restent NULL.
  FK composite et trigger : même jeu, version published seulement.
- Payload immuable **dès insertion**, plus strict que la seule publication.
  Les changements de contenu créent une nouvelle version, même après rejet.
  Suppression interdite ; archive conservée. L'identité d'uploader peut être
  anonymisée par suppression du compte, pas remplacée par une autre identité.
- set_active_game_version est une opération transactionnelle, invoker, exécutable
  seulement par service_role, après contrôle d'autorisation dans la future API.
  Concurrence activation/archivage contrôlée par verrous et triggers.
- Version active et `games.is_published` sont distincts : publication d'une version
  ne rend pas automatiquement la fiche publique.
- Aucun SELECT/DML navigateur sur game_versions ; RLS activée, tables privées.
  Un futur resolver expose uniquement la projection publique minimale, pas le
  manifest brut, created_by, stockage interne ni données de review.

Les contraintes DB protègent le tuple/immutabilité/lifecycle ; elles ne remplacent
pas le validateur complet. Aucun endpoint ne permet aujourd'hui ces insertions.

La livraison `managed_build` ou `external_url` est distincte des capacités
local/online. La projection catalogue doit utiliser la version active validée.

## 7. Lifecycle

Les uploads et leurs jobs possèdent un état mutable distinct du catalogue.
Voir le pipeline multipart ci-dessous et les RPC de `game_build_uploads`.

Version créée seulement après validation structurelle :
`draft → in_review → approved → published → archived` ; review peut produire
`rejected`, puis une re-review du même contenu. Un rejet technique avant validation
ne crée pas de version distribuable. Une version déjà publiée et archivée peut
redevenir published pour rollback ; une version jamais publiée ne saute pas la review.
Une version active ne peut être archivée sans changer/vider le pointeur d'abord.

Le rapport de validation doit être épinglé à une révision de validateur/politique,
séparément du contenu. Changer une règle de sécurité impose une re-review ou un
blocage ; cela ne réécrit jamais le manifest/artifact. Une API transactionnelle de
publication et un journal d'audit sont requis avant toute mise en service.

## 8. R2, hash et cache

Deux espaces privés : quarantaine d'uploads et builds validés. Pas d'accès direct
au bucket d'images/public actuel ; aucun binding/bucket réel n'est créé ici.

```text
quarantine/<upload-id>/artifact.zip
games/<game-uuid>/versions/<version-uuid>/<content-sha256>/
  client/chibasko.json
  client/index.html
  client/assets/...
  inventory.json
  archives/<archive-sha256>.zip
```

version_id est préférable à SemVer dans les clés : pas d'alias d'encodage et
identité DB stable. Le namespace est cloisonné par jeu/version ; pas de déduplication
globale nécessaire pour démarrer à 100+ jeux.

artifact_sha256 = SHA-256 du JSON UTF-8 canonique des tuples triés
`[{path,size,sha256}]`, clés dans cet ordre, sans espaces. Le fichier manifest brut
fait partie des hashes. Le tri est ordinal selon les unités UTF-16 des chemins
NFC (comparaison JavaScript `<`/`>`), sérialisation exacte JSON.stringify, sans
échappement facultatif des caractères Unicode. Ce calcul est autoritaire côté
ingestion ; aucun outil/moteur développeur n'est obligé de le reproduire.
L'ordre des entrées, dates et compression ZIP n'influencent
pas ce hash. archive_sha256 identifie séparément les octets du ZIP original.
Les fixtures vérifient cette différence. L'archive compilée peut être conservée
privée pour audit/revalidation ; jamais de source repo demandée.

Les puts finaux sont conditionnels If-None-Match:* et les octets revérifiés. Pas
d'overwrite silencieux. Le futur job gère les reprises par comparaison de hashes,
la vérification du nombre d'objets et un marqueur d'inventaire complet avant commit
DB. R2+PostgreSQL ne forment pas une transaction : états de job/idempotency keys,
finalisation conditionnelle et collecte des uploads orphelins sont nécessaires.

Gateway de livraison devant R2 : décision review/publication/preview **avant** cache.
Assets publics approuvés : `max-age=31536000, immutable`. HTML public : revalidation
(`no-cache`) pour appliquer les blocages de version. Preview : `private,no-store`,
pas de cache partagé. Stockage privé : no-store par défaut dans la fondation.
Rollback = pointeur, pas copie ni purge d'un préfixe mutable. Impossible de retirer
du code déjà téléchargé ; un blocage retire les nouveaux lancements/tickets et les
requêtes réseau. Une politique de révocation séparée est requise avant publication.

## 9. Origines et sandbox

Recommandation durable : un **domaine de contenu de site distinct** du portail,
puis une origine par build/version immuable. Un simple `games.chibaskogames.fr`
isole le DOM mais partage encore le site et peut recevoir des cookies Domain.
Le choix/achat du domaine reste à valider ; aucun DNS créé. Exemples de forme
uniquement : `https://<version-id>.games-content.example`, sans domaine supposé acquis.
L'origine d'une version ne sera jamais réattribuée à un autre build.

iframe cross-origin : `sandbox="allow-scripts allow-same-origin"` seulement sur
ce contenu réellement distinct, jamais sur le portail. Cela préserve les assets,
WASM et stockages nécessaires, sans donner accès au DOM/cookies du parent.
Pas de top-navigation, popups, downloads, forms, modals ou storage-access par défaut.
Fullscreen et pointer-lock : permissions explicites selon profil approuvé et geste
utilisateur. Audio suit l'autoplay du navigateur ; gamepad selon support/permission.
Pas de caméra, micro, géolocalisation ou orientation forcée par défaut.
Le stockage tiers/privé peut être indisponible : le jeu doit le tolérer.

Une iframe n'est pas une limite fiable de CPU/RAM. C'est un contexte navigateur
isolé, pas une preuve de sûreté ni un sandbox de calcul du hosting serveur.
Référence : [sandbox iframe MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe).

## 10. Réseau, CSP et moteurs Web

La plateforme génère les headers ; les fichiers _headers/_redirects du ZIP sont
refusés. Profil de départ : default-src 'none', scripts/assets/styles/medias self,
workers self/blob selon moteur, object-src 'none', base-uri 'none', form-action
'none', frame-src 'none', frame-ancestors origines portail explicites, nosniff,
Referrer-Policy:no-referrer et Permissions-Policy restrictive.

Inline scripts/styles et WASM peuvent nécessiter des autorisations par profil,
dont wasm-unsafe-eval ; ne pas imposer unsafe-eval JS à tous les jeux. Unity/Godot
doivent passer des tests réels de chaque profil avant qu'on le déclare supporté.
Les ressources externes sont interdites par défaut ou soumises à approbation DB ;
connect-src n'autorise que les déploiements HTTPS/WSS validés et nécessaires.
Pas de `*`, pas d'adresse privée arbitraire issue du manifest. JS peut construire
des URL : la recherche statique seule ne prouve pas l'absence de réseau externe.

Les service workers ne sont pas nécessaires au jeu Web de base. Le gateway devra
refuser les requêtes de registration/service-worker ; worker-src seul ne distingue
pas un Web Worker d'un service worker. Un profil PWA éventuel demandera une review.

Les exports threadés exigent SharedArrayBuffer, COOP/COEP et une politique cohérente
dans la chaîne de contextes, pas uniquement des headers sur le ZIP. Un profil de
player isolé doit être testé sans casser OAuth, images et intégrations du portail.
Avant cela, exports non-threadés ; aucune promesse de compatibilité universelle
de tous les réglages moteur. [Godot Web](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html).

Le sandbox ne rend pas confidentielles les données confiées au jeu : sa propre
navigation et son code restent non fiables. Fournir seulement des informations
publiques minimales et capacités de session étroitement bornées, jamais des secrets
plateforme. La sandbox/CSP définitive n'est pas implémentée par cette fondation.

## 11. SDK ↔ player

Même standard pour officiel/tiers, sans exiger React/npm. Le futur SDK possède un
adaptateur navigateur/bridge ; un export HTML pur peut utiliser un bundle JS public
versionné (CDN avec intégrité ou embarqué dans le build). Wrappers Unity/Godot et
templates sont des commodités, pas des formats de distribution différents.
Le repo SDK peut rester privé ; package/types/docs devront être accessibles sans
Git privé, via registre public et distribution JS, avec conditions de licence décidées.

Handshake minimal proposé : hello/initialisation, contexte de lancement, ready,
état start/stop, leave, erreur bornée. MessageChannel dédié après bootstrap vérifiant
`event.source === iframe.contentWindow`, origine exacte, schéma/version, nonce et
génération de lancement. targetOrigin exact, pas '*', délais et tailles/rates bornés,
fermeture du port au leave/navigation/session remplacée. Aucun message n'est autorisé
simplement parce qu'il porte un type ou un ID attendu.
[postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage).

Contexte : execution local/online, version épinglée, participants opaques à portée
jeu/session et identités publiques consenties. Pas d'Auth UUID global, JWT Supabase,
email, cookies, réservation Colyseus privée ou service_role. Avatars éventuels via
projection/proxy, sans imposer une URL contenant l'Auth UUID.

Les états/inputs à chaque tick appartiennent au jeu et à son transport, pas au
bridge du portail. Le client peut recevoir un endpoint public approuvé et un ticket
de session dédié, jamais le token plateforme. Le navigateur peut signaler un
résultat local non vérifié ; **aucun complete online autoritaire depuis l'iframe**.

## 12. Upload, validation et CLI

API future indépendante du portail : création d'upload autorisé/gameId/version,
transfert direct/multipart vers quarantaine, finalisation idempotente, statut job,
preview, review, publish/activate. Préserver l'auth serveur ; admin/ownership
revérifiés pour chaque opération. Quotas par éditeur et tailles en amont, avant
lecture complète du body. Les limites HTTP Cloudflare ne doivent pas imposer le
buffering d'un gros export Unity dans un route handler Next.

Validation serveur : syntaxe JSON, versions supportées, cible, capacités/entrypoints,
chemins canoniques NFC, collisions/casse, fichiers interdits, ZIP strict, liens,
chiffrement, intégrité CRC, headers locaux, overlaps, limites réelles de décompression,
hash de chaque fichier/inventaire, MIME/Content-Encoding. Aucun fichier n'est exécuté
pendant l'inspection. Ensuite lint HTML/ressources externes, scans de secrets et
contenu, puis smoke test isolé/readiness/réseau et review. Le JS arbitraire ne peut
pas être rendu sûr par un validateur statique.

Fondation : Ajv et zip.js sont utilisés plutôt qu'un sous-interpréteur JSON Schema
ou un parseur ZIP maison. Ajv compile le schéma au développement ; le validateur
ESM généré est conservé intentionnellement avec les sources et ses notices MIT.
Il est reproductible, contrôlé par `check:distribution-schema` et ne charge ni Ajv,
ni React, ni code Node au runtime. Le test navigateur interdit eval/Function :
cette approche évite de dépendre de génération de code interdite en Workers/CSP.
Voir [Ajv standalone](https://ajv.js.org/standalone.html). Ajv/esbuild sont des
devDependencies ; zip.js est la seule nouvelle dépendance de validation runtime.
La validation pure en mémoire ne fait ni I/O disque,
réseau, extraction filesystem, appel R2 ni publication. Les quotas de départ sont
10 000 entrées, ZIP 256 MiB, fichiers 256 MiB, total 1 GiB, manifest 64 KiB et ratio
200. Ce sont des politiques serveur configurables, pas des garanties du plan de
service. Les jobs exposés devront avoir budgets CPU/temps/mémoire et entrée seekable/
streaming avant d'accepter ces grandes tailles en production. Le validateur en
mémoire actuel peut copier les buffers ; il n'est pas un endpoint d'upload géant.

Les noms Unicode NFC/espaces sont acceptés ; traversals, chemins absolus, encodages
ambigus, liens et collisions refusés. Formats binaires spécifiques (.pck/.data/...)
restent possibles en application/octet-stream, pas de dépendance à un moteur.
WASM, JS, CSS, images et assets précompressés .gz/.br ont des métadonnées adaptées.
L'entrypoint est un fichier HTML UTF-8 ; sa fonctionnalité réelle devra être testée
en browser isolé. Source maps/JSON ne doivent jamais contenir de secrets.

CLI future distincte du SDK : validate/pack/upload/status. Elle réutilise le même
contrat publié ; la validation locale n'accorde aucun droit. Pas de CLI dédiée Pong,
pas de publication automatique depuis un script Web, pas de format propriétaire.

## 13. Online : déploiements distincts

Entité future `game_server_deployments` : jeu/version ou compatibilité explicite,
artifact serveur, provider self-hosted/Chibasko, endpoints approuvés, état, credentials
de contrôle, révision et quotas. Rien de cela dans chibasko.json. Un même build
client peut changer de déploiement compatible sans changer son identité gameplay.
Chaque session épingle client_version_id ET deployment_revision ; un rollback
client ne doit pas connecter un protocole incompatible côté serveur.

Self-hosted : la plateforme crée session/roster/version au serveur via une API
backend authentifiée. Réponse liée à cette session ; ticket opaque très court,
audience game/version/session/participant, consommation unique et anti-rejeu.
Échange HTTP sécurisé ou payload du protocole, pas JWT Supabase ni ticket en URL
WebSocket. IDs participants opaques, délais, idempotency et anti-rejeu.
Les endpoints subissent validation TLS/domaine/egress et protection SSRF/rebinding.
Completion backend-backend liée à la session, roster et issuer authentifié ; jamais
un navigateur arbitraire qui invente une session/résultat. Aucun handshake codé ici.

Hosting Chibasko : artifact serveur **distinct** du ZIP client, image/digest ou
runtime supporté, exécuté sous isolation dédiée. Quotas CPU/RAM/temps/disque,
networking/egress, secrets injectés à la demande, logs filtrés et scaling sont
responsabilités hosting. Ni secrets plateforme ni exécution de code tiers dans
le processus LobbyRoom. Pas de containers/orchestrateur implémentés ici.

## 14. Résultats et confiance

Enveloppe plateforme future : session/version/deployment/issuer et provenance,
plus GameResult générique. local_unverified, external_server, chibasko_server sont
attribués par la plateforme, pas par le jeu. Authenticité de provenance ≠ vérité
du score. Un serveur tiers peut mentir ; un serveur tiers hébergé chez nous aussi.
Toute future économie/compétition exigera une politique supplémentaire : règles
auditées, contrôles indépendants, détection de fraude ou vérification adaptée.
Pas de classement, récompense ou persistance de résultat ajouté par la fondation.

## 15. Matrice de compatibilité

| Contrat cible | Officiel | Tiers self-hosted | Tiers Chibasko Hosting |
| --- | --- | --- | --- |
| Même SDK/protocole d'intégration | Oui | Oui | Oui |
| Build Web + chibasko.json | Oui | Oui | Oui |
| API upload/version/review et R2/CDN | Oui | Oui | Oui |
| GameRuntime isolé | Oui | Oui | Oui |
| Git ou npm requis du jeu | Non | Non | Non |
| Rebuild du portail par jeu/version | Non | Non | Non |
| Serveur externe | Possible | Oui | Non |
| Serveur Chibasko | Oui | Non | Oui |

Les offres d’hébergement serveur de cette matrice sont des cibles, pas un service
de provisioning en libre-service. Le SDK est un contrat facultativement
consommé par une bibliothèque : le wire protocol documenté peut aussi être implémenté
par un moteur ne sachant pas charger npm.

## 16. Déploiement et vérification

Les migrations, le staging, les artifacts et le Gateway ont des prérequis distincts.
Vérifier les droits développeur, les quotas, les profils CSP et les politiques réseau
avant de soumettre un build. La validation technique crée une version draft ; une
revue humaine précède sa publication. La visibilité de la fiche reste un contrôle
séparé. Un mode online nécessite un deployment serveur compatible.

L’installation du portail utilise npm public, sans accès Git privé aux jeux.
L’ajout d’un jeu ou d’une version ne nécessite pas de reconstruire son gameplay
dans le portail. Voir [la revue manuelle](manual-build-review.md) et
[le runbook production](production-activation.md).

## 17. Politiques d’exploitation

Les quotas, la rétention, le nettoyage, la review et les origines réseau autorisées
sont des politiques de service. Elles ne changent pas le format du build selon
son moteur ou son propriétaire. Les fixtures contractuelles ne contiennent pas
le gameplay des jeux représentés.

## 18. Vérification du contrat de distribution

Commandes de vérification ciblée :

```sh
npm run test:game-distribution
npm run test:game-distribution-db
npx tsc --noEmit
npx eslint lib/game-distribution scripts/generate-distribution-validator.mjs tests/game-distribution.test.mjs tests/game-distribution-db.mjs
node --import ./tests/register.mjs --test tests/game-sdk.test.mjs tests/game-catalogue.test.mjs
npm run check:game-boundaries
git diff --check
```

Le test DB crée et arrête son propre cluster PostgreSQL local jetable, sans DSN
hérité ni accès Supabase. PostgreSQL doit être disponible ; `CATALOGUE_TEST_PG_BIN`
permet de choisir ses binaires. En environnement restreint, l'initialisation peut
nécessiter une exécution hors bac à sable. Les refus SQL, la conservation du
catalogue, le rollback et la concurrence activation/archivage sont exécutés, pas
seulement vérifiés par recherche textuelle.

Les tests storage utilisent des doubles R2 ; les vérifications de droits et
d’immuabilité utilisent PostgreSQL jetable. Les tests locaux ne certifient pas
les permissions des buckets ni les ressources distantes.

## 19. GAME-DISTRIBUTION-2 : pipeline client générique

Le pipeline comprend les routes développeur, une session/job mutable, l’upload R2
multipart, l’outbox, la validation isolée et le nettoyage. Le flag
`GAME_DISTRIBUTION_UPLOADS_ENABLED` contrôle l’accès. Le dispatcher planifié est
actuellement désactivé ; la commande de revue locale réutilise le même validator.
Voir [le workflow manuel](manual-build-review.md).

```text
Bearer vérifié → permission DB par jeu → session created
 → multipart R2 privé → uploading → parts PUT directement vers R2
 → finalize → finalizing → objet assemblé privé figé
 → transaction queued + outbox
 → dispatcher planifié → Cloudflare Queue (uploadId seulement)
 → consumer Node isolé → claim/lease → validating
 → download streamé vers disque privé → parser enfant borné
 → contrôles ZIP/manifest + hashes → fichiers immuables R2
 → archive originale + inventory.json écrit en dernier
 → transaction game_version draft + upload completed
```

Le payload reste identique pour un jeu officiel, tiers, local, online ou mixte.
Ni Git, npm, SDK JS, React ni technologie de moteur ne sont requis pour l'upload.

## 20. API développeur exacte

Toutes les réponses sont JSON, `Cache-Control: private, no-store`, avec `{data:...}`
ou `{error:{code:...}}`. Authentification par `Authorization: Bearer ...` seulement,
session validée par Supabase `getUser`. Aucun rôle/owner pris dans le body.
Un Origin navigateur fourni doit correspondre au portail ; CLI/CI sans Origin
sont autorisés avec la même authentification. Pas de cookie-only ni redirect UI.

| Méthode / route | Entrée | Résultat |
| --- | --- | --- |
| POST `/api/developer/games/{gameId}/uploads` | `Idempotency-Key`: UUID ; JSON `{version,archiveSize}` | 201, session et géométrie multipart |
| POST `/api/developer/uploads/{uploadId}/parts` | `{partNumbers:[1,...]}`, max 32 par appel | URLs PUT courtes, numéro et taille de chaque part |
| GET `/api/developer/uploads/{uploadId}/parts` | aucune | parts réellement présentes dans R2, pour reprise |
| POST `/api/developer/uploads/{uploadId}/finalize` | aucun body requis | 202, état courant/idempotent ; aucune validation lourde HTTP |
| GET `/api/developer/uploads/{uploadId}` | aucune | statut, erreur stable éventuelle et gameVersionId après succès |

La session expose id/gameId/version/status/expiresAt, jamais lease, clé interne,
multipart ID, checkpoint ou identité d'upload. Les URLs présignées contiennent
nécessairement la destination staging autorisée : ce sont des capacités sensibles,
à ne pas logger. Elles n'autorisent qu'une part précise d'un multipart précis,
avec Content-Length signé. Un navigateur envoie un Blob de la taille indiquée
et laisse son agent gérer Content-Length ; une CLI peut définir ce header.
La taille de l'archive est obligatoire (File.size/stat), pas son hash client.

Codes : `unauthorized` 401, `forbidden` 403, `game_not_found`/`upload_not_found`
404, `upload_expired` 410, `invalid_request`/`invalid_version`/`invalid_part` 400
(413/415 pour un body trop gros ou non JSON),
`upload_incomplete`/`invalid_state`/`version_conflict`/`idempotency_conflict` 409,
`quota_exceeded` 429, `storage_error`/`database_error`/`service_unavailable` 503.
Une validation asynchrone échouée est un état failed avec `validation_failed` ou
`validation_timeout`, pas une erreur SQL renvoyée au navigateur. Les clients
peuvent interroger le statut à intervalle de plusieurs secondes avec backoff ;
aucun polling React n'est ajouté. Les tokens d'automatisation développeur/CLI sont
une future couche d'auth, pas un nouveau format d'upload.

## 21. Permissions, migration et session transitoire

`20261016000200_game_build_uploads.sql` dépend de la migration des versions. Elle définit :

- `game_developer_members(game_id,user_id,role)` : owner/editor ; collaborateurs
  par jeu dès maintenant, extension équipes possible, aucun grant automatique.
- `game_build_uploads` : cible, auteur vérifié, idempotency key, version UUID réservée,
  clé staging générée, transport, policy figée, expiration, état, lease et résumé
  de validation. Le manifest ne confère aucun droit.
- `game_build_outbox` : travail à envoyer, atomique avec l'état queued.
- `game_build_api_limits` : compteur partagé par compte/minute, sans mémoire locale.

RLS et révocations interdisent lecture/écriture/RPC directs aux rôles navigateur.
Seul le backend vérifié appelle les RPC service_role. Cette clé reste serveur,
jamais dans le build du jeu. Chaque opération revérifie permission actuelle ;
un collaborateur ne peut pas consulter/finaliser l'upload d'un autre. Un admin
peut superviser ces uploads. La revocation est aussi vérifiée au claim et juste
avant création de version. Compte supprimé : auteur anonymisé, travail refusé.

L'assignation initiale owner/editor se fera par un opérateur/admin autorisé dans
la relation dédiée, après vérification de la propriété du jeu, jamais depuis un
champ auto-déclaré de soumission. Aucune API de gestion de collaborateurs n'est
ajoutée. Aucun compte existant n'obtient de permission par cette migration.

Lifecycle : created → uploading → finalizing → queued → validating → completed.
Avant queue, expiration possible ; après queue, tentatives bornées vers failed.
`uploaded` n'est pas un état séparé : queued atteste déjà l'objet assemblé vérifié.
finalizing permet de récupérer un crash entre CompleteMultipart et le commit DB.
Un finalize incomplet rend la session uploading pour poursuivre les parts.

## 22. Gros fichiers, queue et isolation

Multipart dès la première version du protocole, y compris un petit ZIP avec une
seule part. Aucune archive ne traverse une route Next. Les parts sont envoyées
au domaine S3 de R2, sans limite de body du portail. Le backend signe/assemble,
liste les parts lui-même et vérifie taille/ordre/ETag ; il ne fait pas confiance
à une liste d'ETags client. L'upload terminé n'est plus réécrivable par les URLs
UploadPart restantes. Le download du job utilise ensuite If-Match sur l'ETag figé.
[R2 URLs présignées](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).

Le Worker planifié `cloudflare/build-dispatcher.ts` envoie l'outbox vers Queues.
Le consumer Node 24 dédié utilise HTTP pull, batch 1, visibilité 2 h, message
**text JSON** (évite l'encodage base64 des messages JSON du pull API), jamais des
octets ZIP. Sans succès queue, l'outbox reste réessayable ; crash après send =
doublon normal. Réconciliation d'un queued non claimé après 1 h ; une lease
expirée redevient queued/failed selon budget. La DB reste l'autorité.
[Queues pull](https://developers.cloudflare.com/queues/configuration/pull-consumers/).

Le consumer télécharge en flux sur disque, lit le ZIP par plages, décompresse en
flux vers des fichiers privés à noms ordinaux et calcule SHA-256 côté serveur.
Il réutilise les contrôles structurels ZIP de phase 1. Le hash d'inventaire est
strictement identique au validateur en mémoire (test de parité). Aucun script,
HTML, WASM ou binaire du jeu n'est exécuté. Le parser enfant reçoit uniquement
cible/policy/chemin scratch, pas les credentials de son superviseur.

Policy unique : `lib/game-distribution/uploads/policy.ts`, snapshot DB par session.
Par défaut : archive 500 MiB, extrait 16 GiB, fichier 4 GiB, 50k entrées, profondeur
32, ratio 200, manifest 64 KiB, parsing 15 min, job 1 h, session 24 h, URLs 15 min,
3 tentatives, 2 uploads actifs/compte, 20/jour, 120 opérations/minute. Ces valeurs
doivent être dimensionnées et testées sur l'hôte avant activation, pas considérées
comme une promesse d'offre commerciale ou une limite imposée par un moteur.

L'hôte doit imposer quotas OS disque/RSS/CPU et isolation réseau. Node permissions,
env enfant nettoyé, heap borné et kill à expiration sont de la défense en profondeur,
pas une sandbox OS complète. Le [service validator](../services/build-validator/README.md)
précise la configuration attendue. Aucun container, queue, bucket ou secret réel
n'est créé ; l'exemple de configuration est distinct du Wrangler du portail.

## 23. Finalisation immuable et modèle d'échec

Le résumé DB ne contient pas les dizaines de milliers d'entrées d'inventaire :
elles sont dans inventory.json privé. Les réponses de statut/outbox restent petites.
Les fichiers, l'archive originale validée et l'inventaire utilisent exactement les
clés phase 1. Les puts passent par le même port `ImmutableArtifactBucket`, étendu
aux flux ; If-None-Match:* reste obligatoire. Une reprise ne réutilise un objet
existant que si taille ET hash serveur correspondent, sans l'écraser.

La version n'est insérée qu'après tous les objets et l'inventaire final. Le RPC
transactionnel insère `draft` et complète l'upload, sans modifier active_version
ni is_published. UNIQUE(game_id,version) est le dernier verrou : deux uploads de
même version donnent exactement un succès, même si les octets sont identiques.
Les leases avec token empêchent un ancien worker de terminer une tentative remplacée.

| Panne | Comportement |
| --- | --- |
| Upload interrompu | Reprise des parts existantes, sinon expiration et abort/cleanup |
| R2 finalisation indisponible | Erreur stable ; même finalize peut reprendre après un succès dont la réponse a été perdue |
| ZIP/schema/cible invalide | failed, aucune game_version, aucun objet final publiable |
| Timeout validation | retry borné ; failed après budget |
| Worker crash | Lease expirée récupérée par dispatcher, message redélivrable |
| Extraction/put partiel | Namespace unique, aucun draft ; reprise conditionnelle ou GC |
| DB échoue après R2 | Retry avec mêmes hashes ; inventaire seul ne rend rien public |
| Commit DB réussi/réponse perdue | État completed persistant, aucun nouvel insert |
| Version concurrente gagnante | failed/version_conflict, nettoyage du seul namespace perdant |
| Queue indisponible | Outbox conservée, dispatcher réessaie ; pas de job oublié |

GC : après un jour terminal, suppression staging et abort multipart ; suppression
du préfixe final uniquement pour failed/expired, jamais completed. Le marqueur
cleaned_at est posé après succès des suppressions. Configurer un lifecycle R2
d'abort des multipart incomplets pour couvrir le crash avant attachement DB.
Conserver les lignes de job pour audit ; aucune persistance compétitive ajoutée.
Pas de suppression du gagnant, de préfixe partagé ni d'overwrite compensatoire.

## 24. Validations et suite

Commandes : `npm run test:game-distribution`, `npm run test:game-uploads`,
`npm run test:game-uploads-db`, TypeScript et lint ciblé. Le scénario PostgreSQL
applique les deux migrations dans un cluster jetable, sans DSN production.
Il exécute ownership, admin, IDOR/RLS, expiration, outbox, retry/fencing et une vraie
concurrence de création : un draft et un version_conflict. Les tests storage utilisent
des adapters mémoire et un transport S3 simulé ; un vrai processus parser enfant
est exécuté. Les ZIP malveillants sont réellement construits et refusés.

Les fichiers validés sont destinés au Gateway. La publication nécessite une
revue distincte ; aucun artifact client ne remplace un serveur gameplay.
Le portail s’installe depuis le registre npm public sans accès aux dépôts des jeux.

## 25. Modules du pipeline d’upload

```text
app/api/developer/games/[gameId]/uploads/route.ts
app/api/developer/uploads/[uploadId]/{route.ts,parts/route.ts,finalize/route.ts}
lib/server/developerUploads.ts
lib/game-distribution/uploads/{contracts,policy,service,repository,r2}.ts
cloudflare/build-dispatcher.ts
services/build-validator/{main,queue,job,extract,child}.ts
services/build-validator/{README.md,wrangler.dispatcher.example.jsonc}
scripts/build-distribution.mjs
supabase/migrations/20261016000200_game_build_uploads.sql
tests/game-upload.test.mjs
tests/game-upload-db.sql
```

`zip.ts` partage les contrôles de structure avec le lecteur sur disque.
`storage.ts` accepte les flux via le port conditionnel. `.distribution/` contient
les sorties générées, ignorées par Git.

Référence de validation du 16 octobre 2026 :

Résultats locaux : 8 tests phase 1, 22 tests phase 2, typecheck, lint ciblé,
scénarios PostgreSQL sur cluster jetable, build Next Webpack et build OpenNext
Cloudflare (à partir d'une sortie standalone fraîche) réussis. Le dry-run local
du dispatcher compile également ; Wrangler a signalé un refus d'écriture de son
journal hors workspace par le bac à sable, sans échec du bundle ni déploiement.
Les avertissements OpenNext Windows/middleware sont ceux de l'outillage existant.

Ces validations ne certifient ni les permissions du bucket distant ni la charge
maximale de 16 Gio extraits. Avant un traitement automatique continu, vérifier
buckets/CORS/credentials, Queue HTTP Pull, supervision/DLQ/GC et le service
validator permanent. Le dispatcher planifié est volontairement désactivé ;
la validation manuelle reste disponible.

## 26. GAME-DISTRIBUTION-3 : Artifact Gateway

Le Worker `cloudflare/artifact-gateway.ts` sert seulement les objets **client**
d'une version exacte et validée. Le navigateur ne reçoit ni storage_prefix,
bucket, URL S3, archive originale, inventory.json interne, staging, ni credential.
Le gateway utilise le côté lecture `ArtifactReader` du port storage existant,
adapté au binding R2 natif. L'ingestion S3 et la lecture native visent les mêmes
objets finaux privés ; aucune seconde copie du build pour la preview.

`resolveGameVersion(versionId)` est une primitive serveur : elle charge la
projection DB minimale, revalide le manifest, ses liens gameId/version/protocole
et recalcule le préfixe immuable attendu. Un lien incohérent échoue fermé.
Elle peut résoudre draft/published/archived pour les besoins internes, mais cela
n'accorde aucun droit de servir : le gateway applique ensuite les droits/statuts.
Une version publique est exclusivement `published`. Le pointeur active_version_id
reste résolu par la plateforme avant le lancement ; aucune route `current`.

Le contrat destiné au futur runtime est `GameLaunchDescriptor` : gameId,
gameVersionId, integrationVersion, execution (local/online), entrypointUrl,
capabilities et contentOrigin. Ni clé R2, jeton, schéma DB complet ni identité
Supabase. Le chemin vient du manifest, y compris `play/start.html` ; les entrypoints
local et online peuvent différer. Ceci n'est pas le bridge SDK.

## 27. Origines historiques de version et preview

Choisir un **site enregistrable distinct** du portail. Un simple sous-domaine
`games.chibaskogames.fr` resterait same-site et recevrait d'éventuels cookies
`Domain=chibaskogames.fr`. La configuration refuse ce cas à l'aide de la Public
Suffix List (`tldts`, suffixes privés compris), plutôt qu'une comparaison naïve
des deux dernières composantes DNS.

Format retenu (domaine d'exemple à remplacer avant activation) :

```text
https://v-<version UUID sans tirets>.games-content.example/<chemin>
https://p-<session UUID sans tirets>.games-content.example/<chemin>
```

Une base commune et un seul wildcard DNS/TLS suffisent pour ces deux familles,
quel que soit le nombre de jeux. Deux bases distinctes sont aussi configurables.
Chaque version publique possède sa propre origine ; chaque session de preview
possède une origine nouvelle et jamais réutilisée. Il n'y a pas de configuration
DNS par jeu. Storage/localStorage/IndexedDB/cache d'origine ne sont donc pas
partagés entre jeux, versions ou sessions. Coût : davantage d'origines, stockage
non transféré automatiquement entre versions et possibles connexions TLS en plus.
Une éventuelle sauvegarde inter-version relèvera d'une API explicite future.

Les cookies du portail ne sont jamais copiés sur le site de contenu. Le seul
cookie de preview est `__Host-cg-preview`, Secure, HttpOnly, Path=/, SameSite=Lax,
Max-Age borné par la session, **sans Domain**. Le préfixe __Host empêche aussi un
sous-domaine voisin de fabriquer un cookie Domain portant le même nom.
Les cookies homonymes dupliqués sont refusés. Pas de CORS générique sur les assets.

Service workers : toutes les requêtes portant `Service-Worker` ou
`Sec-Fetch-Dest: serviceworker` sont refusées (403), sans `Service-Worker-Allowed`.
`worker-src self blob:` reste permis pour les Web Workers des moteurs : cette
directive seule ne distingue pas les service workers. La protection combine donc
le refus au gateway et la séparation des origines, jamais une simple convention
de chemins. Ne jamais réutiliser un ancien domaine ayant déjà hébergé des jeux
ou un service worker non contrôlé : celui-ci pourrait intercepter avant le réseau.
Les hosts `v-`/`p-` ne doivent avoir aucun autre handler ni accès R2 public direct.

## 28. Preview privée historique : API, ticket, échange

API générique (sans UI obligatoire) :

```http
POST /api/developer/game-versions/{versionId}/preview
Authorization: Bearer <session utilisateur, uniquement vers le portail>
Content-Type: application/json

{"execution":"local"}
```

Réponse 201 `data` : descriptor de lancement + `preview.method="POST"`,
`preview.action="https://p-.../_preview/exchange"`, `preview.fields.ticket`,
`preview.expiresAt` et `preview.ticketExpiresIn=60`. Réponses privées/no-store.
Le JWT utilisateur n'est jamais transmis au gateway ou au jeu. Comme pour l'API
d'upload, un Origin fourni doit être celui du portail ; un CLI sans Origin peut
s'authentifier en Bearer. Pas d'authentification par simple cookie sur cette API.

Séquence :

1. Auth getUser serveur puis autorisation actuelle sur le jeu cible.
2. Ticket opaque aléatoire 256 bits, valable 60 secondes, lié à version, execution,
   utilisateur et session/génération. Seul son SHA-256 est stocké.
3. Le portail soumet un formulaire POST (onglet de preview) vers l'action retournée.
   Le CLI peut faire le même POST puis utiliser son cookie jar. Le ticket est dans
   le corps, jamais dans query, fragment ou URL. Aucun échange GET.
4. Le gateway consomme le ticket une seule fois sous verrou DB, revérifie droits
   et statut, crée un autre secret opaque et pose son cookie host-only HttpOnly.
   Seul le hash du cookie est conservé côté DB.
5. Réponse **303** vers l'entrypoint propre. Le corps POST n'est pas renvoyé au jeu.
   Un nouvel essai du ticket échoue ; une nouvelle preview reste possible.
6. Chaque asset vérifie cookie/session, expiration, statut ET permissions actuelles.
   Une suppression de rôle/membership bloque la prochaine requête non déjà reçue.

Le ticket n'apparaît donc pas dans l'URL, les referers ou les logs du gateway.
Les outils réseau du navigateur et un éventuel historique de formulaire peuvent
conserver le corps POST : expiration courte et consommation unique restent utiles.
Ne jamais capturer les corps/cookies dans un outil analytics ou un proxy amont.

Ce contrat historique utilise une **preview top-level**. SameSite=Lax n'est pas une promesse
de fonctionnement dans une iframe cross-site. Avant un player privé intégré,
choisir/tester CHIPS/cookies partitionnés ou un autre mécanisme dédié, avec les
restrictions Safari/Firefox/Chrome et une ouverture top-level de secours. Aucun
affaiblissement de SameSite ni jeton dans chaque asset n'est ajouté ici.

Les requêtes privées avec Origin étranger ou contexte cross-site de sous-ressource
sont refusées. Seule la navigation top-level est admise ; le framing est en plus
limité par CSP. La session indépendante peut rester valide après logout du portail
jusqu'à 15 minutes : elle n'utilise pas la session Supabase. Sa courte durée et la
revérification des permissions sont explicites ; une révocation immédiate au logout
pourra être ajoutée au futur orchestrateur. Le build lui-même est du code non fiable :
une preview autorisée ne constitue pas un DRM empêchant l'auteur/visiteur d'en copier
ou divulguer les octets reçus.

## 29. Autorisation du contrat preview historique

Migration du contrat preview : `20261016000300_game_artifact_previews.sql`.
L’attribution des rôles de revue nécessite une opération privilégiée explicite.

- `game_preview_sessions` : génération UUID unique, version, execution, issued_by,
  hashes ticket/cookie, timestamps de consommation/expiration. Durée 15 minutes,
  ticket 60 secondes, au plus 30 créations/minute/utilisateur (verrou DB).
- `game_reviewers` : capacité plateforme de review, sans ownership. Un reviewer
  peut voir in_review/approved ; owner/editor et admin voient aussi draft.
- `game_version_delivery_policies` : profil/réseau **approuvés par la plateforme**,
  séparés du manifest immuable, sans headers arbitraires fournis par le développeur.

Tables privées RLS ; aucun SELECT/INSERT/UPDATE/RPC accessible à anon/authenticated.
RPC service_role seulement, après identité utilisateur vérifiée pour l'émission.
Le gateway reçoit uniquement le credential backend configuré dans son environnement,
jamais dans les réponses/builds ; il ne reçoit pas les JWT utilisateurs.
Le cron proposé supprime les sessions expirées toutes les 15 minutes ; l'autorisation
refuse déjà toute session expirée même si le cron est retardé. Index d'expiration.
Ne pas stocker les sessions dans game_versions, ni leurs secrets bruts en DB.

## 30. HTTP, streaming, MIME et cache

Méthodes GET/HEAD sur les fichiers, POST seulement pour l'échange. Le binding R2
fait HEAD puis GET conditionnel sur l'ETag de stockage. Le body ReadableStream est
transmis directement, sans Buffer de l'asset complet. Un changement inattendu entre
HEAD/GET échoue fermé. HEAD ne lit pas le body ; il renvoie les mêmes métadonnées.

Content-Type déterminé via la table plateforme phase 1, pas celui fourni en upload :
HTML, JS/mjs, CSS, JSON, WASM, images, audio/vidéo, fonts, binaire/data. `.gz`/`.br`
gardent le type sous-jacent + Content-Encoding, utile aux exports Web précompressés.
Le build doit référencer le bon fichier : pas de négociation automatique de variantes.
ETag public basé sur SHA-256 serveur. `nosniff` sur les réponses et erreurs.

Single byte ranges : 206 pour bornée/ouverte/suffixe, Content-Range/Length exacts ;
416 (bytes */taille) pour range invalide ou multiple. If-Range avec ETag fort pris
en charge ; une date ou un ETag différent donne la réponse complète. Les ranges
comptent les octets de la représentation stockée (y compris gzip/br). HEAD ignore
Range. Les réponses ne prennent pas en charge multipart/byteranges et n’ajoutent pas de Last-Modified sans source fiable.

Cache :

- Preview et toutes erreurs : `private, no-store`, Vary Cookie pour les fichiers.
- Published assets : `public, max-age=31536000, immutable`.
- Published HTML : `public, no-cache`, revalidation, afin de vérifier à nouveau le
  statut avant chaque nouveau lancement ; l'ETag peut produire 304 après autorisation.
- Le gateway ne met pas les réponses en cache partagé via Cache API.
  Toute requête qui l'atteint vérifie le statut avant R2/304. Ne pas ajouter une règle
  Cloudflare « cache everything » qui court-circuiterait ces contrôles.

L'archive d'origine n'est jamais une route de contenu. Les chemins encodés ambigus,
%2e/%2f/%5c/%25/%00, traversals/backslashes/chemins absolus sont refusés avant résolution.
Les segments déjà normalisés par le navigateur ne sont pas reconstructibles ; même
dans ce cas le chemin résultant ne peut sortir du namespace client vérifié.
Un rollback change active_version_id, jamais les objets. Les assets publics déjà
téléchargés/cachés ne peuvent pas être révoqués à distance ; archiver bloque les
nouvelles requêtes atteignant le gateway, pas les copies existantes.

## 31. Profils de sécurité et réseau

Profils versionnés choisis dans la DB par la plateforme, pas auto-approuvés via JSON :

| Profil | Usage |
| --- | --- |
| web-v1 | Défaut, WASM autorisé avec wasm-unsafe-eval, Web Workers self/blob |
| web-isolated-v1 | COEP require-corp + COOP same-origin ; nécessaire si manifest réclame crossOriginIsolation |
| web-legacy-v1 | JS unsafe-eval permis uniquement après approbation explicite |

Tous : CSP default-src none, self pour les ressources nécessaires, scripts/styles
inline pour les loaders Web exportés, data/blob limités aux types utiles, pas de
frame enfant/object/base/form. Sandbox CSP allow-scripts allow-same-origin
allow-pointer-lock, sans popup, navigation top, forms ou downloads accordés.
allow-same-origin est ici entre origines de contenu **distinctes** du parent ;
ce couple serait dangereux sur l'origine du portail.
frame-ancestors contient uniquement les origines portail configurées, Referrer-Policy
no-referrer, CORP same-origin, COOP same-origin et Origin-Agent-Cluster ?1.
Permissions-Policy refuse caméra/micro/géolocalisation/paiement/USB ; fullscreen,
audio et gamepad restent possibles sur self, sous conditions navigateur/gesture et
permissions de l'iframe hôte future. Aucun X-Frame-Options SAMEORIGIN contradictoire.

Le défaut interdit les origines réseau externes. connectOrigins/assetOrigins sont
des listes canoniques HTTPS/WSS approuvées (32 max), sans wildcards, userinfo, IP ou
localhost. Aucun header CSP brut n'est accepté. Ce contrôle CSP est une défense
navigateur sur les fetch/WebSocket/ressources ; il ne prétend pas rendre du code
tiers fiable ou empêcher toute exfiltration/navigation. L'iframe/orchestrateur
final devra compléter les permissions et restrictions de navigation.
Un script externe approuvé est aussi du code exécutable : limiter ces approbations.

SharedArrayBuffer/Unity/Godot multithread en iframe nécessiteront aussi les bons
headers et permissions du parent, plus CORS/CORP pour les ressources concernées.
Ces prérequis sont préparés, sans prétendre avoir testé de vrais exports moteurs
ou tous les navigateurs. Les profils devront évoluer à partir de ces recettes.

## 32. Erreurs, observabilité, activation et tests

Codes stables : unauthorized, version_not_found, version_not_previewable,
preview_forbidden, preview_expired, preview_replayed, unsupported_execution,
quota_exceeded, artifact_not_found, invalid_artifact_path, invalid_range,
service_worker_forbidden, unsupported_method, storage_error et service_unavailable.
Une incohérence serveur/policy échoue avec 503, jamais avec SQL, stack ou clé R2.
Les journaux structurés contiennent seulement requestId, gameId, gameVersionId,
empreinte SHA-256 du path normalisé et statut HTTP. Ils excluent path/URL/query bruts, session ID, headers,
corps, tickets et cookies. La configuration d'exemple désactive les invocation logs
automatiques ; vérifier aussi la journalisation amont/CDN avant activation.

`cloudflare/wrangler.artifacts.example.jsonc` est **non actif** : aucune route DNS,
TLS, bucket, migration distante, credential ou déploiement n'est créé. Bind ARTIFACTS
uniquement au bucket final privé (pas de binding staging), puis configurer côté
backend SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY existants sans les versionner.
Configurer les mêmes GAME_CONTENT_PUBLIC_BASE, GAME_CONTENT_PREVIEW_BASE et
GAME_PORTAL_ORIGINS dans Worker et portail. Les flags GAME_ARTIFACT_GATEWAY_ENABLED
et GAME_ARTIFACT_PREVIEWS_ENABLED restent désactivés sans activation explicite.

Tests : `npm run test:game-distribution`, `npm run test:game-uploads`,
`npm run test:game-artifacts`, `npm run test:game-artifacts-db`, TypeScript et lint
ciblé. Le dernier lance les trois migrations dans un PostgreSQL jetable local,
avec une vraie course entre deux échanges de ticket : un seul succès.
Le fake R2 teste le même port lecture et les flux/ranges ; Pong, solo avec
play/start.html et variante online-only 4 joueurs passent sans branche par gameId.
Le bundle Worker est compilé pour browser, sans Next/React/SDK/Pong/Node.

Fichiers phase 3 :

```text
lib/game-distribution/gateway/{contracts,resolver,preview,http,headers,gateway}.ts
lib/server/developerPreviews.ts
app/api/developer/game-versions/[versionId]/preview/route.ts
cloudflare/{artifact-reader,artifact-gateway}.ts
cloudflare/wrangler.artifacts.example.jsonc
supabase/migrations/20261016000300_game_artifact_previews.sql
tests/game-artifact-gateway.test.mjs
tests/game-artifact-db.sql
```

Les tests du Gateway couvrent les profils de sécurité, les chemins, les
autorisations et les réponses HTTP. Les fixtures locales ne valident ni DNS/TLS,
ni les permissions R2 distantes, ni les exports réels de tous les moteurs.

## 33. Lancement iframe sans cookies tiers

Le [GameRuntime](game-runtime.md) utilise un host aléatoire `l-<48 hex>` sur
`chibaskogames-play.fr`. Le Gateway résout son hash vers une launch session
autorisée, puis vers les objets client de la version. Preview/published et
local/online empruntent le même chemin, sans cookie d’autorisation.

La base est un domaine enregistrable distinct du portail ; PRIVATE PSL constitue
un durcissement facultatif. Deux launches ont des origins distinctes mais peuvent
partager des cookies Domain. Ces cookies ne doivent contenir aucune donnée sensible
et ne participent jamais à l’autorisation. Les contrôles serveur, CSP/sandbox et
bridge restent nécessaires. Les hosts de version `v-` et preview `p-` historiques
ne sont pas acceptés par le Worker production.

Les launches et renouvellements sont définis par les migrations
`20261017000100_game_launch_sessions.sql` et
`20261017000200_game_launch_renewals.sql`.
