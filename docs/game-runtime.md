# GameRuntime — GAME-RUNTIME-1 / RUNTIME-COMPAT-1

Le portail charge les builds de jeu sans importer leur code source ni leur serveur
gameplay. Les recettes datées constituent des références de validation, pas une
attestation de l’état distant. Voir aussi [la distribution Pong](pong-migration.md)
et [le Gateway production](artifact-gateway-production.md).

Les garde-fous restent fermés en l'absence de `GAME_RUNTIME_LAUNCHES_ENABLED=1`
côté portail et `GAME_ARTIFACT_GATEWAY_ENABLED=1` côté Gateway. La configuration
production versionnée active désormais ces deux flags sur leurs Workers distincts.
La base de contenu est `chibaskogames-play.fr`, domaine enregistrable distinct du
portail ; la PRIVATE PSL reste un durcissement facultatif, sans prérequis bloquant.

## Configuration des launches côté portail

Le Worker `chibasko-games-preview` doit posséder ses propres variables. Celles du
Worker `chibasko-game-artifact-gateway` ne lui sont pas transmises :

| Nom | Valeur attendue sur le portail |
| --- | --- |
| `GAME_RUNTIME_LAUNCHES_ENABLED` | `1` |
| `GAME_CONTENT_BASE_DOMAIN` | `chibaskogames-play.fr` |
| `GAME_CONTENT_PUBLIC_BASE` | `chibaskogames-play.fr` |
| `GAME_CONTENT_PREVIEW_BASE` | `chibaskogames-play.fr` |
| `GAME_PORTAL_ORIGINS` | `https://chibaskogames.fr,https://www.chibaskogames.fr` |
| `NEXT_PUBLIC_SUPABASE_URL` | Origine HTTPS du projet, sans `/rest/v1/` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique existante, requise pour vérifier le compte en preview |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret serveur existant, configuré séparément |

Les cinq variables non secrètes de lancement sont déclarées dans `wrangler.jsonc`.
La procédure CLI habituelle conserve les autres variables dashboard avec
`--keep-vars`. Si la livraison ne lit pas ce fichier, configurer ces mêmes noms
dans Settings → Variables and Secrets du Worker du portail, puis rendre cette
configuration effective sur la version active. Aucun binding R2 ou service
Gateway supplémentaire n'est requis par `POST /api/game-launches` : la route
crée une session autorisée via Supabase et calcule une origine aléatoire. L'iframe
contacte ensuite le Gateway séparé, qui conserve son binding `ARTIFACTS`.

La preview admin utilise `audience=preview` pour `draft`, `in_review` ou `approved`.
Le flag historique `GAME_ARTIFACT_PREVIEWS_ENABLED` des tickets top-level n'est
pas utilisé par ce bouton : il passe par les launch sessions sans cookie tiers.
L'autorisation Supabase précède la résolution du manifeste privé et est répétée
à la création du launch. Une demande `published` pour un draft reste refusée.
La projection `distribution_resolve_version` vérifie UUID/version, manifeste,
hash, préfixe client immutable et policy ; aucun préfixe ni donnée DB privée n'est
retourné dans le descriptor. Le test ne publie jamais une version.

### Diagnostic d'un échec de lancement

Chaque réponse porte `X-Request-Id`. Un échec produit `game_launch_failed` avec
requestId, opération, phase, étape, code et statut ; audience et exécution sont
incluses seulement après validation de leurs valeurs. Les phases distinguent
configuration, authentification, autorisation, résolution de version, création
de session, origine de contenu, base de données et erreur inattendue.

`reason=launches_disabled` identifie le premier garde-fou de configuration.
`configuration.present/missing/invalid` ne contient que des noms de variables.
Pour une erreur DB, `phase=database`, `stage` conserve l'étape fonctionnelle et
`rpc` indique opération, catégorie, statut HTTP et code PostgreSQL/PostgREST sûr.
Les autres erreurs conservent leur code public stable. Une erreur inattendue
retourne `service_unavailable`, sans détail brut.

Aucun corps, acteur Auth, cookie, bearer, controlToken, ticket, hash de capability,
URL de launch, message SQL ou stack n'est journalisé. Les échecs de logging ne
modifient jamais l'autorisation ou les réponses. Les tests de diagnostic sont
inclus dans `npm run test:game-runtime` avec des fixtures uniquement.

