# PONG-EXTRACT-1 — autonomie de Chibasko Pong

## Audit et frontière obtenue

| Catégorie | Avant | Après |
|---|---|---|
| A — code du jeu | Règles, contrôles, canvas, interpolation, runtime local | Conservés dans le package, sans changement de règles |
| B — SDK | Contrats root/client/react/server | Peer dependency explicite @chibaskogames/sdk |
| C — infrastructure générique | @colyseus/schema pour PongState | Dépendance serveur seulement ; aucune Room Colyseus dans le driver |
| D — plateforme | next/image ; sources serveur dans game-server | img web ; sources regroupées dans le jeu ; installation privée extérieure |
| E — visuel implicite | Tailwind, preflight, police/couleur du body | CSS Module : reset, palette, typographie, états, responsive et reduced-motion |

Aucun import Auth, Supabase, app/, lib/, components/ plateforme, alias @/,
variable d'environnement plateforme, GameAdmission, LobbyRoom ou coordinateur
n'existait dans le driver SDK. Ces dépendances restent interdites.

Assets : Canvas, contrôles Unicode, aucun son/image/font à copier. Les avatars
online sont des URLs publiques fournies explicitement par l'état SDK ; img portable
avec largeur/hauteur, lazy loading et no-referrer. Aucun chemin d'asset privé,
optimizer Next ou font loader. Le CSS nomme les mêmes polices système que le site.

## Structure et exports

```text
games/chibasko-pong/
  package.json                 @chibaskogames/chibasko-pong, privé
  index.ts, definition.ts       définition portable
  shared/simulation.ts         moteur unique, pur, inchangé
  client/                      rendu online + CSS Module
  local/                       boucle et contrôles deux joueurs
  server/                      driver SDK, PongState, index
  scripts/build.mjs            TypeScript et copie du CSS
  tsconfig*.json               configurations indépendantes
  tests/                       règles, parité, local, hôte React minimal
  dist/                        JS ESM, déclarations, CSS (généré/ignoré)
```

| Export | Contenu |
|---|---|
| @chibaskogames/chibasko-pong | pongDefinition, sans React/Node/transport |
| /client | default composant online + gameId, façade SDK fournie par l'hôte |
| /local | default composant local + gameId, callback onExit fourni par l'hôte |
| /server | pongServerModule et PongState, sans adaptateur privé |
| /shared | modèle, constantes, simulation et stepper purs |

Pas de wildcard d'exports ni de chemins privés autorisés. sideEffects conserve
le CSS dans les bundlers. Le CSS est chargé automatiquement par les composants ;
l'hôte doit supporter les CSS Modules. Les directives use client sont conservées
pour Next, sans import/dépendance Next.

Le sous-package historique pong-engine disparaît : /shared expose le même moteur.
Les sources serveur ont changé de dossier et d'imports, pas de comportement.
Le roomType pong, la création de Room et l'installation restent privés à la plateforme.
PongState conserve gameId/status/expectedPlayers pour les outils existants ;
ces champs n'introduisent aucune dépendance vers les internes plateforme.

## Installation et builds

Dans ce repository, seul Pong devient un workspace npm. Cela installe ses
dépendances et partage React avec son hôte. Le SDK vient maintenant du repository
privé Chibasko06/chibasko-games-sdk, v0.1.0, consommé par Git avec un SHA figé.
Voir [distribution SDK et accès CI](sdk-extraction.md). Aucun orchestrateur ou
registry supplémentaire n'est nécessaire.

```sh
# Racine du repository : lockfile existant
npm ci
npm run build:sdk
cd games/chibasko-pong
npm run build:shared
npm run build:server
npm run build:client
npm run typecheck
npm test
# Ou cibles autonomes : npm run test:shared / test:server / test:client
```

