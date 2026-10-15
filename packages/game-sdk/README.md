# SDK commun Chibasko Games — intégration 1

Package local privé @chibaskogames/sdk, sans publication npm ni API tiers déployée.
Exports : root (contrats purs), /client, /react facultatif, /server.
Aucun import de jeu ou d'infrastructure plateforme.

Depuis la racine : npm run build:sdk ; npm run test:sdk.
Le SDK sert de contrat commun ; les adaptateurs d'infrastructure restent privés.
Même contrat ne signifie ni isolation de code ni même confiance dans les résultats.

Documentation : [SDK commun](../../docs/game-sdk.md).
