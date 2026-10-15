# Modules multijoueurs Chibasko Games

La plateforme possède catalogue, Auth, salons, orchestration, connexions et
navigation. Un jeu possède règles, état métier, rendu, inputs et résultat.

Client : GameRuntime → registre lazy → module dépendant de @chibaskogames/sdk/client
(ou /react). La plateforme transmet une façade de session sans Room/Auth brute.

Serveur : GameRegistry + registerInternalGames → adaptateur Colyseus privé →
driver GameServerModule dépendant de @chibaskogames/sdk/server.
L'admission reste dans GameAdmission et le cycle dans GameSessionCoordinator.

Pong est installé explicitement. Aucun auto-discovery ni import conditionnel de
Pong dans LobbyExperience/MultiplayerProvider/coordinator. Le module factice
n'est installé que par les tests.

Lifecycle plateforme : WAITING → STARTING → PLAYING → RESULTS → WAITING.
Les phases internes du jeu sont indépendantes.

Pour les étapes d'ajout, capacités, résultats, frontières et futurs adaptateurs,
voir [SDK commun](game-sdk.md).
