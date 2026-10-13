# Internal Game SDK v0 — Chibasko Games

`client/types.ts` définit la façade et le contrat des modules lazy.
`client/index.ts` fournit `useChibaskoGame(connection)` sans accès à l'auth,
navigation ou propriété de la connexion.

Le contrat serveur est dans `game-server/src/games/sdk/`. Son adaptateur privé
vers l'admission/coordinateur est dans `platform/multiplayer/internalGameSdk.ts`.

Documentation et exemples : [internal-game-sdk](../../docs/internal-game-sdk.md).
API interne évolutive ; aucun package npm ni SDK externe.
