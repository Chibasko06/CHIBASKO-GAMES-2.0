# SDK Git externe — consommation plateforme

## Source de vérité et versions

Le SDK source appartient au repository **privé**
[Chibasko06/chibasko-games-sdk](https://github.com/Chibasko06/chibasko-games-sdk).

- Package `@chibaskogames/sdk`, expérimental, version **0.1.0**.
- Tag **v0.1.0**, commit **7bc73cc335e7dbd52b411a751fcc689969c5a5d4**.
- `integrationVersion: 1`, indépendant de la version du package.
- Spécification web/backend :
  `git+https://github.com/Chibasko06/chibasko-games-sdk.git#v0.1.0`.
- Résolution des lockfiles npm :
  `git+ssh://git@github.com/Chibasko06/chibasko-games-sdk.git#7bc73cc335e7dbd52b411a751fcc689969c5a5d4`.

L'URL SSH ne contient aucun credential. Les lockfiles sont générés par npm ; ne
pas déplacer un tag existant. L'ancienne copie `packages/game-sdk` a été supprimée
après validation et n'est jamais une dépendance de fonctionnement.

Pong est également extrait : repository privé
[Chibasko06/Chibasko-Pong](https://github.com/Chibasko06/Chibasko-Pong), tag
**v0.1.0**, commit **07c23b83f6493e03113c43d1f56d21d15831c87b**.
Les sources SDK/Pong et leurs tests internes ne vivent plus dans la plateforme.
Voir [consommation et extraction Pong](pong-extraction.md).

## Consommateurs et frontières

Le web et le game-server déclarent directement le même SDK Git. Pong déclare un
peer SDK exact `0.1.0`, fourni par chaque hôte ; npm le déduplique. Son propre dépôt
possède une devDependency Git pour construire le package pendant prepare, sans
chercher un SDK non publié sur le registre npm.

Les imports plateforme restent limités aux quatre exports SDK documentés :

- racine : contrats, définitions, participants, capacités et résultats ;
- `/client` : façade d'état, révision, abonnement et messages ;
- `/react` : hook et contrats de composants React ;
- `/server` : contrat du driver, session, participants et completion.

Les adaptateurs privés connaissent Colyseus/admission/coordinateur, pas le SDK.
Le SDK ne contient ni Supabase, ni secrets, ni code Pong, ni infrastructure privée.
React reste un peer optionnel ; seuls les consommateurs de `/react` en ont besoin.

Les runtimes, productSession, registres et adaptateurs importent les exports
installés. Aucun alias TypeScript ne redirige vers une source SDK ou Pong locale.
Next n'a plus besoin de `transpilePackages` pour ces deux packages précompilés.
Les loaders littéraux client/local conservent le découpage lazy.

## Installation et vérifications

```sh
npm ci
npm --prefix game-server ci
npm list @chibaskogames/sdk @chibaskogames/chibasko-pong
npm --prefix game-server list @chibaskogames/sdk @chibaskogames/chibasko-pong
npm run test:sdk
npm run test:sdk-extraction
npm run test:pong-extraction
npm run test:pong-platform
```

Les deux installations ci exigent les credentials Git du poste ou du runner.
prepare doit pouvoir s'exécuter pour générer les distributions Git. Les packages
sont installés normalement dans node_modules, sans liens vers une copie locale.
Ne pas copier un node_modules d'une autre machine comme méthode d'installation.

| Script | Responsabilité |
| --- | --- |
| `build:sdk` | Vérifie les exports, version et commit du SDK installé ; aucun build de source SDK. |
| `build:pong` | Même vérification de Pong Git et de son SDK partagé avec l'hôte. |
| `check:game-boundaries` | Analyse JS/types installés et imports plateforme ; bloque les internes et dépendances inversées. |
| `test:sdk-extraction` | Repackage le SDK installé, installe son tarball hors dépôt, vérifie ses quatre exports/types et les imports sans React. |
| `test:pong-extraction` | Installe SDK/Pong depuis leurs vrais tags Git dans un projet extérieur ; exports/types, hôte React, serveur sans React, bundle et scan du contenu. |
| `test:sdk-platform` / `test:pong-platform` | Vérifient l'installation réelle puis TypeScript, produit, admission/session/réseau, manifeste, boundaries, Next et Cloudflare local. |

Les unit tests SDK appartiennent au dépôt SDK ; physique/contrôles/parité Pong au
dépôt Pong. Les tests d'intégration plateforme et de contrats publics restent ici,
dont la preuve d'un second jeu factice sans score ni état spécifique à Pong.
Les fixtures n'exposent jamais de réservation, transport brut ou API completion au
client du jeu. Les rapports temporaires sont ignorés par Git.

Sur Windows, les validations complètes utilisent un build Next Webpack frais avec
sortie standalone puis `build:cloudflare -- --skipNextBuild`. L'option ne réutilise
pas un ancien build non validé. Aucun script ne publie ni ne déploie.

## CI/Cloudflare : prérequis opérationnel restant

**Un build Cloudflare local réussi ne valide pas l'accès Git privé d'un runner.**
Celui-ci doit lire les dépôts SDK et Pong avant npm ci, y compris pendant les
préparations transitives. Le checkout GitHub de la plateforme n'accorde pas
automatiquement cet accès aux dépendances.

Pour deux dépôts à notre taille : **PAT fine-grained limité aux deux repositories,
Contents en lecture seule**, expiration/rotation, secret de build distinct par
environnement. Fournir l'accès via un credential helper HTTPS éphémère ; les URLs
SSH des lockfiles peuvent nécessiter une réécriture Git SSH→HTTPS non sensible.
Jamais de token dans une URL, package.json, lockfile, script, log ou variable publique.

Deux deploy keys de lecture constituent une alternative avec deux identités/routage
SSH. Une GitHub App apporte des jetons courts et une identité indépendante d'un
compte personnel pour une intégration plus durable ; elle est plus lourde à mettre
en place aujourd'hui. Ne pas réutiliser une deploy key entre repositories.

Avec Workers Builds, prévoir `SKIP_DEPENDENCY_INSTALL=1`, bootstrap Git sécurisé,
puis npm ci. Dans une autre CI, fournir le même accès avant l'installation. Retirer
les credentials temporaires après usage ; ne pas les exposer aux builds non fiables.
Un NPM_TOKEN de registre ne donne pas accès à une dépendance Git privée.

Références : [PAT GitHub](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens),
[deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys),
[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/).
La comparaison et les contraintes détaillées sont dans [extraction Pong](pong-extraction.md).

Aucun token, clé, secret Cloudflare, configuration CI, remote, commit, push ou
déploiement n'est créé par cette bascule. L'accès privé du runner reste à préparer
et tester séparément avant le prochain déploiement.
