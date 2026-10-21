# Dimensions du lecteur

## Legacy

GameViewport utilise une surface 16:9 hors plein écran. Le document est rendu
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