Le player `components/game-runtime/GameRuntime.tsx` consomme des builds Web via le
Gateway. Il ne charge ni code gameplay ni registre de modules de jeu dans le
portail. Le catalogue et les lobbies lui fournissent les références de version
et de session autorisées.

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
Ces capabilities éphémères sont distinctes des credentials d'infrastructure.
Pas de cookie, exchange cookie, session Supabase ou query token
nécessaire pour charger HTML/assets. Aucun service worker.

Le hostname **est un bearer capability** : le copier permet d'accéder au build
jusqu'à expiration/révocation. Il est visible au jeu, DNS/TLS/CDN et aux outils
réseau ; ce modèle ne cache pas un build à son propre lecteur. Ne jamais l'ajouter
aux logs/analytics ; no-referrer et no-store partout sur les hosts de lancement.
La gateway ne journalise ni URL, hostname, Cookie, Authorization ni secrets de contrôle.
Les journaux amont doivent aussi être configurés avant activation.

Chaque lancement, y compris retry, possède une origine nouvelle, jamais réutilisée.
Les objets R2 restent les mêmes, immuables. Les anciens hosts publics `v-` et
les previews top-level `p-` ne sont pas utilisés par ce player.

## Domaine de contenu et frontière de cookies

Le navigateur et le serveur acceptent une base enregistrable dédiée distincte du
site du portail, ou un suffixe PRIVATE reconnu. Le descriptor exige exactement
`l-<48 hex>.<base>`, HTTPS et un entrypoint de même origine. Un rejet produit
le code interne `origin_rejected` avant toute création d’iframe.

La base de production est `chibaskogames-play.fr`. PRIVATE PSL est un
durcissement facultatif. Sans inscription, les cookies Domain peuvent être
partagés entre sous-domaines : ils ne constituent jamais une autorisation.
Le Gateway ignore les cookies entrants et ne crée aucun cookie. Les capacités
aléatoires propres aux lancements contrôlent l’accès aux fichiers ; les origines
séparent le stockage navigateur, avec un sandbox cross-origin. Les Service
Workers restent interdits. Le domaine distinct protège les cookies du portail.

Les tests navigateur interceptent localement les requêtes vers cette base et
vers `github.io` pour conserver la couverture des suffixes PRIVATE existants.

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

`PATCH /api/game-launches/{launchId}` : même JSON de contrôle, réservé au portail.
Retour privé/no-store `{data:{launchId,generation,expiresAt}}`. Aucun nouveau
hostname, contexte, JWT ou token de contrôle n'est envoyé au jeu. Le renouvellement
conserve exactement la version, l'origine et la génération. Le backend revalide
les droits/statuts courants et refuse un lancement déjà expiré ou révoqué.

`distribution_check_launch` revalide l'expiration/révocation et l'état publié, ou
les droits preview actuels, à chaque asset. Les hashes sont uniques et les tables/RPC
privés (RLS, service_role seulement). Les clés R2 ne sont jamais dans le descriptor.
Le gateway partage le port storage de phases 1–3 : streaming, HEAD, Range et MIME.

Policy centrale : émissions compte 60/min et plafond global anonyme 600/min,
atomiques en DB. Les plafonds sont ajustables côté plateforme.
Le plafond global anonyme est un garde-fou de coût, pas un fair-use par joueur :
ajouter un rate limit edge fiable avant une ouverture publique importante.

## Phases et budgets — RUNTIME-COMPAT-1

L'ancien handshake de 30 secondes commençait au load/HELLO et attendait READY.
Il confondait exécution du SDK et disponibilité des assets. Il est remplacé par :

| Étape | Début / fin | Défaut | Erreur |
| --- | --- | --- | --- |
| Descriptor | création HTTP → descriptor validé | 15 s | descriptor_timeout |
| Document initial | montage iframe → load ou HELLO valide | 120 s | iframe_load_timeout |
| Attente SDK | load → HELLO | 15 s | hello_timeout |
| Handshake | HELLO → INIT envoyé immédiatement → PONG ou READY | 5 s | handshake_timeout |
| Préparation | acquittement d'INIT → READY | 10 min | game_ready_timeout |
| Vivacité | PING → PONG | ping toutes les 10 s, réponse sous 30 s | bridge_lost |