build exécute les trois cibles ; test reconstruit seulement Pong. Aucun build
Next, Auth, secret ou serveur requis. Les tests utilisent Node/jsdom ; leur seul
loader simule un CSS Module pour Node. Le navigateur utilise le CSS livré.
host.test.mjs monte local et online SDK, vérifie clavier, neutralisation, sortie
et cleanup sous StrictMode, en interdisant réseau/WebSocket. Les tests physiques
et de parité appartiennent au jeu ; les anciennes suites plateforme y délèguent.

build:server ne compile pas le client et ne nécessite pas React. Le moteur se
construit sans SDK/DOM/Node dans sa configuration ES2022. La cible interne runtime
compile le runtime local pur pour la parité game-server, sans renderer React.
Les tests réseau restent des tests d'intégration plateforme.

Après copie dans un autre repository, fournir un SDK déjà compilé :

```sh
# Archive locale fournie, jamais un registry fictif
npm install --no-save /chemin/vers/chibaskogames-sdk-0.1.0.tgz
npm run build
npm run typecheck
npm test
```

Cela fournit le peer SDK et installe les dépendances génériques du jeu. Aucun
chemin relatif vers le SDK du repository principal n'est inscrit dans Pong.
Créer un lockfile propre au futur repository après choix de la distribution SDK ;
aujourd'hui le lock workspace principal reste l'autorité locale.

## Preuve d'extractabilité

npm run test:pong-extraction copie les sources Pong dans un dossier temporaire
hors du repository, sans dist/node_modules. Il fournit seulement le SDK compilé
et les bibliothèques génériques déclarées déjà installées. Il construit et teste
shared avant même de fournir le SDK/schema/React, puis construit et typechecke
le serveur sans React, et enfin construit/typechecke
l'ensemble et lance les dix tests autonomes. Aucun app/, game-server/, alias
Next, configuration, token ou secret fourni. Les bibliothèques sont réutilisées
par liens locaux, sans téléchargement. Cleanup après vérification stricte du chemin.

tests/pong-layout.test.mjs vérifie dix combinaisons online/local × 1366×768,
1440×900, 390×844, 768×1024 et 844×390. Fixtures HTML isolées, vrais composants/CSS,
jamais le site ou les comptes. Captures générées sous .next/, non versionnées.
Six autres combinaisons online/local × desktop/portrait/paysage vérifient un
hôte HTML clair, sans aucun CSS global/Tailwind, et la surface/police du jeu.
Cela ne remplace pas un téléphone physique.

## Consommation et frontières

- Registres client/local : imports dynamiques littéraux des exports /client et
  /local, toujours lazy. Aucun import d'un fichier privé de Pong.
- GameRegistry : définition root. Registration : module /server branché par
  l'adaptateur Colyseus privé existant.
- Moteur : seulement ses propres imports relatifs purs.
- Jeu : son code, SDK, React côté client/local, schema côté serveur.
- Scripts/tests : bibliothèques génériques et Node, sans internes hôte.
- Plateforme : exports publics du package, pas de deep import source.
- CSS : ni Tailwind, ni import global, ni variable d'hôte non déclarée.

npm run check:game-boundaries contrôle ces frontières et refuse les imports
dynamiques calculés dans les jeux. Aucun changement SDK requis.

## Distribution future du SDK

Recommandation quand le contrat sera prêt : npm public versionné, exports et
déclarations actuels, artefacts construits et tests de compatibilité. Semver décrit
la version du package ; integrationVersion=1 reste la compatibilité du contrat.

GitHub Packages convient si le SDK doit rester privé, avec credentials/configuration
registry pour les consommateurs. Git par tag/SHA est acceptable provisoirement,
avec artefacts construits ou build documenté, sans sources privées de plateforme.
Le SHA est reproductible ; les tags doivent rester immuables. Aucun mécanisme
distant n'est installé ou publié ici.

