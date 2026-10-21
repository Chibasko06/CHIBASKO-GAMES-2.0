# Navigation du catalogue

## Rangées de catégories

La home charge au maximum dix jeux par catégorie et réutilise GameCard.
HorizontalScroller conserve des cartes de 220 px (180 px sous 600 px), sans
scrollbar native visible. Les commandes apparaissent uniquement si le contenu
déborde, et sont désactivées à la première et à la dernière position.
Les commandes sont superposées sur les bords, sans hauteur réservée sous les
cartes, avec un fond dégradé très transparent et un chevron centré. Les commandes
désactivées sont invisibles. Sous 600 px, elles sont masquées pour laisser le
swipe libre.
ResizeObserver suit les changements de largeur ; le défilement natif reste
accessible au tactile et au clavier. Le mouvement respecte reduced-motion.

Avec le conteneur et les marges du site, les mesures Chrome sont : sept cartes
entières à 1920 px, cinq à 1366 px, trois à 768 px, une à 390 px avec aperçu de
la suivante. Une catégorie moins fournie affiche simplement ses jeux disponibles.

GameCard utilise une hauteur commune de 376 px, une image de 160 px et des
zones réservées au titre, aux badges, aux catégories, aux deux lignes de
description, aux statistiques et au pied développeur/technologie. Les badges
Multijoueur et capacité restent visibles, sans agrandir la carte.

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
10, header 20, dropdown 25 et modales 30. Le menu compte utilise un portal React
vers document.body et une position fixed, ancrée sous son bouton. Il ne dépend
plus du contexte d’empilement, des transforms ou de l’overflow du header.

Le positionnement est recalculé au scroll (y compris dans un conteneur), au
resize et aux changements du viewport visuel. ResizeObserver suit le bouton
et le menu ; les mises à jour sont regroupées par animation frame. Le menu
reste dans le viewport, peut se placer au-dessus du bouton faute d’espace,
et se ferme si le bouton disparaît. Échap restitue le focus ; clic ou focus
hors du menu le ferment. Les observateurs et listeners sont retirés à la fermeture.

Le contexte parent était une limite structurelle de l’ancien dropdown. Les tests
forcent un header transformé, avec overflow hidden et un niveau inférieur au
contenu, afin de vérifier explicitement que le portal échappe à ces contraintes.
Le rendu précis d’une ancienne version en production n’est pas déduit de ces
fixtures locales. Les dialogues natifs et le fullscreen gardent leur top layer.

Validation : npm run test:catalogue-interface et npm run test:game-runtime-browser.
