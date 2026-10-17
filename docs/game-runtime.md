# GameRuntime — GAME-RUNTIME-1

Activation désactivée par défaut : `GAME_RUNTIME_LAUNCHES_ENABLED` côté portail,
`GAME_ARTIFACT_GATEWAY_ENABLED` côté Worker. Avant toute activation autorisée,
configurer `GAME_CONTENT_BASE_DOMAIN` (frontière PSL), les bases public/preview
du gateway, les origines portail et les bindings backend ; aucune valeur réelle
ni flag d'activation n'est écrit ici.

Le nouveau player `components/game-runtime/GameRuntime.tsx` consomme uniquement des
builds Web via le gateway. Il n'importe aucun jeu, registre de modules, SDK installé,
auth provider ou code réseau gameplay. Le player historique `components/multiplayer/`
reste branché pour Pong jusqu'à PONG-MIGRATION. Le nouveau player est éprouvé avec
des fixtures ; aucune nouvelle action du catalogue n'est activée ici.

## Lancement sans cookies tiers

```text
Portal / CLI / future developer UI
  → POST /api/game-launches
  → autorisation DB + session online préparée si online
  → game_launch_session (version exacte, expiration, génération)
  → descriptor + capability de contrôle réservée au portail
  → https://l-<capability aléatoire>.GAME_CONTENT_BASE_DOMAIN/<entrypoint>
  → gateway : hash du hostname → launch session → version → R2 client
  → même iframe et même bridge pour preview/published et local/online
```

Le hostname contient 192 bits aléatoires (48 caractères hexadécimaux). Il ne contient
ni gameId, userId, roomId, JWT, ni UUID d'authentification. La DB conserve son SHA-256,
pas le hostname brut. Un second secret aléatoire de contrôle est conservé seulement
par le portail, jamais par le jeu ; son hash permet DELETE/idempotent au teardown.
Ce sont des capabilities éphémères, pas des credentials d'infrastructure créés
dans cette phase. Pas de cookie, exchange cookie, session Supabase ou query token
nécessaire pour charger HTML/assets. Aucun service worker.

Le hostname **est un bearer capability** : le copier permet d'accéder au build
jusqu'à expiration/révocation. Il est visible au jeu, DNS/TLS/CDN et aux outils
réseau ; ce modèle ne cache pas un build à son propre lecteur. Ne jamais l'ajouter
aux logs/analytics ; no-referrer et no-store partout sur les hosts de lancement.
La gateway ne journalise ni URL, hostname, Cookie, Authorization ni secrets de contrôle.
Les journaux amont doivent aussi être configurés avant activation.

Chaque lancement, y compris retry, possède une origine nouvelle, jamais réutilisée.
Les objets R2 restent les mêmes, immuables. Les anciens hosts `v-` publics et `p-`
preview top-level de phase 3 restent disponibles, sans être utilisés par ce player.

## Frontière de cookies : contrainte de mise en production

Un domaine enregistrable distinct du portail protège ses cookies, mais des
sous-domaines sous une même base permettent encore à un jeu de poser un cookie
`Domain=<base>` partagé avec ses voisins. Ce n'est pas une isolation complète.

La cible durable est donc une base de contenu dédiée, gérée par Chibasko Games,
reconnue dans la section PRIVATE de la Public Suffix List. Chaque `l-...` devient
alors un site enregistrable distinct. Un seul wildcard DNS/TLS suffit toujours.
Le serveur et le contrôle de descriptor refusent une base sans cette frontière.
Pas de bypass manuel « trusted official game ». `tldts` consulte la PSL, suffixes
privés compris. La reconnaissance doit être vérifiée dans les navigateurs supportés
après propagation de l'inscription : une liste serveur seule ne change pas le navigateur.

Aucun domaine réel n'est choisi/acheté/enregistré ici. L'exemple de configuration
reste désactivé et non activable tant qu'une base adéquate n'est pas configurée.
Les tests interceptent localement des hosts sous github.io (suffixe privé connu),
sans faire de requête vers GitHub ni le considérer comme domaine de déploiement.
L'alternative sans PSL serait de renoncer à la garantie d'isolation cookies, ou de
reconcevoir un sandbox à origine opaque avec ses contraintes de messaging/stockage.
Cette phase ne prétend pas qu'un wildcard ordinaire suffit.

