# Game Distribution v1 — architecture et fondation

**Décision : ARCHITECTURE APPROUVÉE**, avec deux précisions : un serveur hébergé
chez nous n'est pas automatiquement un jeu honnête, et les exports Web multithreadés
nécessitent un profil d'isolation testé, pas seulement une iframe.

## 1. Audit réel

Audit du code et du SQL versionnés dans ce dépôt, sans introspection de la base
de production. Une vérification de dérive du schéma réel précédera toute migration.

- `games/clientRegistry.ts` importe encore le package React Pong par deux loaders.
  `GameRuntime`/`LocalGameRuntime` sont génériques mais résolvent du code installé au
  build du portail. L'ajout d'un module exige donc aujourd'hui un rebuild.
- Le game-server installe la définition/driver Pong dans son registre Colyseus.
  LobbyRoom, Coordinator, admission et réservations appartiennent à la plateforme.
- Le manifeste technique du catalogue est généré depuis ce registre au build.
  L'admin contrôle ses gameIds grâce à cette projection statique.
- SDK/Pong sont encore des dépendances Git privées des manifests web/backend.
  Leur extraction a validé la séparation du code, pas la distribution finale.
- `games.id` est un UUID. `game_type` distingue classic/multiplayer_chibasko,
  avec une contrainte conditionnelle URL ou multiplayer_game_id. Ni version,
  ownership développeur fiable, déploiement serveur ni artifact n'existe en DB.
  `developer_name` est du texte d'affichage, jamais une autorisation.
- `game_submissions` est un workflow éditorial, pas un registre de versions.
- R2 actuel : binding d'images `CHIBASKO_ASSETS`, origine publique assets, écritures
  conditionnelles. Ce bucket et son helper ne doivent pas héberger du HTML tiers.
- L'admin est autorisé via admin_users et endpoints serveur. Les écritures catalogue
  directes d'un JWT navigateur sont déjà interdites. Ce modèle n'est pas relâché.

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

Migration **préparée seulement**, à auditer avant application production :

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

Les contraintes game_type/URL actuelles restent inchangées. Avant lancement du
nouveau runtime, il faudra faire évoluer cette représentation vers une livraison
`managed_build` ou `external_url`, distincte des capacités local/online. Le seul
ajout de game_versions ne rend pas encore un build solo natif publiable.

## 7. Lifecycle

Upload/job : receiving → validating → failed/completed. À gérer séparément du
catalogue ; pas de table/job backend construit dans cette phase.

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

Les colonnes restent des cibles ; ni iframe player ni serveurs tiers/hosting ne
sont déclarés opérationnels par cette phase. SDK est un contrat facultativement
consommé par une bibliothèque : le wire protocol documenté peut aussi être implémenté
par un moteur ne sachant pas charger npm.

## 16. Migration ordonnée et impact Cloudflare

1. **GAME-DISTRIBUTION-1 ici** : contrat, validateurs, fixtures, clés/port de stockage,
   migration additive préparée et tests locaux ; aucun routage/jeu migré.
2. Ownership/API uploads/jobs, stockage privé/gateway, revue/publication atomiques,
   previews autorisées et gestion d'erreurs/reprises. Appliquer la migration seulement
   après revue et validation humaine de l'environnement réel.
3. SDK public de bridge (npm + JS), player isolé, profils CSP/sandbox, tests réels
   HTML/Unity/Godot ; décision de domaine, threading et fonctionnalités approuvées.
4. Catalogue : active_version et capacités depuis une projection DB à runtime,
   remplacement du registre client/manifeste compilé. Livraison ≠ local/online.
5. Control plane online : provider de sessions générique. Lobby/Coordinator restent
   internes, mais ne chargent plus de constructeurs de jeux. Handshake, tickets et
   provenance sont fournis par une interface de déploiement, pas par gameId hardcodé.
6. Pong fournit son export Web autonome (online/local, SDK bridge) et un artifact
   serveur indépendant avec son transport. La physique/UI existantes sont conservées.
   Le processus gameplay Pong est déployé à part du processus lobby plateforme.
7. Preview/recette public/privé/local + résultats/replay, puis sélection de la version.
   Retirer enfin les dépendances Pong **web ET game-server**, les registres source
   et scripts Git spécifiques. Distribuer le SDK par un registre accessible sans
   Git privé. Le simple remplacement du client ne suffit pas à découpler le backend.

