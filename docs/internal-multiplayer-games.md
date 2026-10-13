# Jeux multijoueurs internes Chibasko Games

Un dépôt, deux responsabilités. La plateforme possède catalogue/Auth, connexions,
admissions, salle d'attente, transitions et résultats. Chaque jeu possède ses
inputs, simulation serveur, état public, projection/rendu client et listeners.
Pas de workspace, discovery de fichiers, serveur externe ou SDK tiers.

## Client

`games/clientRegistry.ts` associe explicitement gameId à un import dynamique littéral.
Il n'importe aucun serveur, secret, endpoint ou capacité autoritaire.
`GameRuntime` résout un module via React.lazy/Suspense, avec fallback et frontière
d'erreur génériques. Les imports ne démarrent que lorsque le jeu est rendu.
La partie active est entièrement cliente ; aucune connexion n'est sérialisée par SSR.

Un module exporte `gameId` et son composant par défaut, recevant uniquement une
`GameClientConnection` : état public unknown, révision/subscribe, identifiant local
temporaire et send(type,payload). Pas d'Auth, JWT, URL, catalogue ou leave.
Le module interprète lui-même l'état et les messages de son jeu.
L'identifiant local ne doit pas être rendu dans l'UI.
Le contrat est formalisé dans `games/sdk/client/types.ts`. Les jeux utilisent
`useChibaskoGame(connection)` pour lire l'état et suivre ses révisions ; aucun
accès au provider plateforme n'est nécessaire.

La plateforme possède la Room et invalide la façade avant sa fermeture. Un ancien
module ne peut donc envoyer un message à une nouvelle partie. Le module retire ses
listeners à son démontage et peut envoyer son input neutre ; il ne ferme pas la Room.
`PongGame` projette l'état public, `PongCanvas` gère rendu/clavier ; la physique reste
exclusivement dans game-server/src/games/chibasko-pong/simulation.ts.

## Serveur

`GameDefinition` reste id/roomType/minPlayers/maxPlayers. `games/registry.ts` est
pur et autoritaire ; le manifeste généré n'expose que gameId et min/max.
`registerInternalGames` appelle les registrations explicites des jeux. Chaque
registration connaît sa factory Room et ses hooks locaux (exemple registerPong).
Le point d'entrée ne connaît aucune classe de jeu.
La disponibilité reste contrôlée par ENABLED_GAME_IDS, vide par défaut en production.

Une GameRoom implémente activation, départ, admission privée et nettoyage via le
contexte SDK fourni par sa registration. Elle appelle `platform.complete` côté serveur ;
aucun message client ne peut déclarer un résultat. Le coordinateur vérifie source,
participants et unicité de complétion, sans reconnaître de gameId particulier.
Seul l'adaptateur plateforme du SDK connaît GameAdmission/coordinator ; le jeu
reçoit des identités publiques gelées sans expiration ni authData. Voir
[Internal Game SDK v0](internal-game-sdk.md) pour les APIs et hooks nécessaires.

## Lifecycle et résultats

Plateforme : WAITING → STARTING → PLAYING → RESULTS → WAITING.
Pong : READY → COUNTDOWN → PLAYING ↔ POINT_PAUSE → FINISHED.
L'enveloppe GameRoom status READY signifie admission/activation effectuée ; sa
phase métier appartient au jeu et n'est pas interprétée par la plateforme.

`GameResult` : gameId, winnerUserId nullable, reason (clé courte), participants avec
score numérique **facultatif**. Un jeu peut terminer sans score ou sans gagnant.
Les nombres doivent être finis ; la signification/règle appartient au jeu.
La projection lobby utilise hasScore pour distinguer absence et zéro ; les noms
viennent de l'identité serveur. Les détails privés ne passent jamais dans RESULTS.
Le rendu générique affiche gagnant/score seulement s'ils existent. Un futur rendu
de résultat propre à un jeu pourra être ajouté au contrat module, sans physique
dans le lobby ; aucun système de résultats universel n'est implémenté maintenant.

## Ajouter un jeu

1. Créer game-server/src/games/<id>/ : Room, State, logique et registration.
2. Ajouter sa GameDefinition dans le registre pur, puis sa registration explicite.
3. Créer games/<id>/client/ : composant, projection de l'état et inputs du jeu.
4. Ajouter uniquement son loader dans games/clientRegistry.ts.
5. `npm run generate:game-manifest`, puis `npm run check:game-manifest`.
6. Ajouter ses tests unitaires/réseau et exécuter les régressions/builds.
7. Créer une fiche **non publiée** via admin, liée par multiplayer_game_id.
8. Après recette séparée, décider explicitement disponibilité serveur/publication.

Pas de modification de LobbyRoom, MultiplayerProvider, productSession ou
GameSessionCoordinator pour ajouter des règles ou inputs du nouveau jeu.
La DB conserve titre, slug, miniature, description, catégories et visibilité.
Ne jamais y stocker chemin de module, import JS, classe, roomType ou URL de serveur
arbitraire. Le navigateur demande un identifiant, il ne choisit pas la technologie.

Chibasko Pong reste non publié ; cette phase ne déploie et ne change aucun gameplay.
Les modules factices test-game existent uniquement dans les tests injectés.