Un HELLO valide reçu avant load prouve que le document exécute son SDK et annule
le budget de navigation initiale. load seul ne prouve jamais que le SDK fonctionne.
HELLO déclenche INIT puis un premier PING ; le PONG corrélé acquitte INIT sans
nouveau message wire. READY peut lui-même acquitter INIT pour les jeux immédiats.
Seul READY autorise START. HELLO/INIT/PONG n'affichent jamais « Jeu prêt ».
L'état UI reste loading / « Chargement du jeu… » pendant la préparation ; la
connexion du bridge est un état interne.

Les budgets sont centralisés dans `lib/game-runtime/contracts.ts`. Les overrides
appartiennent uniquement à la plateforme, jamais au manifest développeur. Ils sont
bornés et validés : descriptor/HELLO/handshake jusqu'à 60 s, document jusqu'à 10 min,
préparation jusqu'à 30 min, réponse heartbeat jusqu'à 120 s. Le budget de préparation
est fixe : ni PONG, ni répétition HELLO, ni futur événement de progression ne le
repoussent. Le heartbeat pendant préparation distingue un moteur vivant d'un bridge
mort ; un travail synchrone bloquant le thread plus que le budget PONG peut être
détecté comme un blocage. Les vrais builds moteurs doivent valider ce réglage.

Un premier ping d'acquittement est envoyé même si le portail est masqué ; après
connexion, le heartbeat est suspendu quand le document parent est caché et reprend
au retour. Les limites de préparation et de bail restent des limites de temps réel.
Les restrictions/background freeze des navigateurs ne sont pas contournées.

Le SDK 0.2.0 préparé doit répondre aux PING dès initialized, avant ready. Son ancien
contrôle d'état les refusait. La correction est faite dans son repository séparé,
sans copie SDK ici, sans nouvel événement et sans publication. START/STOP restent
refusés avant ready. Bridge protocolVersion et integrationVersion restent **1**.
Un ancien tarball 0.2.0 construit avant ce correctif doit être reconstruit ; aucune
version publique ni tag existant n'est remplacé.

Une progression de chargement pourra ultérieurement être un message télémétrique
optionnel dédié, validé/borné et ignoré par les anciens hosts, sans changer les
messages existants. Elle ne devra pas être requise pour le handshake, ni contenir
des champs libres secrets, ni prolonger automatiquement les budgets. Le protocole
actuel ne définit pas de message de progression.

## Parties longues et assets chargés tardivement

`expiresAt` décrit le **bail d'accès aux artefacts**, pas la durée de la partie
multijoueur. Le portail renouvelle ce bail de 30 minutes toutes les 5 minutes,
en loading comme en running, avec la capability de contrôle conservée hors iframe.
Le SDK ne possède jamais ce contrôle et un PONG ne constitue pas un renouvellement.
L'API/RPC retourne une nouvelle échéance ; le contrôleur et le bridge mettent leur
échéance locale à jour sans recharger le jeu. La version et ses objets R2 restent
immuables. Un asset lazy-loaded après 45 minutes passe par le même gateway et reste
accessible si le bail est entretenu. Published et preview suivent la même politique.

Il existe un plafond absolu de **24 heures depuis la création**, imposé en DB,
non repoussé par les renouvellements. Il évite une capability infinie. Ce plafond
de sécurité appartient à la plateforme, pas au manifest. Une exécution au-delà
nécessite un nouveau lancement et une stratégie de sauvegarde/reprise du jeu ; le
runtime ne promet pas une iframe éternelle. Pour un MMO, la session gameplay et sa
persistance doivent rester indépendantes de ce bail navigateur.

Le RPC sérialise renouvellement/révocation par verrou de ligne, revalide la version
publiée ou les permissions preview actuelles, refuse toute résurrection et n'étend
pas au-delà du plafond. La création conserve un bail initial de 30 minutes maximum.
Les droits sont également vérifiés à chaque requête d'asset. Un retrait de droit ou
une révocation interdit immédiatement les nouveaux assets ; l'UI le constate au
renouvellement suivant au plus tard si le navigateur exécute normalement ses timers.

