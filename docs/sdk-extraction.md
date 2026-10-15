# Extraction du SDK commun — 0.1.0

Cette phase prépare le dépôt autonome `chibasko-games-sdk`. Aucun remote, commit, tag ou package npm n’est créé par les scripts de validation.

## Audit et décisions

Les quatre fichiers source du SDK étaient déjà indépendants de la plateforme, des jeux, de Colyseus, de Supabase et de Next.js. Ils restent inchangés. Le root contient des types et `defineGame`, `/client` et `/server` contiennent des contrats de types, `/react` contient le hook React et les contrats de modules React.

Les dépendances implicites étaient dans la livraison : absence de scripts et dépendances de développement propres, tests de plateforme non exportables, README lié au dépôt parent, builds de consommateurs pointant directement vers le dossier source. Le package utilise maintenant son propre lockfile, TypeScript et ses tests portables. Aucun code d’adaptateur privé n’est copié dans le SDK.

- Version du package : **0.1.0**, expérimentale ; protocole : **integrationVersion 1**, inchangé.
- ESM ES2022 + déclarations, sans build CJS supplémentaire.
- Aucune dépendance runtime obligatoire ; React 19 est un peer optionnel réservé à `/react`.
- TypeScript, React/ReactDOM, leurs types et jsdom sont des dépendances de développement du dépôt SDK.
- `prepare: npm run build` couvre l’installation des sources/Git et `npm pack`. Pas de `dist` versionné, pas de double build `prepack` inutile. Installer depuis Git nécessite Git, Node/npm et l’exécution des scripts de préparation. Un tarball contient déjà son build.
- `private: true` bloque seulement npm publish ; Git/tarball fonctionnent. `UNLICENSED` reste provisoire, aucune licence n’a été attribuée automatiquement.

## Fichiers exacts du futur dépôt

Copier uniquement ces 15 fichiers depuis `packages/game-sdk/`, avec leur arborescence :

Une copie de ces 15 fichiers est préparée dans le dossier frère local
`chibasko-games-sdk/`, sans initialisation Git, remote, node_modules ou build.

```text
chibasko-games-sdk/
  .gitignore
  package.json
  package-lock.json
  README.md
  CHANGELOG.md
  tsconfig.json
  tsconfig.server.json
  tsconfig.test.json
  src/
    index.ts
    client/index.ts
    react/index.ts
    server/index.ts
  tests/
    contracts.ts
    core.test.mjs
    react.test.mjs
```

