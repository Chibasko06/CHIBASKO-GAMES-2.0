# Accès online : salons publics et privés

La plateforme possède la visibilité et le directory, jamais le gameplay.
Les deux accès utilisent la même LobbyRoom, la même admission authentifiée et
la même GameRoom. Aucun changement de visibilité après création.

## Parcours produit

- `/games/[slug]/online` : liste de salons publics et création publique.
- `/games/[slug]/private` : création privée et join par code.
- `/games/[slug]/local` : runtime local existant, sans Auth ni réseau de jeu.
- `/games/[slug]/lobby/[code]` : salle existante, join explicite sur lien direct.

Les deux premières routes exigent un compte et conservent leur destination dans
le retour login sécurisé. Les actions de la fiche viennent uniquement des
capabilities du manifeste généré. Routes online/private/lobby non indexables.
Les codes de lobby restent filtrés par SiteAnalytics ; aucune nouvelle telemetry.

## Protocole plateforme

Création HTTP : `{ gameId, visibility: "public" | "private" }`.
Le serveur exige explicitement la visibilité et valide les capacités du jeu
installé/activé. Les helpers existants utilisent private par défaut pour les
anciens points d'entrée, mais transmettent toujours ce champ au serveur.
Join par code : `{ expectedGameId }`, public ou privé. Join depuis la liste :
`{ expectedGameId, publicOnly: true }`, avec revérification serveur de la visibilité.
Même réservation individuelle et admission que précédemment, sans JWT dans WSS.

`GET /lobbies/public?gameId=...` exige Authorization Bearer, Origin autorisée et
jeu activé supportant public. Réponse `Cache-Control: no-store` :

```json
{"lobbies":[{"code":"ABCDEF","gameId":"example-game","host":{"username":"Alice","avatarUrl":null},"currentPlayers":1,"maxPlayers":2}]}
```

Pas d'UUID Auth, roster, email, IP, réservation, sessionId, timestamp ou état de jeu.
Au plus 50 lignes, sans historique. Le client projette aussi les champs permis.
Limite de listing : 30 requêtes/minute/IP fiable (quota distinct du resolver
10/minute). Les quotas création et matchmaking existants restent en place :
10 créations/minute/IP en production, 60 matchmaking/minute/IP en production,
au plus 3 lobbies créés actifs par compte. Origin/OPTIONS couvrent réellement
ces routes avant le traitement Colyseus, y compris GET avec Authorization.

## Directory en mémoire

Snapshots copiés, sans références Room. Seuls les salons publics WAITING avec
un hôte admis, au moins un joueur et une place libre sont visibles. Les sièges
réservés comptent également : une réservation peut rendre une ligne indisponible
avant la prochaine admission. Les requêtes de liste revérifient la Room réelle.

Mise à jour aux admissions/départs/transitions et au patch existant (50 ms),
notamment pour les réservations non consommées/expirées. Suppression à fermeture,
destruction et shutdown ; les snapshots expirent avec les sessions de leurs
membres. Nouveau host = identité publique issue de l'admission validée.

STARTING, PLAYING, RESULTS et CLOSED ne sont jamais listés. Après RESULTS, seul
le retour explicite de l'hôte en WAITING peut rendre le salon visible à nouveau,
s'il reste un joueur et une place. Ready est remis à false comme précédemment.
Un salon plein en WAITING reste absent. Les joueurs présents ne sont pas déplacés.

Le navigateur charge au montage puis sur **Actualiser** ; aucun polling, timer
de listing ou WebSocket dédié. Requêtes annulées à un nouveau chargement,
changement de compte et démontage ; délai maximal 10 s, session fraîche.
Un clic périmé ne garantit aucune place : admission atomique Colyseus,
message « Ce salon n’est plus disponible. », puis actualisation possible.

## Recette manuelle locale (à effectuer avec deux vrais comptes)

1. Démarrer frontend et game-server locaux. Utiliser une fiche de recette déjà
   accessible et publiée dans un **catalogue de développement**. Ne pas publier
   Chibasko Pong en production pour effectuer cette recette.
2. A → fiche → Jouer en ligne → Créer un salon public.
3. B → même fiche → Jouer en ligne → Actualiser → salon de A → Rejoindre.
4. Deux prêts → host lance → jouer → résultats → retour salle → nouvelle partie.
5. Quitter les deux, puis A → Partie privée → Créer une partie privée.
6. B vérifie que ce salon est absent de Jouer en ligne, puis Partie privée →
   saisir le code → Rejoindre. Deux prêts → lancer et jouer.
7. Vérifier lien direct explicite, host transfer, liste périmée, serveur arrêté,
   session expirée, retour login, et mode local anonyme indépendant.

Si aucune fiche de développement n'existe, `/lobby-playground` reste privé et
DEV ONLY pour la recette de jeu ; les tests réseau automatisés exercent aussi
la création publique, le listing et son admission avec des identités de fixture.
Ils ne remplacent pas une recette navigateur avec comptes réels.

## Limites

Directory éphémère et mono-processus. Un redémarrage détruit les salons. Une
future architecture multi-instance demandera un directory distribué ; aucun
Redis ni stockage PostgreSQL ajouté. Pas de matchmaking automatique, invitations
nominatives ou admission automatique. Le SDK gameplay et Pong ne connaissent pas
la visibilité. Le jeu technique reste non publié, désactivé par défaut en production.

## Fichiers concernés par ONLINE-ACCESS-1

Produit :
`app/games/[slug]/online/page.tsx`, `app/games/[slug]/private/page.tsx`,
`components/multiplayer/PublicLobbyBrowser.tsx`,
`components/multiplayer/MultiplayerGamePanel.tsx`,
`components/multiplayer/MultiplayerEntry.tsx`,
`components/multiplayer/LobbyExperience.tsx`, `lib/server/onlineGamePage.ts`,
`lib/multiplayer/publicLobbies.ts`, `lib/multiplayer/productSession.ts`,
`lib/multiplayer/gameLaunchOptions.ts`, `lib/multiplayer/gameManifest.generated.json`,
`lib/lobbyConnection.ts`, `lib/gameConnection.ts`.

Serveur :
`game-server/src/lobby/PublicLobbyDirectory.ts`,
`game-server/src/lobby/resolveLobby.ts`, `game-server/src/rooms/LobbyRoom.ts`,
`game-server/src/schema/LobbyState.ts`, `game-server/src/index.ts`,
`game-server/src/runtime/requestPolicy.ts`, `game-server/src/games/types.ts`,
`game-server/src/games/chibasko-pong/definition.ts` (capacités seulement).

Tests :
`game-server/tests/public-lobbies.test.ts`, `game-server/tests/game-registry.test.ts`,
`game-server/tests/lobby-game-bridge.test.ts`, `game-server/tests/lobby.test.ts`,
`game-server/tests/pong-network.test.ts`, `game-server/tests/production.test.ts`,
`tests/game-catalogue.test.mjs`, `tests/lobby-connection.test.mjs`,
`tests/multiplayer-product.test.mjs`, `tests/product-register.mjs`,
`tests/product-session.test.mjs`.

Documentation : ce fichier, `docs/game-sdk.md`,
`docs/internal-multiplayer-games.md` et `game-server/README.md`.
