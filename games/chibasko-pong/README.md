# Chibasko Pong

Un duel Pong 1v1 de Chibasko Games. **Non publié**, disponible pour recette locale.

- client/PongGame.tsx : module lazy/mémoïsé utilisant le SDK commun @chibaskogames/sdk/client.
- client/PongCanvas.tsx : terrain responsive, score, avatars, clavier et tactile.
- client/pongPresentation.ts : abonnement SDK unique, HUD sélectif et frames publiques.
- client/pongRenderer.ts : canvas natif, terrain cyan/ambre, interpolation visuelle bornée.
- client/pongControls.ts : uniquement des directions, neutralisation de tous les inputs.
- client/pong.module.css : apparition légère, désactivée avec reduced-motion.
- client/pongView.ts : projection publique, sans Auth ni configuration serveur.
- shared/simulation.ts : unique moteur pur, constantes, modèle initial et pas fixe communs.
- local/localRuntime.ts : runtime hors réseau ; local/PongLocalGame.tsx : boucle navigateur et résultats locaux.
- server/ : driver SDK et PongState ; installation par l'adaptateur privé extérieur au jeu.

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
requestAnimationFrame et annule sa boucle au démontage. Le contrat réseau du SDK reste inchangé.

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

## Moteur partagé et partie locale

```
Chibasko Pong
├── shared/ : simulation déterministe, sans SDK/React/Node/Colyseus/API navigateur
├── online : serveur autoritaire → SDK → rendu interpolé
└── local : navigateur → même moteur → rendu direct, sans réseau
```

Le moteur reçoit explicitement les directions et le temps écoulé. La physique,
le service, le score et la victoire sont uniques. Les deux runtimes utilisent le
même accumulateur à 30 Hz, avec un delta borné à 250 ms. Les valeurs 1000×600,
3 secondes de countdown, 1 seconde de pause et victoire à 5 ne changent pas.
Seul le driver online possède admission, limitation d'inputs et abandon réseau.

Le package privé `@chibaskogames/chibasko-pong` expose /shared pour le moteur,
/client, /local et /server. Sa définition est dans definition.ts. Le SDK est un
peer fourni par l'hôte. Aucun package n'est publié. Conserver tout ce dossier
dans les releases actuelles avec game-server/ et packages/game-sdk/.

La définition déclare online/public et online/private (2 joueurs), et local/2. Le manifeste
généré expose ces capacités. La fiche propose « Jouer en local » seulement si
la capacité et le loader local existent. `/games/[slug]/local` utilise la même
lecture de catalogue publié que la fiche : une fiche absente/non publiée,
classique, inconnue ou sans capacité locale renvoie 404. Aucun login n'est requis.

Pour recetter sans publier Pong : `npm run dev`, puis `/lobby-playground` et
« Tester à deux sur cet appareil, sans compte ». Cet accès reste DEV ONLY ;
aucune fiche n'est créée pour le test. Le game-server peut rester arrêté.

Contrôles locaux : Joueur 1 Z/S (W également accepté pour QWERTY), Joueur 2 ↑/↓.
Les touches utilisent KeyboardEvent.key, normalisé en minuscules, pour suivre les
lettres du clavier. Z et W sont mémorisées séparément ; relâcher l'une ne neutralise
pas l'autre si elle est encore tenue. Les commandes online restent inchangées.
Cliquer le terrain ou utiliser Tab.
Chaque côté possède aussi deux boutons tactiles indépendants, compatibles multi-touch.
Relâchement, annulation, perte de capture, blur, onglet masqué et démontage
neutralisent les inputs. Les flèches ne bloquent le scroll que dans le jeu actif.
Un onglet masqué suspend la progression locale. « Rejouer » crée un modèle et un
accumulateur neufs ; « Quitter » démonte le jeu et retourne à la fiche (ou au test).

