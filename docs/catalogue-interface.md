# Navigation du catalogue

## Rangées de catégories

La home charge jusqu’à douze jeux par catégorie et réutilise GameCard.
HorizontalScroller conserve des cartes de 220 px (180 px sous 600 px), sans
scrollbar native visible. Les commandes apparaissent uniquement si le contenu
déborde, et sont désactivées à la première et à la dernière position.
ResizeObserver suit les changements de largeur ; le défilement natif reste
accessible au tactile et au clavier. Le mouvement respecte reduced-motion.

Avec le conteneur et les marges du site, les mesures Chrome sont : sept cartes
entières à 1920 px, cinq à 1366 px, trois à 768 px, une à 390 px avec aperçu de
la suivante. Une catégorie moins fournie affiche simplement ses jeux disponibles.

## Recommandations

La fiche réutilise son catalogue public, partagé avec ses métadonnées par un
cache React limité au rendu serveur. Aucun appel réseau client supplémentaire
n’est nécessaire. La première catégorie connue est prioritaire ; les autres
catégories communes servent de complément. Le jeu courant, les jeux non publiés
et les doublons sont exclus. La sélection est limitée à cinq jeux. Sans catégorie
connue, elle reprend les jeux publics du catalogue ; sans jeu pertinent, le bloc
est absent.

À partir de 1680 px de viewport, la page réserve 1282 px au player, 24 px de
séparation et 240 à 280 px aux recommandations. Ce seuil respecte les marges
maximales du site et ne réduit jamais le player pour loger la colonne. En dessous,
le bloc passe sous le player en rangée horizontale. Les recommandations restent
hors du shell du jeu.

Les dimensions, les styles et le comportement de GamePlayerShell, GameRuntime et
PlayerFrame ne sont pas modifiés. Les tests comparent les surfaces avec et sans
recommandations, pour les deux moteurs, puis vérifient lancement, fermeture et
fullscreen.

## Empilement

Les niveaux partagés vivent dans app/globals.css : contenu 0, contrôles flottants
10, header 20. Le dropdown utilise le niveau local 1 à l’intérieur du header.
Le flou du header créait déjà un contexte d’empilement ; son niveau explicite
le place maintenant au-dessus du contenu, lui-même isolé au niveau 0. Les cartes
transformées et les overlays du player ne peuvent pas dépasser ce contexte.
Les dialogues natifs et le fullscreen conservent leur top layer navigateur.

Validation : npm run test:catalogue-interface et npm run test:game-runtime-browser.
