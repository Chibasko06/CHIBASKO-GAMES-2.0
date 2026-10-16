# SDK commun Chibasko Games

Le SDK interne v0 a été remplacé par un seul package commun :
`@chibaskogames/sdk`, source dans le repository privé
[Chibasko06/chibasko-games-sdk](https://github.com/Chibasko06/chibasko-games-sdk).
La plateforme et le game-server consomment `v0.1.0` via Git, avec le commit
`7bc73cc335e7dbd52b411a751fcc689969c5a5d4` figé dans leurs lockfiles.

Ce chemin documentaire historique reste pour les liens existants ; il n'existe
plus de SDK interne parallèle. Les adaptateurs de la plateforme restent privés.

Voir [contrat, APIs, sécurité et migration](game-sdk.md).
