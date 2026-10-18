# Contrat d'intégration des jeux

Un seul SDK : `@chibaskogames/sdk`. La plateforme utilise la version npm publique
exacte 0.3.0. Ses entrypoints root/client/react/server restent indépendants des
sources des jeux. Le jeu Web embarque son SDK et communique avec GameRuntime
par Bridge ; son réseau gameplay reste séparé.

Les anciens contrats de package React/Room et les registres source sont retirés
du portail. Les contrats de distribution sont décrits dans
[game-distribution.md](game-distribution.md), [game-runtime.md](game-runtime.md),
[sdk-browser-bridge-v2.md](sdk-browser-bridge-v2.md) et
[online-sessions.md](online-sessions.md).
