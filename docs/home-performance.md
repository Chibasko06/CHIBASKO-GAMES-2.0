# Performance de la page d’accueil

## Déplacement du contenu

Le relevé Chrome du 22 octobre 2026 identifie une annonce automatique AdSense
insérée dans `header.site-header`, après la navigation. Son élément
`ins.adsbygoogle` mesure 280 px de haut, avec deux marges de 10 px. Le header
passe de 81 à 381 px et déplace le contenu principal de 300 px. Le contenu
principal apparaît donc dans les sources du CLS, mais l’insertion publicitaire
en est la cause principale. Aucun masquage CSS de publicité n’est utilisé.

Dans AdSense, ouvrir **Annonces → chibaskogames.fr → Modifier → Zones exclues**,
sélectionner la zone du header et le placement automatique qui y apparaît, puis
appliquer au site. Contrôler ensuite le résultat sur une nouvelle session Chrome.
La propagation peut prendre jusqu’à une heure. Cette configuration distante
reste à appliquer ; le code du portail ne remplace pas ce réglage.

Procédure Google :
<https://support.google.com/adsense/answer/12626543?hl=fr>.

Deux déplacements supplémentaires dépendent de l’authentification : la navigation
remplaçait un emplacement de 128 px par des boutons de 275 px et le hero ajoutait
une seconde action après hydratation. Les deux emplacements sont désormais
réservés. Après connexion, la seconde action du hero devient « Mon compte ».
Les polices de la CMP Google peuvent encore produire des déplacements propres
à son interface ; aucune règle du portail ne modifie cette interface.

## Images

Le build Cloudflare désactive l’optimiseur d’images Next.js. Un simple attribut
`sizes` sur les anciennes images ne réduisait donc pas leur téléchargement.

`npm run build:images`, exécuté par `npm run build`, lit le catalogue public puis
génère des variantes WebP de 180, 360, 720 et 1080 px, sans agrandissement ni
recadrage. La qualité est fixée à 84. Les téléchargements sont limités à 8 Mio,
les images à 16 mégapixels et les origines aux espaces publics autorisés.
Les redirections sont refusées. Aucun credential serveur n’est nécessaire.

Les fichiers à nom dérivé du contenu sont générés dans
`public/optimized-game-images/`. Le manifeste `.distribution/catalogue-images.json`
est intégré au build côté serveur ; le Worker ne lit pas le filesystem au runtime.
Le navigateur choisit sa variante avec `picture` et `srcset`.
Les cartes conservent leurs dimensions et leurs proportions existantes.

Le catalogue est photographié au build : une nouvelle miniature publiée après
ce build utilise son original jusqu’au prochain build du portail. Si une image
ne peut pas être préparée, son original reste utilisable. Les fichiers générés
et le cache sont ignorés par Git. `npm run build:images -- --offline` reconstruit
les variantes déjà mises en cache. Un build frais nécessite l’accès au catalogue
et aux miniatures publics pour bénéficier de toutes les optimisations.

Exemples mesurés : miniature Pong originale 1 007 575 octets, variante 360 px
17 948 octets ; logo de navigation original 296 161 octets, nouvelle image
96 × 96 px de 1 650 octets pour un affichage 48 × 48 px. Les icônes SEO existantes
et leurs URLs ne sont pas modifiées.

## JavaScript, CSS et chargement initial

Lighthouse public identifie 276 826 octets de JavaScript non utilisé pendant son
scénario : environ 195 744 octets proviennent d’AdSense et de Funding Choices,
57 614 de Supabase et 23 468 du runtime React. Ces mesures de couverture ne
prouvent pas que le code peut être supprimé : l’authentification, les publicités
et le consentement doivent rester fonctionnels. Aucun code de player, de
publication ou d’admin n’a été identifié dans les deux gros chunks internes
signalés. Ces services ne sont pas retardés artificiellement pour améliorer un
score. Le JS transféré reste pratiquement inchangé.

Le CSS du portail représente environ 22 Ko transférés sur le relevé public.
Les feuilles nécessaires au premier rendu restent bloquantes pour éviter un
rendu sans styles. Les polices du portail sont des polices système ; la police
externe observée appartient à la CMP. Aucun jeu n’est lancé depuis la home.

## Mesures comparables

Lighthouse 13.5.0, Chrome headless, cache navigateur neuf, même serveur Next.js
de production local et scripts tiers conservés. Le preset desktop et le preset
mobile sont exécutés séparément. Les valeurs restent sensibles au CPU et aux
services tiers. Un score mobile inférieur n’est pas présenté comme un gain.

| Mesure | Desktop avant | Desktop après | Mobile avant | Mobile après |
| --- | ---: | ---: | ---: | ---: |
| Performance | 92 | 97 | 69 | 68 |
| CLS | 0,0024 | 0 | 0,0246 | 0 |
| LCP | 1,31 s | 0,83 s | 3,12 s | 3,56 s |
| Speed Index | 1,83 s | 1,53 s | 5,51 s | 2,79 s |
| TBT | 104 ms | 56 ms | 837 ms | 1 020 ms |
| Images transférées | 2 929 724 o | 489 348 o | 753 351 o | 149 288 o |
| JS transféré | 491 836 o | 491 695 o | 487 907 o | 487 992 o |
| Total transféré | 4 180 751 o | 1 745 961 o | 1 990 076 o | 1 389 818 o |

Le relevé public avant modification donne 76 desktop / 21 mobile et un CLS de
0,221 / 0,553. Il n’est pas directement comparable au relevé local : les annonces
et la CMP se comportent différemment sur localhost. Le rapport initial fourni
indiquait 85 desktop et 0,205 de CLS. Aucun score public « après » n’est disponible
sans déploiement. L’objectif de CLS public inférieur à 0,1 reste à vérifier après
l’exclusion AdSense et le déploiement.

## Reproduction

```powershell
npm run build:images
npm run test:home-performance
npm run build -- --webpack
npm start -- --hostname 127.0.0.1 --port 3198
```

Dans un second terminal :

```powershell
node scripts/audit-home-performance.mjs http://127.0.0.1:3198/ local
npm exec --yes --package=lighthouse@13.5.0 -- lighthouse http://127.0.0.1:3198/ --preset=desktop --output=json --output-path=.distribution/home-performance/desktop.json --chrome-flags="--headless --no-sandbox"
npm exec --yes --package=lighthouse@13.5.0 -- lighthouse http://127.0.0.1:3198/ --output=json --output-path=.distribution/home-performance/mobile.json --chrome-flags="--headless --no-sandbox"
```

Pour reproduire la configuration d’images Cloudflare, définir
`CHIBASKO_CLOUDFLARE=1` avant le build. Les captures et traces sont enregistrées
dans `.distribution/home-performance/`, sans ajout à Git. Après déploiement,
répéter les mesures sur le domaine public et vérifier la stabilité du header,
les cookies/choix CMP et l’absence d’iframe de jeu avant lancement.
