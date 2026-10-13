# Chibasko Pong

Module interne de Chibasko Games, non publié.

- client/PongGame.tsx : adaptation de l'état public et inputs.
- client/PongCanvas.tsx : canvas et clavier (nettoyage au démontage).
- client/pongView.ts : projection publique, sans Auth ni configuration serveur.
- Serveur : game-server/src/games/chibasko-pong/ (Room, State, simulation, registration).

Règles inchangées : 2 joueurs, terrain 1000 × 600, 30 ticks/s, premier à 5,
countdown 3 s, pause point 1 s, abandon, résultats et retour salle d'attente.
Input exclusif au module : set_input { direction: -1 | 0 | 1 }.
La plateforme conserve les connexions ; ce module ne décide pas des admissions.

Voir docs/internal-multiplayer-games.md pour le contrat et l'ajout d'un autre jeu.
