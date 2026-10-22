# Audit SEO — 22 octobre 2026

## Périmètre et état

Audit du code Next.js/OpenNext, des pages publiques et du catalogue publié en
lecture seule. Les corrections sont locales ; aucun déploiement, changement de
données ou action Search Console n’est effectué.

Le domaine canonique est https://chibaskogames.fr. Le Worker public conserve
actuellement son nom historique chibasko-games-preview. La séparation des
hostnames dans cloudflare/preview.mjs autorise les deux domaines publics et
maintient les protections sur workers.dev et les autres hôtes. Cette correction
doit être déployée avant de demander un nouveau crawl : le dernier contrôle
production a observé Disallow: / et un X-Robots-Tag global de preview.

## Problèmes critiques

| Constat | Correction / état |
| --- | --- |
| Protections preview appliquées au domaine public | Correctif hostname déjà préparé ; confirmer sa prise en compte après déploiement. Aucun noindex global ajouté. |
| Pages compte/auth héritant de robots index,follow | Layouts noindex,nofollow pour login, register, reset-password, dashboard, favorites, auth et developer ; canonical hérité supprimé. Admin possédait déjà sa restriction. |
| Canonical global de la home hérité par les pages sans métadonnées | Retiré du layout global ; chaque page publique importante définit son canonical. |
| robots.txt empêchant la lecture des noindex des pages compte | Ces pages restent explorables avec un noindex explicite. Admin et API restent exclus du crawl ; authentification et autorisations restent indépendantes. |
| Texte catalogue injecté sans échappement dans un script JSON-LD | Sérialisation échappant `<`, sans modifier le texte affiché. |

Les API reçoivent un X-Robots-Tag limité à /api/:path*. Les protections des pages
admin, des salons privés et des routes de lancement ne sont pas supprimées.

## Problèmes moyens

| Constat | Correction / état |
| --- | --- |
| Catégories limitées à des filtres client, titre et canonical du catalogue | Conservation de /games?category=slug ; H1, introduction, title, description, OG/Twitter et canonical rendus côté serveur. Liens de catégories crawlables. |
| Absence de catégories dans le sitemap | Catégories existantes contenant au moins un jeu publié incluses. Aucune nouvelle catégorie créée. Catégories vides/inconnues et résultats de recherche non indexables. |
| Fiches jeux avec Open Graph article | Type website, titre dynamique « Nom - Jeu gratuit en ligne », image propre avec alt du jeu, description courte issue du texte existant. Le template racine ajoute la marque une seule fois. |
| Attribution Chibasko Games comme publisher de tous les jeux | Retirée du VideoGame : héberger un jeu ne démontre pas son statut d’éditeur. Le développeur connu reste author. |
| Notes structurées dépendant de compteurs publics | AggregateRating retiré ; aucun enrichissement artificiel. Les compteurs et avis visibles ne sont pas modifiés. |
| Sitemap potentiellement figé à la compilation | Route dynamique ; seuls jeux publiés et catégories peuplées sont retenus. Aucun lastModified inventé : games ne possède pas de date fiable de modification éditoriale. |
| Charge serveur et catalogue intégral | Page jeu et catégorie dédupliquent leurs lectures metadata/rendu par React.cache. La home conserve plusieurs chargements de catalogue, et le catalogue transmet la liste au client : optimisation distincte à prévoir si la volumétrie augmente. |
| Limite de lignes des lectures Supabase | Audit direct paginé : 82 jeux, donc sans troncature actuellement. Les queries partagées de catalogue/profils ne paginent pas ; à adapter avant d’atteindre la limite de retour configurée dans Supabase. Ne pas annoncer un sitemap exhaustif au-delà de cette limite sans ce travail. |

## Améliorations mineures

- Fil d’Ariane visible Accueil → Jeux → jeu, avec BreadcrumbList correspondant.
- Organization et WebSite conservés ; SearchAction correspond à la vraie recherche
  /games?search=. Aucun schéma WebApplication/SoftwareApplication ni offre ajouté.
- FAQPage retiré ; FAQ visible et liens vers catalogue, guide et contact conservés.
  Google a arrêté cet enrichissement en mai 2026 : aucune promesse de résultat enrichi.
- sizes des GameCard aligné sur les breakpoints réels 1/2/3/4/5 colonnes ; sizes
  du hero corrigé pour sa disposition tablette. Aucune géométrie de carte/player modifiée.
- Manifest : les images icon.png et apple-icon.png mesurent réellement 512×512.
  Déclarations 192×192 et 180×180 inexactes supprimées/corrigées.
- Titres des sous-routes local/online/private sans marque dupliquée ; canonical
  absent et noindex conservé.
- Texte d’accueil sans nombre de jeux non vérifié. Un H1, sections H2 et titres
  de cartes H3 ; liens vers catalogue, catégories, jeux et multijoueur présents.

## Contenu et cas ambigus conservés

Commande de lecture seule :

```sh
npm run audit:seo-catalogue
```

