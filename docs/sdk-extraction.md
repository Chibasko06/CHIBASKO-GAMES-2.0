# SDK Git externe — consommation plateforme

## Source de vérité et résolution

Le SDK source appartient au repository **privé**
[Chibasko06/chibasko-games-sdk](https://github.com/Chibasko06/chibasko-games-sdk).

- Package : `@chibaskogames/sdk`, expérimental, version **0.1.0**.
- Tag : **v0.1.0**.
- Commit : **7bc73cc335e7dbd52b411a751fcc689969c5a5d4**.
- `integrationVersion` : **1**, indépendante de la version du package.
- Dépendance dans les deux package.json :
  `git+https://github.com/Chibasko06/chibasko-games-sdk.git#v0.1.0`.
- npm a généré dans les deux lockfiles :
  `git+ssh://git@github.com/Chibasko06/chibasko-games-sdk.git#7bc73cc335e7dbd52b411a751fcc689969c5a5d4`.

L'URL résolue SSH n'est pas un credential. Les lockfiles sont générés par npm et
conservent le commit ; ne pas déplacer un tag de release existant.
L'ancienne copie `packages/game-sdk` a été supprimée seulement après validation
de TypeScript, tests web/serveur/réseau, Next et Cloudflare local avec son
implémentation temporairement indisponible. Le probe optionnel du script de
validation peut encore masquer une ancienne copie si elle est réintroduite ;
il ne s'agit pas d'une dépendance de fonctionnement.
Le SDK s'installe dans node_modules comme un vrai package, sans junction vers une
source locale. Le SDK livré fournit déjà son JavaScript ESM ES2022 et ses types,
sans dépendance runtime obligatoire. React reste un peer optionnel de /react.

## Consommateurs audités

Les seuls installateurs directs sont `package.json` et `game-server/package.json`,
avec leurs deux lockfiles. Pong déclare le peer SDK exact `0.1.0`, fourni par
l'hôte. Depuis sa préparation d'extraction, son build autonome possède aussi une
devDependency vers le même SDK Git privé ; son lockfile fige le même commit.

Imports applicatifs, tous via les exports documentés du package :

```text
components/multiplayer/GameRuntime.tsx
components/multiplayer/LocalGameRuntime.tsx
games/clientRegistry.ts
lib/lobbyGameSession.ts
lib/multiplayer/catalogue.ts
lib/multiplayer/gameClientModule.ts
lib/multiplayer/gameLaunchOptions.ts
lib/multiplayer/gameSessionMetadata.ts
game-server/src/games/types.ts
game-server/src/games/registerInternalGames.ts
game-server/src/platform/multiplayer/GameResult.ts
game-server/src/platform/multiplayer/internalGameAdapter.ts
game-server/src/platform/multiplayer/colyseusGameAdapter.ts
games/chibasko-pong/definition.ts
games/chibasko-pong/client/PongGame.tsx
games/chibasko-pong/client/pongPresentation.ts
games/chibasko-pong/local/PongLocalGame.tsx
games/chibasko-pong/server/PongRoom.ts
```

Consommateurs de tests : `tests/game-sdk.test.mjs`, `tests/multiplayer-product.test.mjs`,
`tests/fixtures/sdk-consumer/contracts.ts`, `games/chibasko-pong/tests/host.test.mjs`,
et `game-server/tests/{internal-game-sdk,internal-game-module,lobby,public-lobbies}.test.ts`.
Les scripts concernés sont classés ci-dessous. Aucun alias TypeScript ne redirige
le SDK vers une source locale ; web, game-server et Pong résolvent node_modules.

## Scripts conservés et adaptés

| Outil | Décision |
| --- | --- |
| `build-game-sdk.mjs` / `build:sdk` | Adapté : vérifie les exports installés, leur version et la résolution Git. Ne compile plus de source SDK. Nom conservé pour les précommandes existantes. |
| `check-game-boundaries.mjs` | Adapté : inspecte le dist installé, JS et déclarations. Aucun SDK source local requis. Les frontières Pong/plateforme restent contrôlées. |
| `test-sdk-extraction.mjs` | Repackage le SDK installé sans prepare, installe son tarball hors repository et vérifie ses quatre entrées/types. Les tests propres à Pong vivent désormais dans le jeu, sans duplication ici. |
| `test-sdk-platform.mjs` | Adapté : teste l'installation Git réelle, les versions et SHA des deux consommateurs, puis les tests web/serveur, Next et le bundle Cloudflare local. Cache toute ancienne implémentation locale pendant la validation et restaure dans finally. |
| `test-pong-extraction.mjs` | Installe le tarball Pong et le SDK Git réel dans un projet extérieur ; vérifie exports, types, hôte React et frontières navigateur/serveur. Voir [extraction Pong](pong-extraction.md). |
| `generate-game-manifest.mjs` | Conservé : lit le registre serveur et les exports publics de Pong ; aucune source SDK locale. |
| Unit tests/builds source SDK | Responsabilité du repository SDK séparé. Les tests d'intégration plateforme et de contrats publics restent ici. |

Next ne nécessite plus le SDK dans transpilePackages, puisqu'il est précompilé.
Pong y reste jusqu'à sa propre extraction ; son chargement demeure lazy.

## Validation locale

```sh
npm ci
npm --prefix game-server ci
npm list @chibaskogames/sdk
npm --prefix game-server list @chibaskogames/sdk
npm run test:sdk-platform
npm run test:sdk-extraction
```

Les deux installations ci nécessitent des credentials Git du poste. Ne jamais
copier un node_modules provenant d'une autre machine à la place de cette installation.
`test:sdk-platform` vérifie le SHA attendu, rend une éventuelle ancienne copie locale
inutilisable pendant les validations, puis la restaure. Ses rapports sont dans
`node_modules/.cache/sdk-git-proof-*`, ignoré par Git. Il exécute le build Next,
puis `build:cloudflare -- --skipNextBuild` pour empaqueter ce build frais avec
OpenNext. Il ne lance ni publication ni déploiement.

`test:sdk-extraction` conserve ses preuves dans un dossier temporaire système.
Sa fixture de contrats types appartient à la plateforme ; elle vérifie notamment
qu'un client ne reçoit ni API completion, ni transport brut, ni détails d'admission.
Le test utilise de vraies installations npm, sans liens vers les node_modules du
repository. `-- --offline` est possible si le cache npm contient les outils génériques.

## Cloudflare/CI : prérequis restant avant déploiement

**Un build Cloudflare local réussi n'est pas une preuve d'installation dans le cloud.**
Le poste possède déjà des credentials ; un runner distant ne doit pas être supposé
avoir accès au repository privé parce qu'il peut cloner la plateforme.

Recommandation pour ce seul repository dépendant : une **deploy key SSH dédiée,
en lecture seule**, sur le repository SDK. Cela correspond à la résolution SSH
réellement écrite par npm. La clé privée doit être un secret du build, jamais une
variable publique Next, un secret runtime Worker, un fichier versionné ou un log.
La clé publique s'autorise sur GitHub ; seule la clé privée reste dans le stockage
de secrets du build. Aucune clé n'est créée par cette phase.

Avec l'ajout prochain du dépôt Pong privé, privilégier pour notre taille un PAT
finement limité en lecture aux deux dépôts, ou deux deploy keys distinctes ; le
choix et le bootstrap avant npm ci sont décrits dans [extraction Pong](pong-extraction.md).

Configuration future à effectuer séparément :

1. Autoriser cette clé en lecture seule sur le repository SDK.
2. Enregistrer la clé privée comme **secret de build** dans l'environnement qui
   installe les dépendances ; ne pas l'exposer aux builds de code non approuvé.
3. Avant npm ci, installer éphémèrement la clé avec des permissions restrictives,
   configurer SSH pour n'utiliser que cette identité et vérifier la clé d'hôte
   GitHub à partir d'une référence officielle. Ne pas désactiver cette vérification.
4. Si Workers Builds installe les dépendances avant la commande personnalisée,
   utiliser sa variable `SKIP_DEPENDENCY_INSTALL=1`, puis faire le bootstrap SSH
   **avant** npm ci dans la commande contrôlée. Ce paramètre n'est pas modifié ici.
5. Installer, construire, retirer les fichiers de credential temporaires et
   vérifier que les bundles ne contiennent aucun credential de build.
6. Valider ce chemin sur le vrai environnement avant le prochain déploiement.

Un simple NPM_TOKEN ou une ligne d'authentification de registre ne fournit pas
l'accès à une dépendance Git SSH. Si plus tard plusieurs repositories privés sont
nécessaires, réévaluer GitHub App ou accès HTTPS à plusieurs repos plutôt que de
réutiliser une même deploy key sur plusieurs repositories.

Références : [deploy keys GitHub](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys),
[image Workers Builds et installation personnalisée](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/),
[variables et secrets de build](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).
Cette recommandation vise Workers Builds ; si le build est exécuté dans une autre
CI, fournir le même accès avant l'installation dans cette CI.

## Extraction Pong suivante

Le SDK externe peut servir à préparer l'extraction de Pong après validation de
ces consommateurs. Cela ne rend pas automatiquement le package Pong installable
depuis Git : son package doit encore produire dist à l'installation, obtenir le
SDK privé pour son propre build sans chercher son peer non publié sur npm, et
la plateforme doit arrêter de compiler ou tester des chemins source Pong locaux.
Le manifeste, le workspace et les wrappers de tests liés à ces chemins devront
être adaptés lors de cette phase distincte. Aucun de ces changements n'est fait ici.

Le SDK reste expérimental, private:true et UNLICENSED dans son propre repository.
Le SDK et Pong source ne sont pas publiés, aucun nouveau jeu ou comportement
public/private/local n'est ajouté par cette migration.

## Résultats de la bascule

- Installation Git réelle : racine et game-server, même version 0.1.0, même SHA
  7bc73cc335e7dbd52b411a751fcc689969c5a5d4 ; les deux installations sont des dossiers
  ordinaires dans node_modules, pas des liens vers une source locale.
- TypeScript web et serveur : OK ; tests web/session/local : 28 ; tests produit/
  React/lazy/public/privé/local : 41 ; tests serveur concernés : 38, tous réussis.
- Le réseau inclut deux parties complètes avec score/résultat, WAITING et replay,
  puis abandon ; admissions, expiration, Origins HTTP/WS, health et module factice
  passent également. Aucune modification du moteur ou du protocole Pong.
- Next build Webpack : OK ; deux chunks lazy Pong distincts toujours présents.
- Cloudflare local : OK, OpenNext bundle après le build Next frais via
  --skipNextBuild ; les fallbacks d'environnement privés sont filtrés par le script
  existant. Aucun déploiement. Avertissements Windows et middleware Node OpenNext
  conservés ; ce test ne prouve pas un runtime Cloudflare distant.
- Consommateur isolé : quatre exports et types, sans React pour root/client/server,
  puis /react avec React ; Pong hors repository : build/typecheck et 10 tests OK
  contre le SDK Git installé reconditionné en tarball (11 fichiers).
- Une ancienne sortie générée Next dev syntaxiquement invalide a été mise de côté
  sous node_modules/.cache ; aucun fichier applicatif n'a été modifié pour cela.
- Les refus EACCES du réseau loopback sous sandbox ont nécessité l'exécution des
  tests réseau hors sandbox. Leurs résultats réussis sont ceux retenus ici.

Le build cloud depuis une installation vierge reste bloqué opérationnellement
tant que l'accès Git privé décrit ci-dessus n'a pas été fourni et validé.
Les validations locales ne créent ni token, ni secret Cloudflare, ni remote,
ni commit/push, ni publication SDK ou jeu.

## Fichiers de la migration

Modifiés : `.gitignore`, `package.json`, `package-lock.json`, `next.config.ts`,
`game-server/package.json`, `game-server/package-lock.json`,
`scripts/build-game-sdk.mjs`, `scripts/check-game-boundaries.mjs`,
`scripts/test-sdk-extraction.mjs`, `scripts/test-sdk-platform.mjs`,
`tests/game-sdk.test.mjs`, `docs/game-sdk.md`, `docs/internal-game-sdk.md`,
`docs/pong-extraction.md`, `docs/sdk-extraction.md`, `game-server/README.md`,
`game-server/PRODUCTION.md`, `games/chibasko-pong/README.md`.

Ajouté : `tests/fixtures/sdk-consumer/contracts.ts` (contrats publics testés sans
accès au repository source SDK). Supprimés : les 15 fichiers versionnés de
`packages/game-sdk`, sa copie locale n'étant plus une source de vérité.
Les sources gameplay/client/local/server/shared de Pong, ses package.json et
les sources runtime plateforme/game-server sont inchangés.