Le renouvellement a un budget HTTP de 15 s et un seul appel en cours. Une panne
transitoire provoque un retry après 30 s ; l'échéance existante n'est jamais prolongée
localement sans réponse serveur valide. Une réponse fatale ou l'expiration démonte
le jeu. Une réponse tardive d'un ancien montage ne peut réactiver sa génération.
Au retour visible, le portail vérifie son échéance et tente un renouvellement.
Une page gelée/déchargée au-delà du bail expire proprement : aucun timer navigateur
ne peut garantir son maintien pendant une suspension arbitraire.

Sans portail actif, sans renouvellement ou après teardown, les assets finissent
donc par être refusés. DELETE reste best-effort, expiration et cleanup couvrent les
fermetures brutales. La preview top-level historique avec cookie 15 min reste une
primitive distincte ; les previews du GameRuntime utilisent ce même bail renouvelable.

## Iframe et fonctionnalités navigateur

Profil versionné issu de la policy de livraison approuvée (`web-v1`,
`web-isolated-v1`, `web-legacy-v1`), jamais un sandbox arbitraire du manifest.

Sandbox : `allow-scripts allow-same-origin allow-pointer-lock`.
allow-same-origin est volontaire : sinon origin devient null, stockage/Workers
peuvent casser et on perd le ciblage postMessage exact. Il est acceptable ici
seulement avec une origine dédiée par lancement, hors origine du parent et avec
autorisation indépendante des cookies. Le jeu ne peut pas retirer le sandbox cross-origin.

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
le bail serveur ni ne représente une autorité de score. Erreurs du jeu affichées
par une formulation fixe ; aucun HTML/message libre injecté dans le portail.
Teardown : abort HTTP, retrait iframe, timers et listeners, révocation best-effort.
Un timeout ou retry détruit le montage précédent. Retry crée toujours une nouvelle
launch session, une nouvelle origine, une nouvelle génération et un nouveau document.
Les messages source/origin/generation précédents restent invalides.
Le parent doit démonter/recréer le runtime quand le compte ou la session online
change ; le player ne lit pas lui-même AuthProvider. Cette intégration reste à
brancher lors de PONG-MIGRATION. Un lancement local anonyme n'en dépend pas.

## SDK séparé et moteurs

Voir la [spécification du bridge](sdk-browser-bridge-v1.md). Le SDK est distribué
séparément ; le jeu fixture simule le protocole sans embarquer un second SDK.
L’intégration navigateur utilise les primitives JS publiques. Un export Unity,
Godot ou Construct doit les relier à son propre moteur.
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
le refus gateway de leurs requêtes est couvert par les tests artifact.

`20261017000100_game_launch_sessions.sql` définit les launches ;
`20261017000200_game_launch_renewals.sql` définit le plafond absolu et la RPC privée
de renouvellement. Le harness PostgreSQL les applique sur un cluster jetable local.

## Intégration d’un jeu distribué

Le build Web utilise le SDK public et le serveur gameplay est déployé séparément.
La plateforme fournit au START un contexte limité, sans JWT Supabase ni réservation
interne. Les salons public/privé restent dans le control plane.

Avant publication, vérifier le domaine, TLS, les buckets et les policies réseau,
valider le build en draft, puis tester sa preview et ses modes disponibles.
La revue humaine porte sur la version immuable exacte ; tester aussi résultats,
replay, longues sessions et rollback. Aucun import de code jeu n’est nécessaire
pour ajouter une version au portail.

## Recette navigateur et PostgreSQL

`npm test` inclut les tests runtime purs. Exécuter séparément
`npm run test:game-runtime-browser` et `npm run test:game-runtime-db` pour les
scénarios navigateur et PostgreSQL. Le navigateur utilise Chrome installé ;
`RUNTIME_BROWSER_CHANNEL` sélectionne un autre channel disponible.

## Couverture de compatibilité

Les tests runtime/API/compatibilité couvrent les longues durées avec une horloge
simulée, les budgets READY et le renouvellement. PostgreSQL jetable vérifie les
droits RPC, la limite absolue, l’expiration, les permissions preview et la course
renouvellement/révocation. Les tests consommateurs externes nécessitent leurs
fixtures SDK ; leur absence ne vaut pas validation de compatibilité.