Références : [PSL](https://publicsuffix.org/learn/index.html),
[critères de suffixe privé](https://github.com/publicsuffix/list/wiki/Guidelines),
[cookies Domain](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

## API et résolution

`POST /api/game-launches` : JSON exact `{gameId,gameVersionId,execution,audience,locale,
onlineSessionReference?}`. `execution=local|online`, `audience=published|preview`.
Retour 201 `{data:{descriptor,controlToken}}`, privé/no-store. Les champs inconnus,
identités/contexte fournis par le client et Origin étranger sont refusés.

- Published local : anonyme autorisé si version published et jeu catalogue publié.
- Preview : Bearer vérifié via getUser, droits owner/editor/admin ou reviewer suivant
  le statut ; aucun JWT n'est retransmis au gateway/jeu.
- Online : compte requis et `OnlineLaunchAuthorizer` privé obligatoire. Ce port
  doit résoudre une session préparée depuis une référence opaque autorisée, vérifier
  admission/version et mapper l'identité en pseudonymes de session. Aucun adaptateur
  legacy n'est branché par défaut : l'API réelle répond `online_session_required`
  plutôt que d'accepter des identités ou réservations forgées. Les fixtures testent
  ce même chemin avec un adaptateur serveur simulé. Aucun gameplay réseau n'est simulé.

`DELETE /api/game-launches/{launchId}` : JSON `{controlToken}`, même origine ou CLI,
idempotent pour un contrôle valide ; aucun cookie/Bearer requis pour libérer son
propre lancement anonyme. Le client HTTP utilise keepalive au nettoyage, sans
garantie de livraison à la fermeture brutale du navigateur. Expiration + cron couvrent
les orphelins (y compris une création réussie dont la réponse est perdue).

`distribution_check_launch` revalide l'expiration/révocation et l'état publié, ou
les droits preview actuels, à chaque asset. Les hashes sont uniques et les tables/RPC
privés (RLS, service_role seulement). Les clés R2 ne sont jamais dans le descriptor.
Le gateway partage le port storage de phases 1–3 : streaming, HEAD, Range et MIME.

Policy centrale : descriptor 15 s, iframe load 120 s, handshake 30 s après load/HELLO,
heartbeat 10 s / réponse 30 s, lease 30 minutes ; émissions compte 60/min et plafond
global anonyme 600/min, atomiques en DB. Les plafonds sont ajustables côté plateforme.
Le plafond global anonyme est un garde-fou de coût, pas un fair-use par joueur :
ajouter un rate limit edge fiable avant une ouverture publique importante.
Pas de renouvellement automatique dans V1 : expiration ferme le lancement. Un
renouvellement de lease autorisé sera nécessaire avant les longues sessions ; il
pourra conserver origine/génération sans modifier le protocole gameplay.

## Iframe et fonctionnalités navigateur

Profil versionné issu de la policy de livraison approuvée (`web-v1`,
`web-isolated-v1`, `web-legacy-v1`), jamais un sandbox arbitraire du manifest.

Sandbox : `allow-scripts allow-same-origin allow-pointer-lock`.
allow-same-origin est volontaire : sinon origin devient null, stockage/Workers
peuvent casser et on perd le ciblage postMessage exact. Il est acceptable ici
seulement avec une origine dédiée par lancement, hors origine du parent et avec
frontière de cookies PSL. Le jeu ne peut pas retirer le sandbox cross-origin.

Aucune permission top-navigation, popup, forms ou downloads. Fullscreen est refusé
à l'iframe elle-même : le bouton du portail met son conteneur en plein écran,
**avec Quitter toujours hors du jeu**. `allow-fullscreen` et `allow-gamepad` ne sont
pas des tokens sandbox : les fonctionnalités relèvent de Permissions Policy.
Autoplay/gamepad/cross-origin-isolated sont délégués à l'origine exacte, sans
contourner les gestes utilisateur/politiques navigateur. Pointer lock reste permis
au jeu après interaction ; Escape navigateur le libère.

Le gateway conserve CSP/sandbox/frame-ancestors/no-referrer/nosniff/CORP/COOP,
COEP selon profil et réseau externe approuvé. Le player ne crée pas de droit réseau
supplémentaire. Les Web Workers sont permis ; les service workers restent refusés
au gateway, sans Service-Worker-Allowed. Aucun autre service ne doit servir les hosts.

La surface iframe prend l'espace disponible ; aucune taille logique ou aspect ratio
spécifique à un jeu. L'hôte peut fournir `--game-runtime-height`. UI, erreur, retry et
Quitter restent hors iframe. Le fullscreen englobe cette UI. Orientation non forcée.
Une iframe ou renderer bloqué est détaché après perte de heartbeat ; on ne promet pas
de détecter instantanément un crash navigateur ni de rendre le top renderer infaillible.

## Lifecycle et sécurité du bridge

`resolving → launching → loading → ready → running`, puis `failed` ou `closed`.
Le jeu annonce HELLO, le portail INIT, le jeu READY. load n'est jamais une preuve de
SDK prêt. Les transitions seules mettent à jour React, pas des frames gameplay.
Le bridge et le contrôleur DOM sont indépendants de React.

Le bootstrap fragment contient cgLaunch/cgGeneration/cgParent (identifiants de
corrélation non secrets), jamais de JWT/controlToken. Le fragment ne part pas au
gateway. Le SDK futur pourra le lire sans ESM/npm ; l'origine parent reste validée
par framing CSP et les contrôles source/origin.

Tout message vérifie fenêtre source, origine exacte, channel/version, launchId,
generation, schéma strict et documentId. Aucune cible `*`. La generation change
à chaque lancement ; le documentId est renouvelé par le jeu à chaque document.
Dup HELLO/READY idempotents, ancien document refusé ; deuxième load ou nouveau
documentId invalide le lancement. Une navigation étrangère ne reçoit pas INIT,
même si elle réutilise le WindowProxy. Retry recrée origine et iframe.

Le portail émet START/STOP ; visibilité cachée suspend START/heartbeat, retour visible
reprend avec un nouveau ping et contrôle d'expiration. Aucun heartbeat ne prolonge
la session serveur ni ne représente une autorité de score. Erreurs du jeu affichées
par une formulation fixe ; aucun HTML/message libre injecté dans le portail.
Teardown : abort HTTP, retrait iframe, timers et listeners, révocation best-effort.
Le parent doit démonter/recréer le runtime quand le compte ou la session online
change ; le player ne lit pas lui-même AuthProvider. Cette intégration reste à
brancher lors de PONG-MIGRATION. Un lancement local anonyme n'en dépend pas.

## SDK séparé et moteurs

Voir [spécification SDK proposée](sdk-browser-bridge-v1.md). Aucun fichier du repo SDK
n'est modifié ici et aucune copie de son source n'est réintroduite. Le jeu fixture
est un mock de protocole, pas une distribution cachée d'un second SDK.
Un SDK publié pourra exposer la même intégration via npm et script IIFE/CDN ;
Unity JS interop/Godot JSBridge/Construct appelleront ces mêmes primitives JS.
Les wrappers et le gameplay réseau ne sont pas implémentés dans cette phase.
Les vrais exports Unity/Godot, le multithread COOP/COEP côté parent, Safari/Firefox et
les appareils physiques nécessitent une recette dédiée avant support annoncé.

## Tests et migrations

`test:game-runtime`, `test:game-runtime-browser`, `test:game-runtime-db`.
La recette navigateur utilise Chrome headless réel, routes HTTPS interceptées
localement, flag de blocage cookies tiers. Elle monte le vrai composant React et
le vrai bridge, consomme API/service/gateway avec DB/R2 simulés, teste trois builds,
IDB/localStorage/BroadcastChannel/cookies, reload/navigation/top-navigation, absence
de SDK et layouts 390×844, 768×1024, 844×390. Ce n'est pas un vrai bucket/domaine/phone.
Les service workers sont désactivés dans le runner pour garantir zéro appel externe ;
le refus gateway de leurs requêtes est couvert par les tests artifact de phase 3.

Nouvelle migration `20261017000100_game_launch_sessions.sql`, préparée uniquement.
Le harness PostgreSQL applique phases 1–4 sur cluster jetable local. Les migrations
précédentes restent intactes. Aucun compte, DNS, secret, bucket ou domaine configuré.
Les anciennes dépendances Git SDK/Pong restent présentes, blocage Cloudflare connu.

## Plan PONG-MIGRATION

1. Appliquer séparément la proposition SDK et distribuer une version utilisable sans
   Git privé (package public ou build JS distribué), sans exposer les internals.
2. Dans le repo Pong : produire un build Web client online/local, intégrer le bridge,
   conserver le moteur partagé et le serveur autoritaire ; tester sans portail.
3. Préparer côté plateforme l'adaptateur de session online vérifié : pseudonymes,
   contexte/ticket de connexion limité au serveur gameplay, sans JWT Supabase ni
   réservation interne. Conserver public/private dans l'orchestration du lobby.
4. Configurer domaine de contenu, frontière PSL, TLS, buckets/queue/gateway, migrations
   et politiques réseau après autorisation distincte ; recette moteurs/navigateurs.
5. Uploader le même build officiel par le pipeline générique, valider une DRAFT,
   tester preview avec ce player, local anonyme et online à deux comptes.
6. Publier/activer explicitement la version après recette humaine ; basculer les
   lancements catalogue/lobby vers ce runtime unique. Tester score/results/replay,
   forfeit, deuxième partie, renouvellement/longues sessions et rollback.
7. Retirer imports/registres legacy côté client et dépendance package Pong du portail.
   Le module serveur Pong doit alors être distribué/chargé hors build du portail ;
   conserver un adaptateur serveur sûr, sans présenter le build client comme serveur.
8. Retirer enfin les dépendances Git privées du SDK/Pong restantes et valider install
   Cloudflare sans accès aux repos des jeux. Aucun PAT/deploy key/App en contournement.

Aucune de ces migrations produit, SDK, Pong ou production n'est exécutée ici.

## Fichiers et validation locale

Nouveaux fichiers plateforme :

```text
app/api/game-launches/route.ts
app/api/game-launches/[launchId]/route.ts
components/game-runtime/GameRuntime.tsx
components/game-runtime/GameRuntime.module.css
lib/game-runtime/contracts.ts
lib/game-runtime/client.ts
lib/game-runtime/bridge.ts
lib/game-runtime/controller.ts
lib/game-distribution/gateway/launch.ts
lib/server/gameLaunches.ts
supabase/migrations/20261017000100_game_launch_sessions.sql
tests/game-runtime.test.mjs
tests/game-runtime.browser.test.mjs
tests/game-launch-db.sql
tests/helpers/runtime-harness.mjs
tests/fixtures/runtime-host.tsx
tests/fixtures/runtime-builds/bridge-fixture.js
tests/fixtures/runtime-builds/pong-like/{chibasko.json,index.html}
tests/fixtures/runtime-builds/solo/{chibasko.json,play/start.html}
tests/fixtures/runtime-builds/online/{chibasko.json,index.html}
docs/game-runtime.md
docs/sdk-browser-bridge-v1.md
```

Adaptations : gateway/{contracts,gateway,resolver}.ts, uploads/repository.ts,
cloudflare/artifact-gateway.ts et configuration d'exemple non active, package.json /
lockfile, harness DB et docs/game-distribution.md. Les modifications de phase 3 déjà
présentes au début sont conservées. Aucun fichier SDK/Pong ni source gameplay changé.

Recette réalisée : Chrome headless 155.0.8059.80, 11 scénarios navigateur réels,
12 tests runtime/API/bridge, 8 tests distribution + 22 upload + 13 gateway : 66 tests.
PostgreSQL jetable valide les quatre migrations, RLS, permissions, expiration,
révocation, quotas et nettoyage, en conservant les courses des phases précédentes.
TypeScript, build Next Webpack et compilation Worker browser passent. Les fichiers
générés restent ignorés. Aucun bucket réel ni moteur Unity/Godot réel testé.

Le script navigateur utilise Chrome installé par défaut ; `RUNTIME_BROWSER_CHANNEL`
peut sélectionner un autre channel installé, notamment chromium après une installation
Playwright explicite en CI. `npm test` inclut les tests runtime purs ; exécuter
séparément `npm run test:game-runtime-browser` et `npm run test:game-runtime-db` pour
la recette navigateur et PostgreSQL. Aucun téléchargement de navigateur ni profil
personnel n'est requis/utilisé par la recette réalisée avec Chrome déjà installé.