Elle utilise uniquement NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY
du chargement .env habituel, jamais la service_role. Les requêtes sont des GET
sur les champs publics des jeux publiés, paginées et bornées à 10 000 lignes.
Le rapport précise si cette borne est atteinte. Aucune valeur de configuration
n’est imprimée.

Résultat constaté : 82 jeux publiés, aucune troncature, aucun titre ou description
exactement dupliqué après normalisation de casse/espaces, aucune description vide
ou inférieure à 60 caractères, aucune miniature absente. Cela ne démontre pas
l’originalité éditoriale ni la disponibilité de chaque image distante.

Cas à examiner sans réécriture automatique :

- Profils publics /players/{id} : certains peuvent avoir une bio vide et peu
  d’activité. Leur statut public et leur inclusion sitemap sont conservés.
- FAQ : si aucune entrée publiée n’est disponible, un écran « FAQ en préparation »
  reste possible. Ne pas inventer des réponses pour la remplir.
- Catégories contenant un seul jeu : introduction factuelle et liste réelles,
  aucune page supplémentaire produite. Évaluer leur intérêt avec les impressions.
- Descriptions proches sémantiquement ou identiques à une source externe :
  l’absence de doublons exacts dans le catalogue ne suffit pas à les exclure.
- Anciennes URLs V1 : aucune table de correspondance fiable trouvée. Aucun 301
  spéculatif ; récupérer les anciennes URLs depuis Search Console/logs avant mapping.
- www/non-www : les canonicals convergent vers le domaine sans www. Aucun 301
  global ajouté sans contrôle des règles Cloudflare existantes.
- Les règles privées WAF/Bot Fight/rate limit du compte Cloudflare ne sont pas
  accessibles par cet audit de code. Le dernier test public ads.txt ne montrait
  aucun challenge ; cela ne démontre pas l’accès depuis toutes les IP Google.

## Images et performance

GameCard possède un href réel, un titre visible et un alt correspondant au nom
du jeu. Sa zone image a une hauteur réservée ; next/image fill n’introduit pas
de nouvelle variation de hauteur. La première image hero utilise priority,
les autres images utilisent le chargement différé. Les logos OG de repli sont
carrés : une future image sociale dédiée peut améliorer le partage, sans urgence
d’indexation.

Le build Cloudflare désactive l’optimiseur Next : les formats AVIF/WebP déclarés
dans next.config ne prouvent pas une conversion effective en production. Mesurer
les poids des originaux et prévoir leur optimisation à la source si nécessaire.
Les icônes de 512 px pèsent environ 296 Ko chacune.

Les deux moteurs conservent leur launcher : aucune iframe de jeu avant clic.
Le moteur legacy et le runtime SDK ne sont pas modifiés. Les contrôles audio,
les dimensions, le dock et les launches restent inchangés.

AdSense reste async ; son script et sa CMP ne sont pas modifiés. Analytics reste
conditionné par le Consent Mode existant. Aucun préchargement de jeu ou script
tiers supplémentaire n’est introduit pour le SEO.

LCP, CLS et INP terrain ne sont pas certifiés par ce contrôle. Les tests Chrome
locaux bloquent scripts tiers, images distantes et mutations pour protéger les
données ; leurs captures prouvent le layout et la lisibilité, pas la performance
réelle sous publicité. Contrôler PageSpeed Insights et les Core Web Vitals de
Search Console après déploiement, avec et sans consentement Google. INP exige
des interactions et des données de terrain représentatives.

## Sitemap et URLs

Le sitemap conserve home, catalogue, multijoueur, communauté, FAQ, à-propos,
contact, publication, développeurs, mentions légales, confidentialité et cookies.
Il ajoute les catégories peuplées et conserve les fiches publiées et les profils
publics. Aucune route admin/auth/API/developer privée, aucun brouillon, aucun salon
ou écran d’exécution n’est ajouté.

URLs stables : /games/{slug}, /games?category={slug}, /players/{id}. Les aliases
username de profils redirigent déjà vers leur identifiant canonique. Les filtres
search/type/device/sort sont noindex,follow lors d’un accès direct ; leur canonical
vise le catalogue ou la catégorie sans paramètres de filtrage/tracking. Les
contrôles de filtres restent locaux sans nouvelle lecture serveur à chaque frappe.

Les pages inexistantes utilisent notFound() : le navigateur local a vérifié HTTP
404 et noindex pour un slug absent. Aucun faux HTTP 200 de jeu introuvable ajouté.
Le statut d’erreur en cas de panne DB reste à distinguer d’un catalogue réellement
vide : les queries historiques renvoient parfois [] sans remonter l’erreur. Ce
comportement partagé nécessite un travail de fiabilité distinct avant modification.

## Validation reproductible

```sh
npm run test:seo
npm run audit:seo-catalogue
npm run build -- --webpack
npm run test:seo-browser
```

