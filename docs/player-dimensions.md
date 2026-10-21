# Dimensions du lecteur

## Géométrie commune

Hors plein écran, legacy et SDK partagent une surface 16:9 et le même shell
centré horizontalement. La largeur maximale du shell est 1282 px, soit une
surface de 1280×720 px et 2 px de bordure. Le dock est ajouté sous cette surface
et ne fait pas partie du ratio.

Sur desktop (viewport de largeur au moins 1025 px), la largeur du shell est :

`min(largeur du conteneur, 1282 px, (100svh − 138 px) × 16/9 + 2 px)`.

Sur mobile et tablette, la largeur disponible est utilisée, plafonnée à 1282 px.
La hauteur de la surface vaut toujours 9/16 de sa largeur intérieure. La limite
desktop dépend uniquement de la hauteur globale du viewport. Aucun calcul
n’utilise le haut du player, le défilement ou le contenu précédent de la page.
Il est normal de faire défiler la page pour atteindre le player et son dock.

Launcher, jeu et retour au launcher gardent exactement la même géométrie.
En fullscreen, la surface occupe tout l’écran, sans plafond de largeur, et le
dock est masqué. La sortie restitue la géométrie 16:9 standard.

Le nom du développeur provient de games.developer_name, transmis depuis la
fiche et la page locale à GameLauncher. Une valeur vide masque l’attribution ;
le provider ne sert jamais de remplacement.

## Legacy

Le document est rendu
avec un viewport de référence 1280×720, puis centré et mis à l'échelle
uniformément. Les bandes restantes sont neutres. La propriété nativeViewport
permet de préciser les dimensions connues d'un jeu (par exemple 960×720).
Le ratio du document configuré est conservé, sans étirement ni recadrage.

La taille intrinsèque d'un document cross-origin ne peut pas être inspectée.
La référence 16:9 ne garantit donc pas qu'un contenu arbitraire plus grand que
son propre viewport sera entièrement visible. Sa taille native doit alors être
configurée. object-fit ne redimensionne pas le contenu d'une iframe.

## Jeux SDK

Par défaut, le document reçoit toute la surface disponible, hors dock.
Le canal de dimensions est le viewport natif du navigateur : window.innerWidth,
window.innerHeight, événement resize et ResizeObserver sur le conteneur du jeu.
Cela fonctionne avec le SDK publié 0.3.0 sans message supplémentaire, sans changer
le Bridge ni son protocole. Les dimensions sont exprimées en pixels CSS.

Exemple pour un canvas :

```js
function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const ratio = window.devicePixelRatio || 1;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  // Adapter également la projection, les contrôles et le HUD.
}
window.addEventListener('resize', resize);
resize();
// Au démontage : window.removeEventListener('resize', resize).
```

GameRuntime et ArtifactGamePlayer acceptent fixedViewport pour une compatibilité
explicite avec un jeu non responsive de dimensions connues. Le même centrage et
la même mise à l'échelle uniforme s'appliquent. Dans ce mode, innerWidth et
innerHeight représentent la taille logique fixe ; la transformation visuelle
appartient au lecteur. Cette configuration de présentation ne vient ni d'un
message du jeu ni d'une modification de son manifeste. Elle n'est pas une
nouvelle option enregistrée dans le catalogue.

Le lecteur ne peut pas détecter automatiquement un canvas mal dimensionné dans
un document isolé. Sans taille connue ou adaptation du jeu, aucune garantie
universelle d'absence de découpe interne n'est possible.

## Plein écran

Le dock est masqué et la surface remplit l'écran. Le navigateur redimensionne
le viewport responsive et émet resize ; aucun indicateur fullscreen n'est ajouté
au Bridge. Le mode fixe recalcule seulement son échelle. La sortie utilise les
commandes natives du navigateur (Échap sur desktop). La sortie restitue le dock.
Le lifecycle, les permissions iframe et les autorisations de lancement restent
inchangés.

## Contrôle mobile et tablette

Le launcher appartient au document parent ; aucune iframe de jeu n'existe avant
le clic Jouer. Son overflow est clip, sans défilement interne, y compris lors
d'une tentative de scrollTop. Les tests contrôlent aussi les rectangles des
boutons, du titre et de l'attribution : masquer un débordement ne suffit pas.

Une surface de moins de 220 px de haut utilise un launcher compact. La cover
est conservée si la surface atteint 340 px de large et 180 px de haut.
Le surtitre de marque et le logo du dock sont conservés. Les actions
restent tactiles (44 px minimum). Les titres longs gardent leur texte accessible
et un attribut title. Le défilement normal de la page reste possible.
Aucun overflow hidden global n'est imposé à html, body ou au root de la page.

Mesures Chrome en émulation tactile, marge horizontale de 16 px et haut du
player à 200 px, identiques pour legacy et artifact, en pixels CSS :

| Viewport | Surface | Player complet | Dock |
| --- | --- | --- | --- |
| 390×844 | 356×200,25 | 358×257,25 | 356×55 |
| 844×390 | 810×455,625 | 812×514,625 | 810×57 |
| 768×1024 | 734×412,875 | 736×471,875 | 734×57 |
| 1024×768 | 990×556,875 | 992×615,875 | 990×57 |

Les tests vérifient clientHeight/scrollHeight sur le shell, la surface et le
launcher, la présence de toutes les actions dans la surface et du dock sous le jeu, puis les
dimensions natives du document SDK. innerHeight est arrondi au pixel CSS entier
(413 pour une surface de 412,875 px). Un contenu SDK volontairement géant ne
peut agrandir ni le shell ni la page parent.

Le contenu propre aux jeux legacy cross-origin reste hors du contrôle du
lecteur. Cette limite ne concerne pas le launcher Chibasko Games.

Les tests desktop mesurent 1280×720 px sur 1920×1080 et 1120×630 px sur
1366×768. Pour chaque moteur, les dimensions sont comparées avec 36, 200 et
900 px au-dessus du player, après défilement et redimensionnement : elles sont
identiques à viewport et largeur de conteneur constants.