Les dépendances Git actuelles restent fonctionnelles jusqu'au remplacement réel.
**Aucun PAT, deploy key ou GitHub App à configurer pour contourner Cloudflare.**
L'échec d'installation cloud lié aux Git privés n'est volontairement pas corrigé
ici. La cible est qu'un build du portail n'accède plus à aucun repo de jeu, et
que le SDK soit distribué sans Git privé. Ajouter/mettre à jour un jeu n'affectera
alors ni ce build, ni ses credentials.

## 17. Portée et décisions ouvertes

Fondation livrée : schema/types, validation de manifest et vrais ZIP, hash/inventaire,
clés et port R2 sans binding réel, fixtures Pong contractuelle et solo générique,
tests unitaires et PostgreSQL jetable (RLS/immutabilité/rollback/concurrence).
La fixture Pong ne contient pas le jeu ni sa simulation.

Avant exposition : domaine de contenu, profils par moteur/threading, canal des
grants preview et révocation, ownership des éditeurs, quotas/offres, rétention/GC,
jobs isolés/streaming, audit de publication et licence/distribution SDK publique.
Ces décisions n'introduisent aucune propriété Git/moteur/hébergement dans le format.
Elles sont des politiques de service, à valider avant mise en production.

Aucune migration production, écriture R2/Supabase, iframe finale, portail développeur,
CLI complète, hosting, protocole tiers ou changement de gameplay implémenté ici.

## 18. Fichiers et vérification de GAME-DISTRIBUTION-1

```text
lib/game-distribution/
  chibasko.schema.v1.json             contrat de distribution canonique
  types.ts                           types portables, sans SDK runtime
  manifest.ts                        validation et cohérence de la cible
  manifest-validator.generated.mjs   sortie reproductible, nécessaire au runtime
  paths.ts                           chemins et MIME/Content-Encoding
  build.ts                           inventaire, limites et hash de contenu
  zip.ts                             validation de vrais ZIP, sans extraction disque
  keys.ts                            namespace R2 immuable
  storage.ts                         port conditionnel privé, sans binding réel
scripts/generate-distribution-validator.mjs
supabase/migrations/20261016000100_game_distribution_versions.sql
tests/game-distribution.test.mjs
tests/game-distribution-db.mjs
tests/game-distribution-db.sql
tests/fixtures/game-builds/{pong,solo}/
```

Scripts et lockfile racine adaptés ; README, anciennes notes d'extraction SDK/Pong
et guide production signalent le changement de cible. Aucun registre, route,
runtime, SDK ou package Pong modifié. Les types Supabase générés ne sont pas
modifiés pour prétendre que la migration est déjà appliquée : les régénérer après
application validée dans l'environnement choisi.

Commandes de vérification ciblée :

```sh
npm run test:game-distribution
npm run test:game-distribution-db
npx tsc --noEmit
npx eslint lib/game-distribution scripts/generate-distribution-validator.mjs tests/game-distribution.test.mjs tests/game-distribution-db.mjs
node --import ./tests/register.mjs --test tests/game-sdk.test.mjs tests/game-catalogue.test.mjs tests/product-session.test.mjs
npm run check:game-manifest
npm run check:game-boundaries
git diff --check
```

Le test DB crée et arrête son propre cluster PostgreSQL local jetable, sans DSN
hérité ni accès Supabase. PostgreSQL doit être disponible ; `CATALOGUE_TEST_PG_BIN`
permet de choisir ses binaires. En environnement restreint, l'initialisation peut
nécessiter une exécution hors bac à sable. Les refus SQL, la conservation du
catalogue, le rollback et la concurrence activation/archivage sont exécutés, pas
seulement vérifiés par recherche textuelle.

Résultats de cette phase : 8 tests distribution et 22 tests SDK/catalogue/session
réussis, scénario PostgreSQL réussi, TypeScript/lint ciblé/manifeste/boundaries
réussis. Les tests distribution sont aussi inclus dans la suite racine.
Les tests R2 utilisent exclusivement un faux bucket ; aucun objet distant créé.
Le test bundle exécute le validateur manifest avec génération de code interdite,
sans prétendre valider un futur worker complet ou tous les exports moteur.

Next/Cloudflare, jeu réseau et téléphones n'ont pas été recettés à nouveau : cette
fondation n'est branchée à aucun parcours. Les dépendances Git et le blocage
d'installation Cloudflare actuel restent inchangés. Une recette complète sera
requise lors du branchement du player, du pipeline et des serveurs gameplay.
