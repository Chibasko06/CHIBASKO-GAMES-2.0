# SDK commun Chibasko Games — intégration 1

Un seul contrat pour les jeux officiels et les futurs jeux tiers. Le package
privé `@chibaskogames/sdk` n'est pas publié sur npm. Sa source vit dans le dépôt
[Chibasko06/chibasko-games-sdk](https://github.com/Chibasko06/chibasko-games-sdk),
version `v0.1.0`, commit `7bc73cc335e7dbd52b411a751fcc689969c5a5d4`.
Les anciens dossiers
games/sdk et game-server/src/games/sdk sont supprimés, pas maintenus en parallèle.

## Installation et builds

La racine et game-server déclarent exactement
`git+https://github.com/Chibasko06/chibasko-games-sdk.git#v0.1.0`.
Les deux lockfiles figent le SHA indiqué ci-dessus. npm normalise leur URL résolue
en `git+ssh://git@github.com/Chibasko06/chibasko-games-sdk.git#<SHA>`.
L'installation nécessite donc un accès Git au dépôt privé avant `npm ci`.
Aucun credential n'est enregistré dans les manifests ou lockfiles.

Le SDK expérimental reste en version 0.1.0, avec integrationVersion 1 inchangée.
Son script prepare produit le build lors de l'installation Git. Le nom historique
`npm run build:sdk` est conservé : il vérifie seulement les exports compilés,
leur version et la résolution Git, sans compiler de source SDK dans la plateforme.
Les mêmes contrôles sont utilisés par le game-server avec --server.
Root/client/server n'importent pas React au runtime ; la préparation Git du SDK
installe temporairement ses outils de développement, dont React et ses types.

`npm run test:sdk` teste l'intégration plateforme. Les unit tests et le build source
du SDK appartiennent à son repository. `npm run test:sdk-extraction` teste hors du
repository la distribution installée, ses types et une copie autonome de Pong.
`npm run test:sdk-platform` vérifie les consommateurs et builds sur le SDK Git,
avec toute éventuelle ancienne implémentation locale temporairement indisponible.

Le [README du SDK](https://github.com/Chibasko06/chibasko-games-sdk/tree/v0.1.0)
documente son API ; la [bascule SDK Git](./sdk-extraction.md) décrit les consommateurs,
les scripts et le prérequis d'authentification Cloudflare/CI avant déploiement.

Next ne transpile plus spécialement le SDK précompilé ; seul Pong demeure local.
Sous Windows, le cache de build
Webpack est désactivé à cause du bug de snapshot des liens absolus npm
([webpack #21636](https://github.com/webpack/webpack/issues/21636)). Turbopack
reste disponible ; aucun cache runtime/Cloudflare n'est désactivé. Ce contournement
pourra disparaître quand le Webpack embarqué dans Next intégrera la correction.

## Entrypoints

- root : defineGame, intégration 1, capacités, participants, session, résultat.
- /client : façade indépendante de React, état opaque/révision/abonnement/send.
- /react : useChibaskoGame(connection), props/modules React et registre lazy.
- /server : GameServerSession, GameServerModule et driver du jeu.

Root/client/server ne dépendent de React, Next, Node, Colyseus ou Supabase.
React est un peer facultatif, utilisé seulement par /react. Les exports du
package ferment les chemins internes ; les types ne sont pas une sandbox.

## Définition et installation

GameDefinition contient id, integrationVersion: 1 et des capabilities explicites.
Online contient access (public/private) et players (min/max). Local peut posséder
une capacité différente. Aucun mode n'est activé par défaut.

Pong déclare online/public et online/private (2–2), ainsi que local (2–2).
Public et privé sont des politiques d'accès au même gameplay online. Le directory
et sa liste sont une responsabilité plateforme, hors SDK gameplay.
Les capacités décrivent le jeu, pas son hébergeur. Pas de hosting, roomType, URL,
Room ou secret dans cette définition.

Le registre serveur reste l'autorité d'installation. serverGameRegistration
associe la définition à un roomType privé et dérive id/minPlayers/maxPlayers pour
le lobby/coordinator existants. Le manifeste projette gameId → capacités explicites
et minPlayers/maxPlayers online. Activation production et publication catalogue
restent deux contrôles distincts, inchangés.

## Participants et session

GameParticipant contient seulement participantId, username et avatarUrl.
L'adaptateur crée des UUID opaques par session, distincts du userId Supabase et
du sessionId Colyseus. Le descripteur de session reçoit aussi un ID distinct de la
transition interne. Le jeu ne choisit aucune de ces valeurs.

GameSessionSnapshot contient session, participants attendus, localParticipantIds,
connectedParticipantIds et availability (preparing/ready/completed).
localParticipantIds est un tableau pour permettre ultérieurement plusieurs
participants sur un appareil. L'adaptateur actuel fournit exactement un ID local.
localPlayerId reste un raccourci online vers le premier participant local.

## Client

Le jeu reçoit GameClientProps.connection. API : getState(), getSession(),
getRevision(), subscribe(fn) → unsubscribe et send(type, payload).
La révision avance aussi lors d'un changement d'enveloppe de session.
Après invalidation, état/session sont null, identité locale vide et send inactif.
La plateforme possède dispose/fermeture ; la façade ne les expose pas.
Le hook React est facultatif. Pong conserve sa projection optimisée du HUD et
sa lecture impérative des frames via cette même façade.

La plateforme ne lit plus players/expectedPlayers/status dans l'état métier.
Un message privé d'intégration transporte l'enveloppe, demandée après installation
des listeners pour éviter de perdre un message initial. Le décodeur vérifie
version, jeu, roster, IDs, champs autorisés et disponibilité. Le préfixe __sdk_
est réservé au transport et inaccessible aux messages métier des jeux.
La demande initiale est unique par connexion et expire après 10 secondes si
l'enveloppe n'arrive pas. Redémarrer frontend et game-server ensemble après ce
refactor ; les sessions v0 déjà ouvertes ne sont pas migrées à chaud.

## Serveur

Un module exporte GameServerModule<State> :
definition, tickRate, patchRateMs et create(GameServerSession).

La session expose :
- session et participants publics figés ;
- isParticipantActive(participantId) ;
- complete(GameResult): boolean (true une seule fois acceptée) ;
- fail().

Le driver expose state, participantJoined, participantLeft, receive, start,
tick(deltaMs) et dispose. receive reçoit un participant déjà vérifié et reply,
jamais un Client Colyseus. Le jeu valide ses inputs et décide ses règles/abandon.
La plateforme appelle start uniquement après les admissions effectives validées.
Le jeu nettoie ses inputs/ressources ; l'adaptateur possède les timers de transport.

L'adaptateur privé internalGameAdapter connaît GameAdmission, le coordinateur,
les snapshots Auth, expirations et sièges. colyseusGameAdapter connaît Room,
réservations, roomType/roomId/transitionId, callbacks et boucle de simulation.
Ces adaptateurs ne sont pas des APIs SDK et ne sont jamais importés par Pong.

## Résultats et sécurité

GameResult utilise gameId, winnerParticipantId nullable, reason et players avec
participantId et score numérique facultatif. Pas de completion client online.
L'adaptateur vérifie la structure, traduit uniquement les participants attendus
vers la projection privée du lobby et délègue au coordinateur le contrôle de
source/phase/roster/unicité. La projection userId de LobbyState reste privée à
l'intégration plateforme et ne constitue pas un deuxième contrat SDK.

JWT HTTP uniquement, aucune auth Supabase au jeu, aucun service_role serveur,
réservations privées, contrôles d'origine et quotas inchangés.
Les types/exports/tests d'import imposent une architecture ; ils n'isolent pas du
code malveillant exécuté dans la même origine ou le même processus.
Même SDK ne signifie donc pas même niveau de confiance dans les résultats.

## Ajouter un module

1. Créer sa définition SDK et son driver serveur dans son dossier de jeu.
2. Ajouter l'installation contrôlée dans GameRegistry et registerInternalGames.
3. Créer son client dépendant uniquement du SDK et de son propre code.
4. Ajouter le loader littéral dans games/clientRegistry.ts.
5. Générer/vérifier le manifeste, tester admissions/état/inputs/completion/replay.
6. Préparer la fiche via admin, sans importer de classe/chemin/endpoint en DB.
7. Publication/activation restent des décisions distinctes, hors de ce refactor.

Le module factice de tests démontre un état {question, answer}, sans players,
status ou expectedPlayers, et un résultat sans score/gagnant via le flow produit.

## Frontières et dettes explicites

npm run check:game-boundaries analyse les imports statiques/dynamiques littéraux.
Les jeux ne peuvent pas importer les autres jeux ou les internes plateforme.
Les imports calculés ne sont pas autorisés. SDK pur ne peut pas importer /react.
Pong est un package Git privé externe consommé par ses exports publics. React côté
client/local et @colyseus/schema côté serveur sont des dépendances génériques
explicites. Aucun Next/Tailwind/font loader de plateforme requis.
Voir [extractabilité de Pong](pong-extraction.md).

PongState conserve encore gameId/status/expectedPlayers pour compatibilité des
outils de debug/tests. Aucun fonctionnement produit ne dépend plus de ces champs.
La physique Pong vit dans `shared/` du dépôt privé `Chibasko06/Chibasko-Pong` : un seul moteur
pur est exécuté par le serveur online et le runtime local navigateur.

## Modules locaux

La définition possède explicitement capabilities.local.players seulement lorsque
le jeu fournit son implémentation locale. Aucun mode n'est activé par défaut.
Le manifeste public généré propage les capacités sans roomType ni détails privés.
Le registre client expose deux ensembles de loaders optionnels : online et local.
Les imports restent littéraux et lazy. Un jeu sans module local n'en charge aucun.

L'entrypoint React ajoute uniquement LocalGameProps { onExit() }, LocalGameModule
et LocalGameRegistry. Le jeu gère son runtime local, le parent gère la navigation.
Il ne reçoit aucune façade réseau fictive, aucun compte, ticket ou connexion.
Le contrat core/server reste inchangé. Les résultats locaux ne passent jamais
par la completion serveur et ne constituent pas des résultats online vérifiés.
La plateforme reste générique : capacités + loader → /games/[slug]/local.

Extension future : même contrat → adaptateur distant sécurisé et serveur tiers ;
même définition → runtime local (désormais utilisé par Pong). Aucun ticket tiers, réseau externe, sandbox,
bridge iframe, hébergement payant ou protocole de confiance n'est implémenté.
La completion synchrone actuelle pourra devenir une commande asynchrone versionnée
quand l'adaptateur distant sera réellement nécessaire.
