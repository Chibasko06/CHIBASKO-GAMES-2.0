# Chibasko Pong — préparation de l'extraction réelle

## État et décision

Copie autonome : `C:/Users/chiba/ChibaskoGames/chibasko-pong`, hors du repository
plateforme. Aucun `.git`, remote, commit, push, publication ou déploiement créé.
Package privé `@chibaskogames/chibasko-pong`, version **0.1.0**, `UNLICENSED`.

Le dossier `games/chibasko-pong` reste provisoirement dans la plateforme. Il ne
sera supprimé qu'après création et validation du vrai dépôt/tag Git privé : avant
cela, aucune référence Git Pong portable ne peut être installée sur un autre poste.
On ne remplace pas ce dossier par une dépendance absolue vers la copie sœur ni par
un tarball versionné. Les registres et builds consomment déjà les exports publics.

## Audit des consommateurs

| Consommateur | Contrat utilisé / changement |
| --- | --- |
| `games/clientRegistry.ts` | Imports dynamiques littéraux `/client` et `/local`, déjà publics ; inchangés. |
| `game-server/src/games/registry.ts` | `pongDefinition` exportée par la racine du package ; inchangé. |
| `game-server/src/games/registerInternalGames.ts` | `/server` fournit `pongServerModule`, branché à l'adaptateur privé ; inchangé. |
| `scripts/generate-game-manifest.mjs` | Registre installé et définition publique ; ne lit pas les sources Pong. |
| Précommandes web/backend/manifeste | `build:pong` vérifie désormais les exports compilés installés, sans compiler un dossier source. |
| `scripts/check-game-boundaries.mjs` | Vérifie le dist installé et interdit les imports privés Pong dans runtime et tests plateforme. Le jeu possède aussi son propre checker autonome. |
| Tests produit/local/lobby/results | Conservent les intégrations plateforme, imports publics seulement. Les tests internes de contrôles/rendu ont rejoint Pong. |
| Tests serveur/network/public/private | Restent plateforme : admission, orchestration, concurrence, deux parties, abandon et résultats. Les wrappers de tests moteur/parité sont supprimés. |
| Layout optionnel plateforme | Hôte réel Navbar/Footer + jeu importé par ses exports, sans lecture de ses sources/styles internes. |
| Scripts extraction SDK/Pong | SDK teste seulement son contrat ; Pong teste un tarball installé hors dépôt, sans liens vers le node_modules plateforme. |
| Next | Conserve la configuration existante du package et le lazy loading. Aucun chemin source SDK/Pong requis par le bundler. |
| Lockfiles / workspaces / exclusions TS | Références locales conservées uniquement pour l'installation transitoire, à retirer lors de la vraie bascule Git Pong. |

Les chaînes de routes `/games/chibasko-pong/...` dans les scénarios produit et les
chemins synthétiques dans les tests de frontières ne sont pas des imports source.
Aucune modification de la physique, du rendu, du CSS, des inputs, des règles ou
des capacités n'est nécessaire à cette extraction.

## Package et exports

| Export public | Contenu |
| --- | --- |
| `@chibaskogames/chibasko-pong` | Définition portable, integrationVersion 1, online public/private et local, deux joueurs. |
| `/client` | Composant React online, `gameId`. |
| `/local` | Composant React local, `gameId`, sortie via callback hôte. |
| `/server` | Driver SDK `pongServerModule`, `PongState`. |
| `/shared` | Constantes, modèle, simulation pure. |

ESM ES2022 et déclarations TypeScript. Le CSS Module est copié dans dist ;
`sideEffects: ["**/*.css"]` protège son inclusion. Aucun asset/font/CSS plateforme,
Next, auth, Supabase, Colyseus Room/Client ou endpoint n'est importé par Pong.
Le serveur utilise légitimement `@colyseus/schema@5.0.36` ; le graphe du bundle
client/local est vérifié pour exclure schema et les modules serveur.

### Dépendances

- SDK : peer **exact 0.1.0**, fourni explicitement par la plateforme/backend.
  DevDependency Git `git+https://github.com/Chibasko06/chibasko-games-sdk.git#v0.1.0`
  pour le build autonome et la préparation d'une installation Git.
  Le lockfile fige `7bc73cc335e7dbd52b411a751fcc689969c5a5d4`.
  Aucun SDK local, embarqué dans dist, ou seconde implémentation runtime.
- React : peer optionnel `^19.0.0`, devDependency de build/test. L'hôte React le
  fournit ; root/shared/server n'en ont pas besoin. React n'est pas bundlé.
- Schema : dépendance runtime serveur. Le package unique installe cette petite
  dépendance même chez un consommateur client, mais ne l'inclut pas au bundle web.
- Outils : TypeScript, ReactDOM/types et jsdom déclarés dans le package autonome.

## Build et prepare

Depuis la copie autonome, avec Node 24 et accès Git en lecture au SDK privé :