Les tests navigateur lancent un vrai serveur Next de production local sur le port
3197 (SEO_TEST_PORT permet de le changer), utilisent Chrome et consultent le
catalogue publié en lecture seule. Ils interceptent toutes les mutations navigateur
et les requêtes tierces. Aucun clic de lancement ou soumission n’est effectué.

Couverture : 390×844, 768×1024, 1366×768, 1920×1080 ; home, catalogue, catégorie,
fiche legacy publiée, Pong SDK, guide, FAQ ; un H1 visible, canonical, robots, absence de débordement
et d’iframe avant lancement ; pages compte noindex, API X-Robots-Tag, tracking et 404.
Les tests Cloudflare vérifient séparément production vs preview et ads.txt inchangé.

### Résultats locaux

- Audit catalogue : 82 jeux publiés, aucune anomalie exacte signalée.
- Tests SEO serveur : 7 réussis ; régressions player/catalogue : 5 réussies.
- Tests du wrapper Cloudflare : 7 réussis ; guide/liens : 5 réussis.
- Chrome sur vrai build Next : quatre formats et vérifications privées/404/API réussis.
- TypeScript, lint ciblé et git diff --check réussis.
- Next Webpack : build de production réussi, dont les nouvelles métadonnées.
- Build Cloudflare : non validé sur ce poste. La commande normale échoue dans
  Turbopack lors du traitement globals.css/sous-processus Node, y compris hors
  sandbox. Le build Next Webpack avec CHIBASKO_CLOUDFLARE=1 réussit ; l’étape
  OpenNext --skipNextBuild échoue ensuite avec ENOENT middleware.js.nft.json.
  La version installée avertit de sa compatibilité Windows partielle et du support
  expérimental du middleware Node. Reproduire sur la chaîne Linux/CI avant promotion.
  Aucun fichier de configuration de déploiement n’est modifié pour contourner ce point.

## Fichiers de cette correction

- Métadonnées : lib/seo.ts, lib/seoCatalogue.ts, app/layout.tsx, app/games/page.tsx,
  app/games/[slug]/page.tsx, app/faq/page.tsx.
- Indexation : app/robots.ts, app/sitemap.ts, next.config.ts ; nouveaux layouts
  app/auth/layout.tsx, app/dashboard/layout.tsx, app/developer/layout.tsx,
  app/favorites/layout.tsx, app/login/layout.tsx, app/register/layout.tsx,
  app/reset-password/layout.tsx ; métadonnées des sous-pages
  app/games/[slug]/local/page.tsx, online/page.tsx et private/page.tsx.
- Contenu/layout existant : app/page.tsx, components/GamesCatalog.tsx,
  components/GameCard.tsx, app/manifest.ts. Aucun CSS de player ou de carte modifié.
- Outils/tests : package.json, scripts/seo-catalogue-audit.mjs, tests/seo.test.mjs,
  tests/seo.browser.test.mjs, tests/product-register.mjs (résolution des CSS Modules
  pour le rendu serveur de test), docs/seo-audit.md.

Les modifications de DocumentationPage et de ses tests préexistaient à cet audit
et concernent la suppression du double footer ; elles ne sont pas incluses ici.

## Checklist Search Console après déploiement

1. Vérifier la propriété Domaine et l’accès à https://chibaskogames.fr.
2. Contrôler robots.txt : Allow: /, aucune interdiction globale ; vérifier les
   headers des pages publiques et le maintien des restrictions preview/admin.
3. Soumettre https://chibaskogames.fr/sitemap.xml ; contrôler qu’il est lisible,
   sans erreur, sans brouillon et avec les catégories attendues.
4. Inspecter en direct la home, une fiche legacy, Pong, une catégorie et le guide :
   HTTP 200, rendu mobile, canonical déclaré et canonical choisi par Google.
5. Demander l’indexation des pages prioritaires après les contrôles, sans requêtes
   massives. Une demande ne garantit pas l’indexation.
6. Contrôler les pages exclues : compte/auth/admin/API, exécution/local/online,
   salons, recherche et filtres ; distinguer exclusions attendues et anomalies.
7. Vérifier les 404, soft 404, erreurs serveur, redirections et URLs V1 réellement
   remontées ; établir les correspondances avant tout ajout de redirection.
8. Contrôler HTTPS, variantes www/non-www et absence de boucle de redirection.
9. Vérifier VideoGame/BreadcrumbList avec le validateur Schema.org et les outils
   Google pertinents. Le balisage ne garantit pas de résultat enrichi.
10. Suivre Core Web Vitals mobile/desktop : LCP, CLS, INP ; compléter avec
    PageSpeed Insights sur home, catégorie et jeu, consentement accepté/refusé.
11. Comparer impressions, clics et pages indexées sur plusieurs semaines ; examiner
    les pages de catégorie/profil pauvres sans ajouter de texte artificiel.

## Références

- https://developers.google.com/search/docs/crawling-indexing/block-indexing
- https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://developers.google.com/search/updates
- https://nextjs.org/docs/app/getting-started/metadata-and-og-images