Ajouter `LICENSE` seulement après décision du propriétaire, puis mettre à jour le champ `license` et la section correspondante du README. MIT, Apache-2.0 et BSD-3-Clause sont présentées comme options dans le README ; aucune n’est sélectionnée. Rendre le dépôt public sans licence ne crée pas les droits de réutilisation d’une licence open source ([explication GitHub](https://choosealicense.com/no-permission/)).

Ne pas copier `dist/`, `node_modules/`, les `.tgz`, caches, rapports de test, code de plateforme, code de Pong ou les présentes instructions internes. Le package `.gitignore` protège les artefacts et fichiers `.env` dans le futur dépôt autonome.

## Validation autonome reproductible

À la racine plateforme :

```sh
npm run test:sdk-extraction
```

Le script crée un répertoire sous le dossier temporaire système, **hors repository**. Il copie uniquement les fichiers SDK autorisés, fait une vraie installation npm, build/typecheck/tests, puis `npm pack`. Il compare l’inventaire du tarball avec les 11 fichiers autorisés et inspecte le contenu réellement installé. Il crée ensuite un consommateur isolé (sans liens vers node_modules du repository), teste les imports et types root/client/server sans React, puis `/react` avec React. Enfin il copie Pong, installe le tarball et ses dépendances déclarées, exécute build/typecheck et ses 10 tests. Les fichiers de preuve restent dans le temporaire, avec un `report.json` indiquant chemins et intégrité du tarball. `-- --offline` permet de réutiliser un cache npm déjà complet.

Le futur dépôt seul s’utilise avec :

```sh
npm ci
npm run build
npm run typecheck
npm test
npm pack
```

Ces tests ne nécessitent ni identifiants, ni configuration de plateforme. La façade fake du test React est une implémentation de test du contrat ; elle ne prétend pas tester l’autorisation d’une vraie plateforme. Les garanties de l’adaptateur réel (admission, invalidation, completion unique, résultat validé, cleanup) restent vérifiées dans les tests de plateforme et du game-server.

## Validation de la plateforme contre le tarball

```sh
npm run test:sdk-platform -- /chemin/absolu/chibaskogames-sdk-0.1.0.tgz
```

Le script installe réellement le tarball dans un cache ignoré, remplace temporairement les **deux liens** SDK de node_modules (web et game-server) et conserve leurs originaux. Un `finally` restaure et vérifie chaque lien même si une validation échoue. Il refuse de remplacer une installation qui ne serait pas un lien. Ne pas interrompre brutalement le processus pendant cette vérification ; en cas de coupure machine, les liens `.local-backup-*` contiennent les originaux.

Il exécute TypeScript, tests SDK/adaptateur et produit concernés, manifeste, frontières, build du game-server, tests réseau (Pong deux parties, module factice, public/privé) et build Next. Les manifests de dépendances ne sont pas basculés vers un chemin temporaire. Les dossiers source, tests et dist locaux du SDK sont temporairement déplacés dans le cache ignoré, puis restaurés dans le même `finally` : aucune commande ne peut utiliser leur chemin local initial. Le dossier package lui-même reste en place car Windows peut le garder ouvert via des junctions npm. Les tests d’intégration inspectent désormais les exports installés ; le SDK autonome audite sa propre source. Le helper `build-game-sdk.mjs` compile seulement lorsque le SDK installé pointe réellement vers la source locale. Pour une dépendance distribuée, il vérifie ses exports/builds et utilise le build installé.

Sous Windows, cette validation utilise les paramètres de build Next/standalone déjà employés par le projet et peut nécessiter une autorisation de créer des junctions et d’ouvrir des connexions de test sur loopback. Aucun déploiement n’est lancé.

## Distribution future : GitHub et tag

La syntaxe npm retenue est `github:Chibasko06/chibasko-games-sdk#v0.1.0`. Le tag exact et les lockfiles sont versionnés ; pour une immobilité plus forte, un SHA peut remplacer le tag. Ne pas déplacer un tag publié. La syntaxe Git et le build par `prepare` sont documentés par [npm](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#git-urls-as-dependencies) et son [cycle de vie](https://docs.npmjs.com/cli/v11/using-npm/scripts/).

Après validation de la licence et création manuelle du dépôt GitHub **vide**, depuis la copie autonome uniquement (commandes préparées, non exécutées ici) :

```sh
npm ci
npm run typecheck
npm test
npm pack
git init
git add .
git diff --cached --stat
git commit -m "Initialise le SDK commun de Chibasko Games en version 0.1.0"
git branch -M main
git remote add origin https://github.com/Chibasko06/chibasko-games-sdk.git
git push -u origin main
git tag -a v0.1.0 -m "Version expérimentale 0.1.0 du SDK Chibasko Games"
git push origin v0.1.0
```

Vérifier le propriétaire GitHub dans l’URL avant exécution. Il n’existe actuellement aucune preuve d’installation depuis ce remote/tag puisqu’il n’a pas encore été créé. L’installation source/prepare et la distribution tarball sont testées localement ; vérifier aussi l’installation Git une fois le tag accessible, avant de basculer les consommateurs.

## Consommation future

Après disponibilité du tag, la plateforme remplacera `file:packages/game-sdk` et le game-server `file:../packages/game-sdk` par la même référence Git. Exemples futurs, non exécutés :

```sh
npm install --save-exact "@chibaskogames/sdk@github:Chibasko06/chibasko-games-sdk#v0.1.0"
npm --prefix game-server install --save-exact "@chibaskogames/sdk@github:Chibasko06/chibasko-games-sdk#v0.1.0"
```

Versionner les deux lockfiles et relancer les validations concernées avant de retirer la source locale. La vérification de frontières audite la source SDK seulement si elle est présente ; après extraction, ce contrôle est assuré par les tests autonomes du SDK. `test:sdk` conserve les tests d’intégration plateforme et inspecte les exports installés ; les tests autonomes du package s’exécutent depuis son propre dossier.

Le futur dépôt Pong installe la même référence SDK ; son code source n’a pas besoin de changer. Sa seule modification actuelle est le peer SDK `0.0.0` → `0.1.0`, nécessaire pour que npm accepte cette nouvelle version. Aucune extraction de Pong, modification de gameplay ou nouvelle API SDK n’est faite.

GitHub/tag convient à cette étape mais recompilera le SDK et téléchargera ses dépendances de développement au moment de préparer l’installation Git. npm public distribuera plus tard le tarball prêt à l’emploi. GitHub Packages ajouterait une configuration de registry et potentiellement des credentials : aucun avantage immédiat ici, donc non retenu.

SemVer : `0.1.x` correctifs compatibles, `0.2.0` changement potentiellement incompatible pendant l’expérimentation, `1.0.0` API stable. L’évolution d’`integrationVersion` est indépendante et nécessite une décision de protocole. Aucun système de release automatique n’est nécessaire.

## Résultats de validation de cette préparation

- SDK copié hors repository : installation npm réelle, build, typecheck, **4 tests réussis**.
- Tarball inspecté : **11 fichiers**, inventaire archive et contenu installé conformes ; aucun secret ou code privé détecté par le scan ciblé et l’audit source.
- Consommateur hors repository : root/client/server exécutés et types compilés sans React ; entrypoint React exécuté avec rendu React et types compilés après installation de React.
- Pong copié hors repository : installation npm réelle du SDK tarball et des dépendances génériques, build/typecheck, **10 tests réussis**, dont parité moteur/online/local et hôte React minimal.
- Plateforme sur le tarball, avec src/tests/dist SDK locaux indisponibles : TypeScript, **24 tests SDK/session**, **41 tests produit/client**, manifeste, frontières, build game-server, **10 tests serveur/réseau**, build Next.js réussis. Le réseau vérifie deux parties avec scores/résultats, retour WAITING, puis abandon ; public/privé et module factice passent aussi.
- Après validation : dossiers restaurés, deux liens SDK locaux vérifiés, test:sdk local à nouveau réussi. Les 15 fichiers de la copie autonome sont identiques à ceux du package source.
- Aucun changement dans les quatre sources SDK ni dans les sources client/local/serveur/shared/définition de Pong. Seul son peer SDK est aligné sur 0.1.0.

Ces validations ont été exécutées sous Windows / Node 24.14.0. L’installation depuis le futur tag GitHub et une exécution Linux restent à vérifier une fois ce dépôt/tag disponible. La licence reste une décision du propriétaire avant diffusion comme SDK librement réutilisable.
