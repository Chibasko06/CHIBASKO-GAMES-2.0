# Agrandissement du lecteur

Le bouton « Agrandir le jeu » appartient au lecteur commun, pas au jeu embarqué. Il concerne les builds classiques, SDK, les URL externes et les jeux legacy.

## Modes

- **Natif** : API standard si elle est disponible et autorisée, sinon API WebKit préfixée lorsqu’elle existe. Le lecteur suit les événements standard et préfixés.
- **Immersif web** : repli automatique si l’entrée native est absente, refusée, lève une exception ou ne confirme pas son entrée après 1,5 seconde. Le lecteur remplit le viewport visible. Les barres de Safari peuvent rester visibles : ce mode ne prétend pas les supprimer.

Dans les deux modes agrandis, aucune ligne permanente n’est réservée aux commandes. La sortie et l’ouverture du panneau restent visibles, avec des cibles tactiles de 44 pixels. Le panneau regroupe réactions, audio, fermeture de la partie et déplacement des commandes ; son ouverture ne redimensionne pas le jeu. Sa hauteur est bornée et ses premières commandes restent accessibles pendant son défilement.

Les commandes privilégient les marges connues autour du contenu. Le lecteur ne lit pas le DOM du jeu cross-origin et ne prétend pas détecter son HUD. Le joueur peut déplacer le panneau entre les quatre coins. Échap ferme d’abord le panneau, puis réduit le mode immersif lorsqu’il atteint le document du portail.

Le lecteur et son iframe ne changent jamais de parent. Aucun `src`, sandbox, permission, origine ou ticket n’est modifié par l’agrandissement. Une sortie du mode agrandi ne quitte pas la partie. « Quitter le jeu » conserve son effet habituel et restitue d’abord l’affichage du portail.

## Dimensionnement

`PlayerSizing` est indépendant de l’hébergement et de l’intégration :

- `responsive` fournit au jeu toute la surface utile ; son moteur reste responsable de son rendu interne ;
- `fixed` fournit un viewport logique déclaré et le contient par une échelle uniforme, sans étirement ni rognage.

Les composants des quatre parcours acceptent cette politique. Les anciens paramètres `viewport`, `nativeViewport` et `fixedViewport` restent compatibles. Sans déclaration explicite, les URL et les jeux legacy conservent leur viewport 1280 × 720 ; les builds R2 gardent le comportement qu’ils avaient déjà. Aucun jeu GameMonetize n’est reclassé automatiquement.

La politique est un contrat des composants fourni par le portail. Elle n’est pas déduite du SDK, d’un domaine, d’un paramètre d’URL utilisateur ou d’un message du jeu. Ce lot n’ajoute pas de déclaration publique dans le manifeste ni de champ SQL : une future déclaration persistée devra être validée et liée au build ou à la révision examinée.

La fixture Freehead Skate reproduit son viewport logique 720 × 405 et son letterboxing, sans exécuter le jeu tiers. Dans un viewport paysage de 844 × 281 avec 59 pixels sûrs à gauche et à droite et 20 en bas, la surface utile est de 726 × 261. Le jeu occupe désormais 464 × 261, contre environ 363 × 204 avec la ligne de commandes de 57 pixels : +27,94 % par dimension, soit environ +63,7 % de surface. En portrait, il reste limité par la largeur : les bandes ne sont pas supprimées artificiellement. Cette mesure est identique avec une iframe fixe et une iframe responsive lorsque le jeu conserve lui-même son ratio 16:9.

## Restauration

En mode immersif, les frères du lecteur et de ses ancêtres deviennent temporairement invisibles et inertes. Les nouveaux éléments périphériques sont traités de la même manière. Les propriétés d’ancêtres susceptibles de rogner ou retenir un élément fixe sont neutralisées temporairement. Le corps est immobilisé à sa position de défilement initiale.

Les dimensions et décalages de `visualViewport` sont suivis sur ses événements `resize` et `scroll`, ainsi que sur les changements de fenêtre et d’orientation. Les mises à jour sont regroupées par animation frame. Les safe areas protègent la surface et les commandes tactiles.

La sortie rétablit les valeurs CSS et leurs priorités, les attributs d’accessibilité, l’interactivité et le défilement initial. Les propriétés de débordement sont sauvegardées par axe pour conserver une configuration préexistante comme `overflow-x: clip`. Le focus revient à la commande d’agrandissement. Les observateurs, événements et délais sont nettoyés à la sortie ou au démontage du lecteur.

Échap fonctionne lorsque l’événement atteint le document du portail. Il ne peut pas être intercepté depuis le document d’un jeu cross-origin : la commande tactile de sortie reste donc indispensable. Une seule immersion web peut posséder le verrou du document à la fois.

## Vérification locale

```powershell
npm run test:player-expansion
```

Pour WebKit de test, avec le navigateur Playwright installé :

```powershell
$env:EXPANSION_BROWSER = 'webkit'
npm run test:player-expansion
Remove-Item Env:EXPANSION_BROWSER
```

Les tests utilisent les vrais composants et des iframes locales interceptées. Ils vérifient l’identité du nœud, l’état mémoire du jeu et l’absence de nouveau chargement après agrandissement. Les cas d’API absente, refusée, préfixée, bloquée ou sans réponse sont simulés dans chaque moteur. Le cas natif non simulé est également exécuté. Les captures de test sont enregistrées dans `.distribution/player-expansion/`, ignoré par Git.

Les dimensions 390×844, 844×390, 768×1024 et 1024×768 couvrent portrait et paysage, avec rotation pendant l’immersion. Les décalages de viewport liés aux barres ou au clavier sont simulés séparément.

WebKit Playwright sous Windows ne remplace pas Safari sur appareil Apple. Avant de déclarer la qualification matérielle terminée, vérifier sur iPhone et iPad : barres Safari, encoche, rotation, clavier, commandes tactiles et conservation d’une partie après plusieurs entrées/sorties. Aucune installation PWA n’est requise.

Aucune migration ni nouvelle configuration d’infrastructure n’est nécessaire. Le correctif est livré avec le portail ; il ne nécessite aucun changement du Gateway ou du SDK.

## Résultats locaux du 25 novembre 2026

| Contrôle | Résultat |
| --- | --- |
| Chrome, agrandissement, dimensionnement et commandes compactes | 26 tests réussis |
| WebKit Playwright sous Windows | 26 tests réussis |
| Lecteur existant, sandbox, audio, sessions et SDK | 97 tests réussis |
| SDK réel sur origine stable, immersion répétée sans nouvelle session | 1 test réussi |
| Runtime, intégrations et diagnostics unitaires | 39 tests réussis |
| Politiques de dimensionnement et placement des commandes | 2 tests réussis |
| TypeScript, ESLint ciblé, `git diff --check` | Réussis |
| Build Cloudflare Linux et démarrage isolé du Worker OpenNext | Réussis |

Les deux moteurs ont utilisé leur API native non simulée avec succès. Les cas de refus et d’absence ont été forcés pour vérifier le repli. Aucun appareil Apple physique n’a été testé. Le certificat HTTPS éphémère des régressions reste dans `.distribution/`, sans modification de production.
