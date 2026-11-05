# Navigation du catalogue

## Rangées de catégories

La home charge au maximum dix jeux par catégorie et réutilise GameCard.
Les grilles et les rangées partagent GameCardCollection : une colonne par défaut,
deux dès 640 px, trois dès 768 px, quatre dès 1280 px et cinq dès 1536 px.
La largeur correspond à (largeur du conteneur − espaces entre colonnes) / nombre
de colonnes, avec un espace de 16 px. Les rangées utilisent exactement cette
même largeur dès 640 px ; sous ce seuil, leurs cartes restent à 180 px avec
un espace de 12 px pour le swipe et l’aperçu suivant. Aucune scrollbar native
n’est visible. Les commandes apparaissent uniquement si le contenu
déborde, et sont désactivées à la première et à la dernière position.
Les commandes sont superposées sur les bords, sans hauteur réservée sous les
cartes, avec un fond dégradé très transparent et un chevron centré. Les commandes
désactivées sont invisibles. Sous 600 px, elles sont masquées pour laisser le
swipe libre.
ResizeObserver suit les changements de largeur ; le défilement natif reste
accessible au tactile et au clavier. Le mouvement respecte reduced-motion.

Avec le conteneur et les marges du site, les mesures Chrome sont : cinq cartes
entières de 352 px à 1920 px, quatre de 309,5 px à 1366 px, trois à 768 px,
une à 390 px avec aperçu de
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

## Appareils et compatibilité

La source commune reste games.mobile_compatible ; game_submissions.mobile_compatibility
porte la déclaration avant publication. Les valeurs explicites sont platform:desktop,
platform:mobile, platform:both et platform:unknown. Ce préfixe distingue les nouvelles
déclarations des textes legacy, qui restent enregistrés sans modification.
Le classement historique mobile devient « les deux », et le classement ordinateur
reste ordinateur. Les valeurs ambiguës restent à vérifier, sans certification inventée.

Le catalogue, les catégories, l’accueil, les classements, les recommandations et le
multijoueur filtrent en SQL avant le comptage et la pagination. Le filtre existant
permet toujours de consulter toutes les plateformes. Les favoris, historiques et
notifications conservés ne sont pas amputés : la fiche explique les incompatibilités.
Une fiche publique reste accessible et partageable. Un avertissement précède le
lecteur ; un choix explicite permet de continuer sur un appareil hybride. Les previews
administratives restent accessibles pour qualifier les commandes réelles.

Le premier rendu utilise les indications de requête, avec repli sur toutes les
plateformes en cas d’incertitude et pour les robots. Le navigateur affine les visites
suivantes avec le pointeur et le tactile via cg-device, sans rechargement initial.
Une souris utilisable privilégie ordinateur ; une tablette tactile privilégie mobile.
La présence d’un clavier physique ne peut pas être déduite de façon fiable par le Web.
La détection est indicative, n’accorde aucun droit et ne remplace pas le filtre manuel.
Les rendus dépendant de l’appareil restent dynamiques, sans cache public partagé.
