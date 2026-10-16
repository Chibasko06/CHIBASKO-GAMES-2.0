# Chibasko Pong

Jeu officiel privé de Chibasko Games, package `@chibaskogames/chibasko-pong` **0.1.0**.
Cette version prépare son repository autonome ; aucun jeu n’est publié au catalogue.

## Règles et contrôles

Pong 1v1, premier à 5 points. Terrain logique 1000 × 600, moteur à 30 Hz,
countdown de 3 secondes et pause d’une seconde après un point. Online : un départ
pendant une partie entraîne la victoire adverse par abandon. Les résultats et le
retour au salon sont orchestrés par l’hôte ; le jeu fournit le résultat serveur.

- Online : ↑/↓ ou W/S, boutons tactiles Monter/Descendre.
- Local : Joueur 1 Z/S (W également accepté), Joueur 2 ↑/↓ ; quatre boutons tactiles.
- Le terrain conserve son ratio et s’adapte à la largeur et à la hauteur disponibles.
- Local : sans compte, serveur, réseau ou persistance ; boutons Rejouer et Quitter.
- L’hôte fournit le callback de sortie et les identités/avatars publics online.

## Architecture

```text
definition.ts       capacités portables, integrationVersion 1
shared/             moteur pur, unique pour online et local
client/             rendu React/Canvas, interpolation online, CSS Module autonome
local/              runtime navigateur et contrôles de deux joueurs
server/             driver SDK autoritaire et état @colyseus/schema
scripts/            build TypeScript, copie du CSS, contrôle de frontières
tests/              moteur, parité, runtime, contrôles, hôte React, layout optionnel
```

Le serveur online décide de toute la physique, des points et du gagnant. Le client
envoie uniquement `set_input { direction: -1 | 0 | 1 }`. Le local exécute le même
moteur dans le navigateur, sans interpolation réseau ni fausse session online.
Ses résultats ne sont pas vérifiés et ne sont pas transmis à un serveur.

Le package ne contient ni auth, ni transport Colyseus, ni lobby, ni endpoint,
ni réservation, ni accès Supabase ou à la plateforme. L’adaptateur de l’hôte
enregistre `pongServerModule` sur son infrastructure. Les avatars sont des URL
publiques fournies explicitement par l’hôte. Aucun asset ou CSS global n’est requis.

## SDK et dépendances

SDK réel : repository privé `Chibasko06/chibasko-games-sdk`, tag `v0.1.0`, commit
`7bc73cc335e7dbd52b411a751fcc689969c5a5d4`. Un accès Git en lecture est nécessaire
pendant l’installation ; aucun credential ne doit figurer dans ce dépôt.

- SDK : peer exact `0.1.0`, fourni par l’hôte ; devDependency Git pour construire
  ce repository seul, y compris pendant la préparation d’une dépendance Git Pong.
- React : peer optionnel `^19`, devDependency pour construire/tester le client.
  React n’est pas bundlé et n’est pas requis par les imports root/shared/server.
- `@colyseus/schema` : dépendance runtime du serveur uniquement ; aucun import
  dans les modules client/local/shared. Aucun Colyseus Client/Room brut requis.
- TypeScript, ReactDOM, leurs types et jsdom : outils de développement.

## Installation, build et tests autonomes

Avec Node 24 et npm, depuis ce repository :

```sh
npm ci
npm run build
npm run typecheck
npm test
npm pack
```

`prepare` exécute `npm run build` : les exports sont compilés lors de l’installation
Git et de l’empaquetage. Ne pas désactiver les scripts pour une installation depuis
Git. Le lockfile fige aussi le SDK Git ; les builds n’utilisent aucun SDK local.
Les scripts sont Node/TypeScript, sans commande de shell propre à Windows ou Linux.
Windows est testé ; Linux doit encore être exécuté dans un environnement dédié.

Autres cibles : `build:shared`, `build:server`, `build:client`, `test:shared`,
`test:server`, `test:client`, `check:boundaries`.
Le build complet produit tous les exports et le CSS. Le moteur seul se compile
sans React, SDK, navigateur ou API Node. Le serveur peut être consommé sans React.

Les tests de règles et de contrôles vivent ici. L’hôte possède les tests de
salons/admission/résultats/replay réseau. Les tests React utilisent uniquement
jsdom, le SDK et un stand-in CSS Node. Le layout navigateur est optionnel : fournir
un module Playwright déjà installé via `PONG_LAYOUT_PLAYWRIGHT` et éventuellement
son navigateur via `PONG_LAYOUT_BROWSER`. Aucun téléchargement de navigateur
n’est nécessaire au build ou à la suite Node normale.

## Exports publics

| Import | Contenu |
| --- | --- |
| `@chibaskogames/chibasko-pong` | `pongDefinition` |
| `/client` | module online React, default + gameId |
| `/local` | module local React, default + gameId |
| `/server` | `pongServerModule`, `PongState` |
| `/shared` | constantes, modèle et simulation pure |

L’hôte charge `/client` et `/local` avec des imports dynamiques littéraux.
Les fichiers internes ne sont pas une API publique. Le bundler hôte doit supporter
ESM, React et CSS Modules. Aucun build Next.js n’est requis pour ce package.
Le tarball ne contient que package.json, README, CHANGELOG, JavaScript/déclarations
dans dist et le CSS du jeu. Sources, tests, Git, caches et credentials sont exclus.

## Compatibilité et distribution

| Plateforme | SDK | Pong | Contrat |
| --- | --- | --- | --- |
| release validée par tests d’intégration | 0.1.0 / v0.1.0 | 0.1.0 | integrationVersion 1 |

La version Pong est indépendante du SDK. Les deux consommateurs doivent utiliser
un SDK compatible unique ; les lockfiles et tests d’intégration fixent la combinaison.
`private: true` bloque npm publish. Le repository et le code officiel restent privés,
avec droits réservés (`UNLICENSED`). Aucun remote n’est nécessaire aux tests tarball.
La future installation Git Pong dépendra aussi de l’accès Git au SDK pendant prepare.
