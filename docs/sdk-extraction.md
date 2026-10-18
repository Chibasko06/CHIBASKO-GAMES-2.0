# Distribution du SDK

Le SDK unique est développé dans le dépôt source séparé privé
`Chibasko06/chibasko-games-sdk`. Le portail consomme exactement
`@chibaskogames/sdk@0.3.0` depuis npm public, sans accès GitHub ni credential.
integrationVersion reste 1 ; Bridge v2 accepte le START online, et GameRuntime
conserve la négociation v1 pour les anciens builds SDK 0.2.0.

Le portail ne contient aucune copie source du SDK et aucun package de jeu.
Les anciens tags SDK/Pong restent immuables. La suppression complète du consumer
Git Pong retire aussi son ancienne préparation transitive du SDK Git privé.

`npm run build:sdk`, `npm run test:sdk` et `check:game-boundaries` vérifient la
résolution publique installée. Les tests internes du SDK restent dans son dépôt.
Voir [PONG-MIGRATION-1](pong-migration.md).