Copier Pong aujourd'hui avec le SDK fourni ne casse rien de structurel : restent
les prérequis normaux (Node/outillage, React 19 pour le rendu, CSS Modules et
schema pour le serveur), ainsi que son installation/enregistrement par l'hôte.
La distribution SDK est désormais Git privé v0.1.0 ; l'extraction réelle nécessite
encore le build automatique de Pong à son installation, son accès de build au SDK,
un nouveau lockfile et l'adaptation des scripts hôtes liés à sa source locale.
Pas de modification gameplay ou de services privés à
recréer dans Pong. Même SDK ne signifie jamais même niveau de confiance tiers.

Ni publication catalogue, ni déploiement, ni serveur tiers, ni nouveau SDK.

## Inventaire des fichiers de cette phase

Les anciens fichiers serveur sont deplaces dans le package ; le moteur shared est inchange.

- `.gitignore`
- `docs/game-sdk.md`
- `docs/internal-multiplayer-games.md`
- `docs/online-access.md`
- `game-server/PRODUCTION.md`
- `game-server/README.md`
- `game-server/package-lock.json`
- `game-server/package.json`
- `game-server/src/games/chibasko-pong/PongRoom.ts` (ancien emplacement supprime)
- `game-server/src/games/chibasko-pong/PongState.ts` (ancien emplacement supprime)
- `game-server/src/games/chibasko-pong/definition.ts` (ancien emplacement supprime)
- `game-server/src/games/chibasko-pong/register.ts` (ancien emplacement supprime)
- `game-server/src/games/registerInternalGames.ts`
- `game-server/src/games/registry.ts`
- `game-server/tests/lobby-game-bridge.test.ts`
- `game-server/tests/pong-local-parity.test.ts`
- `game-server/tests/pong-network.test.ts`
- `game-server/tests/pong.test.ts`
- `games/chibasko-pong/README.md`
- `games/chibasko-pong/client/PongCanvas.tsx`
- `games/chibasko-pong/client/PongGame.tsx`
- `games/chibasko-pong/client/pong.module.css`
- `games/chibasko-pong/client/pongPresentation.ts`
- `games/chibasko-pong/client/pongRenderer.ts`
- `games/chibasko-pong/local/PongLocalControls.tsx`
- `games/chibasko-pong/local/PongLocalGame.tsx`
- `games/chibasko-pong/local/localRuntime.ts`
- `games/chibasko-pong/shared/package.json` (ancien emplacement supprime)
- `games/chibasko-pong/shared/tsconfig.json` (ancien emplacement supprime)
- `games/clientRegistry.ts`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `scripts/check-game-boundaries.mjs`
- `tests/game-sdk.test.mjs`
- `tests/multiplayer-product.test.mjs`
- `tests/pong-layout.test.mjs`
- `tests/pong-local.test.mjs`
- `tests/product-register.mjs`
- `tests/register.mjs`
- `tsconfig.json`
- `docs/pong-extraction.md`
- `games/chibasko-pong/client/css.d.ts`
- `games/chibasko-pong/client/index.ts`
- `games/chibasko-pong/definition.ts`
- `games/chibasko-pong/index.ts`
- `games/chibasko-pong/local/index.ts`
- `games/chibasko-pong/package.json`
- `games/chibasko-pong/scripts/build.mjs`
- `games/chibasko-pong/server/PongRoom.ts`
- `games/chibasko-pong/server/PongState.ts`
- `games/chibasko-pong/server/index.ts`
- `games/chibasko-pong/tests/css-loader.mjs`
- `games/chibasko-pong/tests/driver-parity.test.mjs`
- `games/chibasko-pong/tests/engine.test.mjs`
- `games/chibasko-pong/tests/host.test.mjs`
- `games/chibasko-pong/tests/local-runtime.test.mjs`
- `games/chibasko-pong/tsconfig.client.json`
- `games/chibasko-pong/tsconfig.json`
- `games/chibasko-pong/tsconfig.runtime.json`
- `games/chibasko-pong/tsconfig.server.json`
- `games/chibasko-pong/tsconfig.shared.json`
- `scripts/test-pong-extraction.mjs`