Le terrain garde sa définition logique 1000×600. Sa largeur visuelle respecte le
ratio 5:3 et le budget de hauteur réellement disponible (HUD, contexte de page,
contrôles et sortie inclus), recalculé par ResizeObserver, resize/scroll et
visualViewport. Aucun setState par frame pour le layout. Un fallback CSS 100dvh
couvre l'attente de mesure. À faible hauteur, gaps/HUD/textes sont plus compacts ;
les boutons tactiles restent au moins à 44 px (64 px en portrait tactile).
En paysage court, les mêmes quatre boutons se placent de part et d'autre du
terrain pour libérer sa hauteur, sans recouvrir l'aire de jeu.
Les safe areas sont conservées. Aucun changement de physique ou d'interpolation.

tests/pong-layout.test.mjs est une recette Chromium **isolée**, sans site, compte,
réseau ou game-server, facultative si Playwright est déjà installé. Exécution :
node --import ./tests/product-register.mjs --test tests/pong-layout.test.mjs.
PONG_LAYOUT_PLAYWRIGHT peut indiquer ce module déjà installé et PONG_LAYOUT_BROWSER
un navigateur existant. Aucune dépendance npm ajoutée. La fixture utilise les vrais
composants/CSS, vérifie 1366×768, 1440×900, 390×844, 768×1024 et 844×390 (online/local).
En paysage court elle place la zone de jeu en vue, comme lors d'un défilement.
Captures dans .next/pong-polish-qa/, jamais versionnées. Cela ne remplace pas une
recette sur appareil tactile réel (barres navigateur, safe areas et multi-touch).

Le mode local affiche Joueur 1/Joueur 2 : **aucun résultat vérifié, aucun envoi,
aucune persistance, aucune statistique compétitive**. Le jeu ne fabrique pas de
fausse session SDK réseau. Il réutilise le terrain, le HUD et GO ; le rendu local
n'interpole pas les positions. React ne suit que phase/countdown/score/vainqueur.

Validations ciblées : `npm run test:pong-local`, tests serveur pong.test.ts,
pong-local-parity.test.ts et pong-network.test.ts. La parité compare chaque champ
du modèle entre drivers sur deux parties complètes ; les tests physiques restent
ceux du moteur existant. Les imports shared sont contrôlés par les boundaries.

## Package autonome et extraction

Depuis ce dossier : `npm run build`, `npm run typecheck`, `npm test`.
Cibles distinctes : build:shared, build:server, build:client. Le SDK compilé et les
dépendances déclarées doivent être installés ; aucun build Next.js requis.
Les tests possèdent leur propre hôte React/jsdom et leur loader CSS Module.
Tests séparés : test:shared (sans SDK/schema/React), test:server (sans React),
test:client (hôte React minimal). Le test global inclut les trois familles.

Après copie hors du repository, avec Node 24 et un SDK compilé fourni localement :

```sh
npm install --no-save /chemin/vers/chibaskogames-sdk-0.0.0.tgz
npm run build
npm run typecheck
npm test
```

Le package ne contient aucun chemin relatif vers le SDK de la plateforme.
Exports publics : root (pongDefinition), /client et /local (default + gameId),
/server (pongServerModule, PongState), /shared (moteur pur).
L'hôte React doit supporter les CSS Modules ; le CSS est livré dans dist.
Le serveur n'utilise pas React. @colyseus/schema est sa seule dépendance de projection.

Styles, reset, palette et typographie sont intégralement locaux. Les avatars
utilisent un élément img standard, avec URL publique fournie par le SDK.
Aucun asset, font loader, variable CSS ou classe Tailwind privée du site.
La surface sombre du composant reste lisible même sur un hôte HTML clair.

À la racine : `npm run test:pong-extraction` copie réellement le package hors du
repository, le construit et teste avec le SDK et des dépendances génériques seuls.
Voir [audit, exports et préparation SDK](../../docs/pong-extraction.md).
La future distribution du SDK et le lockfile du futur repository restent à choisir.
Chibasko Pong reste non publié et non déployé.