Les fixtures simulent un chargement applicatif long, pas plusieurs Gio réels.
Le R2 et l'API backend du test navigateur sont simulés ; les vrais exports
Unity/Godot, Safari/Firefox, les appareils physiques et les interruptions réseau
prolongées nécessitent toujours des recettes dédiées. Les tests unitaires couvrent
la panne transitoire de renouvellement, son timeout, la réponse tardive, une mauvaise
génération et le teardown. Aucun résultat ne promet une session infinie ou maintenue
pendant une suspension arbitraire du navigateur.

## ONLINE-SESSION-1

Le runtime négocie Bridge v1/v2 au premier HELLO. v1/SDK 0.2.0 conserve son START
sans payload supplémentaire. v2/SDK 0.3.0 ajoute un contexte START local/online.
INIT reste sans ticket ; READY déclenche la résolution backend d'un ticket frais.
Le provider START est single-flight, borné, et invalidé au teardown. STOP/START
reprend le même contexte ; aucune réadmission automatique après un changement de
visibilité. Les phases de chargement et le renouvellement des artefacts restent
indépendants de l'admission gameplay et de sa durée de trois minutes.

Voir `online-sessions.md` et `sdk-browser-bridge-v2.md` pour les ressources,
l'exchange serveur-à-serveur, les permissions, le retry borné et PONG-MIGRATION.


## MULTIPLAYER-SESSION-1

Le lobby durable fige gameVersionId dès sa création. Son START transactionnel
crée une nouvelle online session et les participants opaques, sans ticket.
Le runtime reçoit seulement cette version et `onlineSessionReference` ;
OnlineLaunchAuthorizer vérifie le membre authentifié. Le ticket gameplay frais
reste généré au START v2 après READY. Les transports public/privé, le polling du
salon et le gameplay restent indépendants. Voir [multiplayer-sessions.md](multiplayer-sessions.md).

## Disponibilité des modes distribués

Les capabilities décrivent le build, pas l’état de l’infrastructure. Le local
reste disponible si la version active le supporte. Pour chaque accès online,
la fiche vérifie le droit publié via distribution_multiplayer_access, puis
un déploiement actif de game_server_deployments associé à cette version exacte
dans game_server_deployment_versions. Le premier déploiement est choisi selon
created_at/id, comme au START, et son endpoint est validé par gameplayEndpoint.
Aucun endpoint ni credential serveur n’est envoyé à la fiche. Cette disponibilité
est déclarative : elle utilise le statut du control plane, sans sonde réseau.

Sans déploiement utilisable, les contrôles online sont désactivés et les pages
online ne sont pas ouvertes. La création de lobby vérifie à nouveau cette
disponibilité côté serveur après sa limitation de débit. Le START transactionnel
conserve son contrôle de déploiement, notamment en cas de désactivation ultérieure.
Une erreur de lecture désactive les modes online sans retirer l’accès local.

Le lecteur utilise la largeur du conteneur de page et une hauteur liée au viewport.
`GamePlayerShell` fournit la surface commune aux iframes legacy et à GameRuntime.
Son dock appartient au portail : logo, réactions, favoris, audio, toggle plein
écran et sortie. Il occupe une ligne de layout sous la surface, sans overlay ni
recouvrement des pixels de l’iframe. En plein écran, le dock est masqué et la
surface de jeu remplit l’écran. Une bordure et une
ombre légères séparent le player du site. Les composants de réactions/favoris existants sont réutilisés en
version compacte pour les jeux publiés et vérifient l’authentification.
Le jeu conserve ses propres contrôles.

Le bouton audio est désactivé avant lancement, avec « Disponible pendant la partie ».
Après lancement, il devient actif seulement si le jeu s’abonne au contrat audio SDK.
Sans support détecté, il indique « Ce jeu ne prend pas en charge le contrôle audio ».
La préférence reste gérée par le portail ; le jeu l’applique à ses sources sonores,
sans accès du parent au DOM cross-origin. Voir [le contrat audio](audio-and-developer-submissions.md).
Chargement, erreurs et retry restent des overlays
temporaires, sans statut permanent pendant la partie.

## Fiche orientée player

La fiche `/games/[slug]` affiche titre, développeur et catégories, puis le player.
Description, informations, statistiques et avis suivent le jeu. Les cartes du
catalogue continuent de mener à cette fiche.