```sh
npm ci
npm run build
npm run typecheck
npm test
npm pack
```

`prepare: npm run build` produit tous les exports et le CSS. Dist n'est pas
versionné. Pour une dépendance Git, npm installe aussi les devDependencies avant
prepare puis empaquette ; le build est constitué de scripts Node portables.
Ne pas utiliser `--ignore-scripts` pour une installation Git sans dist.
Référence : [cycle prepare npm](https://docs.npmjs.com/cli/v11/using-npm/scripts/).

Windows a été exécuté. Linux n'a pas été exécuté dans cette phase. Aucun commit
n'étant autorisé et aucun dépôt/tag Pong n'existant encore, **une installation Git
réelle de Pong reste à tester après sa création**. La chaîne actuelle prouvée est :
copie autonome → npm ci → SDK Git privé réel → prepare → build → tarball → hôtes.
Une installation tarball utilise le dist déjà généré et ne requiert pas les outils
de build Pong. Les installations depuis Git exigeront l'accès aux deux dépôts privés.

## Tests et preuves reproductibles

Dans Pong : moteur/règles, parité online/local sur deux matchs complets, inputs
stricts, abandons, contrôles clavier/tactiles, reset/focus/visibility/cleanup,
budget responsive, hôte React sans plateforme, frontières et CSS autonome.
Le test Playwright est optionnel et ignoré si le navigateur/outillage est absent.

Dans la plateforme :

```sh
# Chemin explicite optionnel si le tarball n'est pas à l'emplacement sœur attendu.
npm run test:pong-extraction -- /chemin/chibaskogames-chibasko-pong-0.1.0.tgz
npm run test:pong-platform -- /chemin/chibaskogames-chibasko-pong-0.1.0.tgz
```

`test:pong-extraction` crée un véritable projet temporaire extérieur au dépôt,
installe tarball + SDK Git, vérifie root/server/shared sans React, puis les cinq
exports/types dans un hôte React/jsdom. Il bundle client/local, contrôle l'absence
du serveur/schema, inspecte le tarball et scanne le contenu réellement distribué.
Il ne réutilise pas les dépendances par symlink. Rapports dans le dossier temporaire.

`test:pong-platform` installe le tarball dans un préfixe de preuve, puis copie les
seuls fichiers distribués aux emplacements node_modules web/backend comme des
installations normales. Il remplace temporairement les références du manifeste,
désactive le workspace, masque tous les fichiers du dossier source (les dossiers
vides restent en place sous Windows), et appelle les validations SDK/plateforme :
TypeScript, tests produit, SDK, admission/session, réseau deux clients, public/privé,
résultats, WAITING, deuxième partie, manifeste, boundaries, Next puis Cloudflare local.
Les lockfiles existants du SDK restent contrôlés ; les lockfiles Pong définitifs
seront régénérés par npm lors de la vraie bascule Git. Un finally restaure les
fichiers, installations et manifests d'origine, même en cas d'erreur.
Rapports ignorés dans `node_modules/.cache/pong-package-proof-*`.

Le tarball contient **40 fichiers**, environ 19 Ko compressés : package.json,
README, CHANGELOG, JavaScript/déclarations de dist et le CSS. Aucun test, source,
cache, node_modules, historique Git, secret ou fichier plateforme.

### Résultats de cette phase

- Copie sœur : npm install puis **npm ci**, prepare, build et typecheck réussis.
- Tests Pong : **20 réussis**, un layout Playwright optionnel ignoré faute de
  Playwright installé. Pas de test visuel sur téléphone réel ni d'exécution Linux.
- Tarball : **40 fichiers**, 19 069 octets compressés, 67 652 décompressés ;
  SHA-1 npm `bd9a1b1a5086c85a33f19fde181e6bbeaae1aa2e`.
- Consommateur extérieur : cinq exports, types, serveur sans React, hôte React
  local/online, graphe browser sans schema/serveur, scan du contenu : réussis.
- Plateforme sans fichiers Pong locaux : TypeScript ; **24 tests SDK/session +
  33 tests produit/local** ; manifeste et boundaries : réussis.
- Backend sur tarball : build et **32 tests** réussis, notamment health,
  admissions, publics/privés, concurrence, sécurité et réseau deux clients.
  Deux parties finies au score, résultats identiques, WAITING et deuxième partie ;
  une troisième admission vérifie l'abandon. Identités de test contrôlées, pas
  de nouvelle recette manuelle avec des comptes réels pendant cette phase.
- Next Webpack : réussi ; Cloudflare local réussi à partir de ce build frais
  (`--skipNextBuild`). Avertissements habituels OpenNext Windows/middleware Node.
- Script de consommation SDK adapté : ses quatre exports/types restent valides.
- Lint ciblé, scan des 40 fichiers source autonomes + tarball + diff et
  `git diff --check` : réussis.
- Empreintes comparées avant/après : **22 fichiers runtime/build inchangés** ;
  toutes les sources client/local/server/shared/définition/index de la copie sœur
  sont identiques octet pour octet. Les changements concernent packaging, tests,
  scripts et documentation.
- Installations locales originales restaurées. Un ancien cache caché
  `games/chibasko-pong/node_modules/.package-lock.json` référençait encore le SDK
  local supprimé ; mis de côté dans le cache ignoré, sans modifier les lockfiles
  publics du SDK. npm list web/backend/Pong affiche maintenant SDK 0.1.0 correctement.

Ces preuves portent sur le **package externe empaqueté** et le vrai SDK Git.
Elles ne prétendent pas prouver une installation Git Pong inexistante ni l'accès
des futurs runners Cloudflare aux repositories privés.

## Inventaire exact du futur dépôt

Copier les fichiers ci-dessous, pas `dist`, `node_modules` ni les tarballs générés.
Ils sont déjà présents dans la copie sœur autonome :

```text
.gitignore
CHANGELOG.md
README.md
package.json
package-lock.json
definition.ts
index.ts
tsconfig.json
tsconfig.client.json
tsconfig.runtime.json
tsconfig.server.json
tsconfig.shared.json
client/css.d.ts
client/index.ts
client/PongCanvas.tsx
client/PongGame.tsx
client/pong.module.css
client/pongControls.ts
client/pongLayout.ts
client/pongPresentation.ts
client/pongRenderer.ts
client/pongView.ts
local/index.ts
local/localRuntime.ts
local/PongLocalControls.tsx
local/PongLocalGame.tsx
server/index.ts
server/PongRoom.ts
server/PongState.ts
shared/simulation.ts
scripts/build.mjs
scripts/check-boundaries.mjs
tests/connection.mjs
tests/controls.test.mjs
tests/css-loader.mjs
tests/driver-parity.test.mjs
tests/engine.test.mjs
tests/host.test.mjs
tests/layout.test.mjs
tests/local-runtime.test.mjs
```

## Vraie bascule future (non exécutée)

1. Créer le dépôt GitHub **privé** `Chibasko06/chibasko-pong` à partir de cette copie.
2. Revoir les fichiers ; créer un commit en français et le tag `v0.1.0` immuable.
3. Tester depuis un projet vierge l'installation Git réelle de Pong, avec SDK Git
   explicitement fourni à la même version ; vérifier SHA, prepare et exports.
4. Remplacer les deux dépendances Pong par
   `git+https://github.com/Chibasko06/chibasko-pong.git#v0.1.0`, supprimer le seul
   workspace restant, régénérer les deux lockfiles via npm et vérifier les SHA.
5. Refaire les validations plateforme, supprimer alors le dossier local Pong et
   ses exclusions devenues inutiles ; conserver les tests d'intégration publics.
6. Préparer séparément les credentials CI avant tout build/déploiement distant.

| Plateforme | SDK | Pong | Intégration |
| --- | --- | --- | --- |
| combinaison vérifiée par tests d'intégration | 0.1.0 / v0.1.0 | 0.1.0 / futur v0.1.0 | 1 |

Les versions package et integrationVersion sont indépendantes. Pendant le 0.x,
mettre à jour cette combinaison explicitement et vérifier le SDK peer unique.

## Deux dépendances Git privées : blocage opérationnel CI

La réussite locale utilise les identifiants Git du poste. L'intégration GitHub
Cloudflare de la plateforme ne garantit pas l'accès aux dépôts dépendants.

Pour deux dépôts privés, recommandation actuelle : **PAT GitHub finement limité**
aux seuls SDK/Pong, permission Contents en lecture, expiration et rotation,
distinct par environnement. Utiliser HTTPS avec un credential helper éphémère et,
si les lockfiles normalisent en SSH, une réécriture Git SSH→HTTPS non sensible.
Le token reste uniquement dans un secret de build ; jamais URL, package.json,
lockfile, config Git persistée, script versionné, log, NEXT_PUBLIC ou Worker runtime.
Une GitHub App à jetons courts devient préférable à plus grande échelle.

Alternative sans PAT : deux deploy keys de lecture distinctes, une par dépôt,
avec routage SSH explicite. Une même deploy key n'est pas réutilisable entre dépôts ;
c'est davantage de configuration pour notre petite installation.
Références : [PAT GitHub](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens),
[deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys).

Le secret doit être disponible **avant** l'installation automatique. Si Workers
Builds est utilisé, prévoir `SKIP_DEPENDENCY_INSTALL=1` puis bootstrap Git sécurisé
et npm ci dans la commande de build ; rétablir la vérification des clés d'hôte si
SSH est choisi. [Image de build Cloudflare](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/).
Pour toute autre CI, utiliser son mécanisme équivalent. Ne jamais supposer qu'un
script npm exécuté après npm ci peut réparer une authentification déjà échouée.

Aucun token, deploy key, secret Cloudflare ou pipeline n'est créé ici. Le build
Cloudflare **local** valide le bundling, pas cette future installation distante.
