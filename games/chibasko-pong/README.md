# Chibasko Pong

Un duel Pong 1v1 de Chibasko Games. **Non publié**, disponible pour recette locale.

- client/PongGame.tsx : module lazy/mémoïsé utilisant la façade Internal Game SDK v0.
- client/PongCanvas.tsx : terrain responsive, score, avatars, clavier et tactile.
- client/pongPresentation.ts : abonnement SDK unique, HUD sélectif et frames publiques.
- client/pongRenderer.ts : canvas natif, terrain cyan/ambre, interpolation visuelle bornée.
- client/pongControls.ts : uniquement des directions, neutralisation de tous les inputs.
- client/pong.module.css : apparition légère, désactivée avec reduced-motion.
- client/pongView.ts : projection publique, sans Auth ni configuration serveur.
- Serveur : game-server/src/games/chibasko-pong/ (Room, State, simulation, registration).

Règles inchangées : 2 joueurs, terrain 1000 × 600, 30 ticks/s, premier à 5,
countdown 3 s, pause point 1 s, abandon, résultats et retour salle d'attente.
Input exclusif au module : set_input { direction: -1 | 0 | 1 }.
La plateforme conserve les connexions ; ce module ne décide pas des admissions.

Voir docs/internal-multiplayer-games.md pour le contrat et l'ajout d'un autre jeu.

## Règles et contrôles

Protège ton côté avec ta raquette : le premier à 5 points gagne.
Sur ordinateur, clique sur le terrain ou utilise Tab pour lui donner le focus.
↑ / W monte ; ↓ / S descend. Les touches de jeu empêchent le scroll uniquement
dans les contrôles actifs. Les boutons Monter / Descendre fonctionnent avec un
doigt, une souris ou Espace/Entrée au clavier. Aucun déplacement absolu n'est envoyé.

Relâchement, pointercancel, sortie du bouton, perte de capture/focus, onglet masqué
et démontage neutralisent les inputs. Aucun contrôle ne garde une direction bloquée.
Le canvas garde son ratio 5:3 en portrait/paysage ; l'orientation n'est pas imposée.
Le score, les pseudos, les instructions et le statut sont accessibles hors canvas.

## Architecture et lifecycle

Le serveur reste autoritaire sur positions, phases et scores. Countdown 3/2/1 vient
de remainingMs ; GO est une indication visuelle après la phase PLAYING serveur.
Le nom du marqueur vient du changement de score reçu, sans calcul de point client.
Une interpolation de 50 ms maximum entre deux positions reçues adoucit le canvas :
aucune prédiction ni extrapolation. Un reset/point/changement de phase est immédiat.
Reduced-motion désactive interpolation et animations décoratives. Aucun son ajouté.

La façade SDK expose état/révision/abonnement/send et identifiant local seulement.
React observe les changements du HUD, pas chaque position de balle. Le canvas utilise
requestAnimationFrame et annule sa boucle au démontage. Aucun ajout au SDK v0.

Plateforme : WAITING → STARTING → PLAYING → RESULTS → WAITING.
Jeu : READY → COUNTDOWN → PLAYING ↔ POINT_PAUSE → FINISHED.
Premier à 5 ou abandon : résultat serveur, victoire/défaite et score génériques.
L'hôte revient à la salle d'attente ; tous doivent être prêts avant une nouvelle partie.
Les scores restent en mémoire, sans classement ni sauvegarde.

## Future fiche catalogue (à saisir séparément dans l'admin)

- Titre : Chibasko Pong ; slug : chibasko-pong.
- Type : Multijoueur Chibasko Games ; gameId : chibasko-pong ; capacité : 2 joueurs.
- Bêta : oui ; **Publié : non** ; aucune URL iframe.
- Catégories existantes pertinentes : Arcade, Sport.
- Description : « Affronte un autre joueur dans Chibasko Pong, un duel rapide sur
  Chibasko Games. Protège ton côté, renvoie la balle et sois le premier à marquer
  5 points. Joue au clavier ou avec les commandes tactiles. »

Miniature recommandée : 1280 × 720, WebP, terrain sombre, raquettes cyan/ambre et
balle blanche très contrastée. Garder l'action au centre pour le recadrage object-cover
des GameCard (hauteur 160 px). Titre court Chibasko Pong dans la zone centrale, sans
petit texte, HUD minuscule ou badges intégrés. Aucun fichier image généré/uploadé ici.

La future Bêta publique nécessitera une décision explicite, un game-server public
validé et is_published=true + is_beta=true. Cette phase ne change aucune donnée DB,
configuration production, disponibilité serveur ou publication.