`GameLauncher` est l’écran initial commun : cover du catalogue et titre, puis les
actions utiles, sans description longue. Si la cover manque ou échoue, un visuel
de remplacement reprend l’initiale du titre. Aucun logo dédié n’est exigé.

`ArtifactGamePlayer` combine capabilities et availability. Tous les modes déclarés
apparaissent sur le launcher, avec les modes indisponibles désactivés. Aucun mode
ne se lance automatiquement, même lorsque le local est le seul disponible.
Le clic local monte GameRuntime dans cette même surface. L’online ouvre le lobby
durable intégré, avec l’authentification existante, sans navigation vers une autre
page. Choisir le mode ne crée pas de lobby ni de session : leurs actions explicites
restent nécessaires. Après START, le runtime utilise la version et la session
figées par le lobby. Quitter passe par la mutation leave existante, démonte le
runtime et restaure le launcher initial avec le même titre, la même cover et les
mêmes actions. Aucune interface distincte de fermeture n’est affichée.

GameRuntime peut être affiché seul ou intégré dans le shell d’une fiche. Le
contrôleur, les budgets, la génération, la validation du descriptor et le bridge
restent identiques. Le shell ne transporte aucune donnée d’admission.

`GameViewport` commence sur le même launcher, avec une seule action « Jouer ».
L’iframe legacy n’est créée qu’au clic, sans descriptor, sans bridge artificiel et
sans accès au DOM cross-origin. Les permissions sont définies par la politique
du portail, séparément du moteur artifact. Quitter démonte l’iframe et revient
au launcher, sans écran intermédiaire ni bouton de relecture distinct.

Le flux UI est launcher → lancement → jeu → launcher. Les erreurs utilisent la
surface commune avec Réessayer et, pour les parcours intégrés, Retour au launcher.
Chaque nouveau lancement repart avec une iframe et un launch neufs ; les leases,
générations et nettoyages restent gérés par le moteur. Le contrôle audio reste
désactivé sans adaptateur réel, pour les deux moteurs.

## Isolation des contenus HTML5

Les URL legacy sont absolues et HTTPS, sans identifiants intégrés. Les protocoles
actifs, chemins relatifs et adresses IP sont refusés. HTTP sur loopback reste
réservé à un portail lui-même exécuté sur loopback pour le développement local.

Un legacy situé sur un site distinct conserve son origine et son stockage propre.
Un legacy du même site que le portail reçoit une origine opaque : il ne peut pas
accéder au DOM, aux cookies ou au stockage du portail. Si ce jeu dépend de son
stockage d'origine, son hébergement doit migrer vers un site dédié ; ajouter
`allow-same-origin` sur le portail n'est pas une solution.

La sandbox autorise les scripts et le pointer lock. Elle ne permet ni navigation
du parent, ni popup, ni téléchargement, ni soumission de formulaire. Les droits
caméra, microphone, géolocalisation, presse-papiers, paiement et USB sont refusés.
Le plein écran est piloté par le shell, pas par le document du jeu. Aucun referrer
du portail n'est transmis. Les pages du portail restent non intégrables grâce aux
en-têtes `frame-ancestors 'none'` et `X-Frame-Options: DENY`, y compris lors d'une
navigation de l'iframe tierce vers le portail.

Les artifacts gardent leurs origines de lancement distinctes et leurs politiques
CSP propres. Le bridge vérifie la fenêtre source, l'origine exacte, le document,
le protocole, le launch et la génération. Le jeton de contrôle reste dans le
portail. Une nouvelle capacité navigateur nécessite une politique hôte explicite
et des tests ; un manifeste ou un message ne peut pas ajouter des permissions.

Les jeux tiers peuvent toujours contacter leurs propres services et effectuer
des navigations internes dans leur frame. Leur contenu, leurs traceurs et leurs
redirections ne sont pas contrôlés par le portail. Les URL DNS privées et les
changements de résolution ne constituent pas une liste réseau filtrée.

Une application WebView doit conserver cette séparation d'origines, vérifier
chaque navigation et refuser les schémas externes non approuvés. Aucun bridge
natif privilégié ne doit être exposé aux frames de jeux. Les permissions natives,
le stockage et le plein écran nécessitent des tests Android et iOS dédiés.
