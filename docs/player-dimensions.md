# Dimensions du lecteur

## Géométrie commune

Hors plein écran, legacy et SDK partagent la même surface. Sur desktop et mobile
paysage, sa hauteur est le minimum de 9/16 de la largeur intérieure du shell,
720 px et de la hauteur disponible après déduction du dock et des bordures.
La hauteur disponible est mesurée depuis le haut du shell jusqu’au bas du
viewport, avec une marge de 16 px. Le dock réel est mesuré, sans hypothèse sur
sa hauteur mobile. ResizeObserver et resize mettent ces mesures à jour ;
aucune mesure ne dépend de l’état launcher ou playing.

Sur mobile portrait (largeur ≤600 px et hauteur >500 px), la hauteur cible
est 460 px, toujours bornée par cet espace disponible. Le launcher passe sur
une colonne avec une couverture compacte. En fullscreen, la surface occupe
tout le viewport et le dock est masqué.

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

Une surface de moins de 220 px de haut utilise un launcher compact sans cover.
Le surtitre de marque et le logo du dock sont conservés. Les actions
restent tactiles (44 px minimum). Les titres longs gardent leur texte accessible
et un attribut title. En paysage court, la surface conserve au moins 128 px ;
si la page ne laisse plus assez de place, son défilement normal reste possible.
Aucun overflow hidden global n'est imposé à html, body ou au root de la page.

Mesures Chrome en émulation tactile, marge horizontale de 16 px et haut du
player à 200 px, identiques pour legacy et artifact, en pixels CSS :

| Viewport | Surface | Player complet | Dock |
| --- | --- | --- | --- |
| 390×844 | 356×460 | 358×517 | 356×55 |
| 844×390 | 810×128 | 812×187 | 810×57 |
| 768×1024 | 734×412,875 | 736×471,875 | 734×57 |
| 1024×768 | 990×493 | 992×552 | 990×57 |

Les tests vérifient clientHeight/scrollHeight sur le shell, la surface et le
launcher, la visibilité initiale de toutes les actions et du dock, puis les
dimensions natives du document SDK. innerHeight est arrondi au pixel CSS entier
(413 pour une surface de 412,875 px). Un contenu SDK volontairement géant ne
peut agrandir ni le shell ni la page parent.

Le contenu propre aux jeux legacy cross-origin reste hors du contrôle du
lecteur. Cette limite ne concerne pas le launcher Chibasko Games.
