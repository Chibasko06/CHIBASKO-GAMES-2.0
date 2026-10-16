# Chibasko Pong — consommation Git externe

## Source de vérité

Pong appartient au repository privé
[Chibasko06/Chibasko-Pong](https://github.com/Chibasko06/Chibasko-Pong),
package `@chibaskogames/chibasko-pong` **0.1.0**, tag **v0.1.0**, commit
**07c23b83f6493e03113c43d1f56d21d15831c87b**.

Le web et le game-server consomment exactement :

```json
"@chibaskogames/chibasko-pong": "git+https://github.com/Chibasko06/Chibasko-Pong.git#v0.1.0"
```

Les deux lockfiles npm figent le même commit, normalisé en URL Git SSH sans
credential. Ni branche flottante, ni dépendance file/workspace, ni alias TS source.
Ne pas déplacer un tag de release existant.

| Élément | Version / commit |
| --- | --- |
| SDK privé | `0.1.0`, tag `v0.1.0`, `7bc73cc335e7dbd52b411a751fcc689969c5a5d4` |
| Pong privé | `0.1.0`, tag `v0.1.0`, `07c23b83f6493e03113c43d1f56d21d15831c87b` |
| Contrat d'intégration | `integrationVersion: 1`, indépendant des versions package |
| Plateforme | combinaison contrôlée par les lockfiles et les tests d'intégration |

## Frontières et consommateurs

La plateforme ne possède plus les sources du jeu. L'ancien dossier
`games/chibasko-pong` est supprimé après validation de la dépendance Git.
Le moteur, les composants, styles, driver et tests internes sont entretenus dans
le dépôt Pong, pas dans ce dépôt ni dans une copie sœur requise par le build.

| Consommateur plateforme | Import / responsabilité |
| --- | --- |
| `games/clientRegistry.ts` | Imports dynamiques littéraux `/client` et `/local`, lazy loading conservé. |
| `game-server/src/games/registry.ts` | Définition exportée à la racine ; capacités autoritaires inchangées. |
| `game-server/src/games/registerInternalGames.ts` | `/server`, puis adaptateur privé plateforme et installation Colyseus. |
| `scripts/generate-game-manifest.mjs` | Registre installé et définition publique ; aucune lecture des sources du jeu. |
| Runtime web / lobby / SDK | Contrats publics et façade SDK ; aucune connaissance de physique Pong. |
| Tests plateforme | Registry, capacités, lancement, public/privé/local, admission, résultats/replay et réseau. |

Exports Pong autorisés : racine, `/client`, `/local`, `/server`, `/shared`.
Les deep imports internes sont interdits par le checker de frontières.
Le jeu utilise le SDK commun, React pour son rendu et `@colyseus/schema` pour son
état serveur ; aucun import plateforme, auth, Supabase, admission ou coordinateur.
Le graphe du bundle client/local ne doit pas contenir schema ni le driver serveur.

Le SDK est un peer exact `0.1.0`, fourni explicitement par chaque hôte. Une
devDependency Git dans le dépôt Pong permet de préparer le package seul.
React est un peer optionnel, non bundlé ; root/shared/server fonctionnent sans lui.
Les exports livrés sont du JavaScript ESM et des déclarations, avec CSS autonome.

## Installation et builds

Avec Node 24, npm et accès Git en lecture aux deux dépôts privés :

```sh
npm ci
npm --prefix game-server ci
npm list @chibaskogames/sdk @chibaskogames/chibasko-pong
npm --prefix game-server list @chibaskogames/sdk @chibaskogames/chibasko-pong
npm run build
npm --prefix game-server run build
```

Pong doit être un vrai dossier installé dans chaque node_modules, sans symlink
vers une source locale. `npm list` doit indiquer SDK 0.1.0 **deduped** sous Pong.
Une instance partagée par consommateur suffit ; web et backend sont deux processus
avec leurs installations indépendantes, au même SDK/commit.

Le `prepare` du dépôt Git Pong produit son dist pendant l'installation. npm
installe les outils/devDependencies nécessaires à cette préparation, dont le SDK
Git privé. Ne pas ignorer les scripts pour une installation Git sans dist.
Le build de la plateforme vérifie les exports installés, il ne compile pas Pong.
Référence : [cycle prepare npm](https://docs.npmjs.com/cli/v11/using-npm/scripts/).

Le serveur n'a pas besoin de construire Next. La préparation Git temporaire de
Pong peut construire ses exports client avec TypeScript/React, sans Next ; le
processus de jeu n'utilise que l'export serveur.

## Scripts et tests conservés

| Script | Fonction actuelle |
| --- | --- |
| `build:pong` / `scripts/build-pong.mjs` | Vérifie spec Git, version, SHA lockfile, absence de lien, exports compilés et même SDK que l'hôte. Nom historique ; aucune compilation source. |
| `test:pong-platform` | Vérifie les vraies installations Git web/backend, puis TypeScript, tests produit/SDK/backend/réseau, manifeste, boundaries, Next et Cloudflare local. Aucune substitution ni mutation des dépendances. |
| `test:pong-extraction` | Inspecte/repackage le package installé, puis installe les deux vrais tags Git dans un projet temporaire extérieur ; contrôle exports/types, hôte React, serveur sans React, bundle navigateur et contenu distribué. |
| `test:sdk-platform` | Suite d'intégration commune, avec vérification du SDK Git ; indépendante de toute source Pong. |
| `check:game-boundaries` | Analyse le SDK/Pong installés et les imports plateforme ; interdit les internes et les dépendances inversées. |
| Manifeste | Projection du registre installé : public, private, local et deux joueurs conservés. |

Les tests internes physique, moteur, contrôles et parité ne sont pas dupliqués ici.
Les tests de résultats de lobby et les tests réseau restent ici car ils vérifient
l'orchestration de la plateforme. Le scénario réseau couvre deux parties complètes,
scores/résultats identiques, retour WAITING, nouvelle GameRoom et abandon.

```sh
npm run test:pong-extraction
npm run test:pong-platform
```

Rapports locaux ignorés : `node_modules/.cache/pong-git-proof-*` et
`node_modules/.cache/sdk-git-proof-*`. Le consommateur vierge conserve son rapport
dans un dossier temporaire système. Aucun de ces rapports n'est un artefact à
versionner. Aucun compte réel, service distant métier ou publication n'est requis.

Sous Windows, la validation Next utilise Webpack et une sortie standalone fraîche
compatible Cloudflare ; OpenNext l'empaquette avec `--skipNextBuild`. Cela évite un
deuxième build Next identique. Ce test local ne prouve pas l'authentification CI ni
un déploiement distant. Les warnings Windows/middleware Node OpenNext restent ceux
de l'outillage existant.

## Audit des anciennes références

- **A — runtime/build** : les deux dépendances file et leurs entrées de lockfile
  sont remplacées par Git ; le workspace et les exclusions locales devenues inutiles
  sont retirés. Les scripts ne cherchent plus de copie sœur ni de tarball local.
- **B — tests/documentation** : les anciens scénarios d'extraction et instructions
  de compilation source sont remplacés par les vérifications du package installé.
  Le test de frontières utilise le chemin node_modules comme racine synthétique.
- **C — mentions acceptables** : le chemin supprimé apparaît dans cette note
  historique ; `/games/chibasko-pong/...` dans les tests représente une URL produit.
  Le nom scoped `@chibaskogames/chibasko-pong` est naturellement conservé.

Aucune modification de gameplay : mêmes dimensions 1000×600, moteur 30 Hz,
premier à 5, countdown/pause, inputs, interpolation, tactile, rendu et replay.
Les JS et le CSS du package Git ont été comparés aux artefacts locaux avant leur
retrait : identiques après normalisation des fins de ligne. Quatre déclarations
générées référencent `react.JSX` au lieu de `react/jsx-runtime.JSX` ; cela ne change
pas le code exécuté et reste vérifié par TypeScript.

## Résultats de la bascule finale

Les installations npm réelles ont remplacé les liens file par des dossiers Git
ordinaires pour le web et le backend. Les lockfiles figent les deux SHA ci-dessus ;
`npm list` affiche SDK 0.1.0 **deduped** sous Pong dans les deux consommateurs.

Une première validation complète a réussi avant suppression. Les **40 fichiers**
du dossier source ont ensuite été supprimés, puis les validations importantes ont
été rejouées sans ce dossier, avec les résultats suivants :

| Vérification après suppression | Résultat |
| --- | --- |
| TypeScript web | Réussi, sans cache incrémental réutilisé. |
| Tests SDK/session + produit/local | 25 + 33 = **58 réussis**. |
| Game-server TypeScript/build | Réussi. |
| Tests serveur concernés | **32 réussis**, dont registry, SDK/adaptateur, admissions, public/privé, Origins, health et shutdown. |
| Réseau deux clients | Deux parties complètes au score, mêmes résultats, WAITING/replay, puis abandon sur une nouvelle session. |
| Manifeste | Inchangé : online public/private, local, deux joueurs. |
| Boundaries | Réussies : exports publics, aucun interne plateforme dans Pong, aucun deep import applicatif. |
| Next Webpack | Réussi, sans transpilePackages Pong ; aucune ancienne source dans la sortie standalone. |
| Cloudflare local | Réussi, bundle OpenNext du build Next frais après suppression ; aucun déploiement. |
| Lint ciblé / git diff --check | Réussis. |
| Scan sécurité | Aucun credential détecté dans manifests, locks, scripts, docs, distribution et diff. |

Un projet temporaire vierge extérieur a également installé **les deux tags Git
réels**, sans copie locale : prepare/dist utilisables, cinq exports/types valides,
root/server/shared sans React, puis hôte React local/online fonctionnel. Le graphe
client/local exclut schema/serveur. Le repack du package installé contient les
40 fichiers distribuables attendus, sans sources/tests/cache/Git/secrets.

Les contrôles sont automatisés sous Windows. Aucune nouvelle recette visuelle sur
téléphone, recette manuelle à deux comptes réels ou exécution Linux n'est revendiquée.
Les warnings OpenNext Windows/middleware Node sont ceux de l'outillage existant.

Fichiers adaptés dans la plateforme :

```text
.gitignore
README.md
package.json
package-lock.json
next.config.ts
tsconfig.json
game-server/package.json
game-server/package-lock.json
game-server/README.md
game-server/PRODUCTION.md
scripts/build-pong.mjs
scripts/test-pong-extraction.mjs
scripts/test-pong-platform.mjs
tests/game-sdk.test.mjs
docs/game-sdk.md
docs/online-access.md
docs/pong-extraction.md
docs/sdk-extraction.md
```

Suppression : tout l'ancien dossier source Pong (40 fichiers suivis). Les registres,
adaptateurs, code du lobby, moteur/manifeste généré et parcours produit n'ont pas
besoin de modification. Aucun commit, push, publication ou déploiement effectué.

## CI/Cloudflare : accès aux deux dépôts privés

Une installation locale réussit grâce aux identifiants Git du poste. L'intégration
GitHub qui clone la plateforme ne garantit pas l'accès aux dépendances privées :

- `Chibasko06/chibasko-games-sdk` ;
- `Chibasko06/Chibasko-Pong`.

| Mécanisme | Compromis |
| --- | --- |
| Deux deploy keys SSH en lecture | Une clé par repo et routage SSH ; pas de dépendance à un token personnel, mais deux identités à gérer. Une clé ne se réutilise pas entre dépôts. |
| PAT fine-grained, Contents en lecture, deux repos seulement | Recommandé à notre taille : un accès HTTPS borné, expiration/rotation et secret distinct par environnement. |
| GitHub App | Identité d'installation et jetons courts, adaptée à une CI plus développée ; mise en place plus lourde aujourd'hui. |

Le PAT reste exclusivement un secret de build. Un credential helper éphémère
fournit l'accès HTTPS ; une réécriture Git SSH→HTTPS non sensible peut être requise
par les lockfiles normalisés en SSH. Ne jamais intégrer un token dans une URL,
package.json, lockfile, script, configuration persistée, log ou variable publique.
Ne pas donner ces secrets aux builds de contributions non approuvées.

Le bootstrap Git doit précéder npm ci, y compris les préparations transitives
Pong→SDK. Avec Workers Builds, prévoir `SKIP_DEPENDENCY_INSTALL=1` puis un bootstrap
contrôlé et npm ci ; avec une autre CI, utiliser son mécanisme équivalent.
Si SSH est choisi, vérifier les clés d'hôte et conserver les clés privées éphémères
avec permissions restrictives. Un NPM_TOKEN de registre ne suffit pas pour Git.

Références : [PAT GitHub](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens),
[deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys),
[image Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/).

Aucun credential, secret Cloudflare, pipeline ou déploiement n'est configuré ici.
L'accès privé du runner reste un prérequis opérationnel avant tout déploiement.
