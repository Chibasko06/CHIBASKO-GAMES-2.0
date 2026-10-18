# Chibasko Game Bridge v1 — contrat navigateur

Implémenté dans le repository séparé `chibasko-games-sdk`, version 0.2.0 préparée.
Cette spécification décrit le contrat wire testé par le host, pas une copie du SDK.
Le root/core reste sans React/Next/Colyseus/Supabase/DOM. Le transport navigateur
est optionnel et exporté par `/client`, sans toucher à la façade réseau existante.

## Envelope obligatoire

```ts
type Envelope = {
  channel: 'chibasko.game'
  protocolVersion: 1
  launchId: string       // UUID opaque de corrélation, pas Auth/session réseau
  generation: string    // UUID changé à chaque lancement
  type: string
  payload: object
}
```

Aucune propriété supplémentaire autorisée, même dans payload/context. Objets natifs
structured-clone, pas JSON texte ni besoin d'ESM. Le document du jeu crée documentId
par crypto.randomUUID à chaque chargement, jamais depuis localStorage.

| Direction | Message | Payload exact |
| --- | --- | --- |
| Game → host | GAME_HELLO | `{documentId}` |
| Host → game | PLATFORM_INIT | `{documentId, context}` |
| Game → host | GAME_READY | `{documentId}` |
| Host → game | GAMEPLAY_START | `{documentId}` |
| Host → game | GAMEPLAY_STOP | `{documentId}` |
| Game → host | LEAVE_REQUEST | `{documentId}` |
| Game → host | GAME_ERROR | `{documentId, code}` |
| Host → game | PLATFORM_PING | `{documentId, sequence}` |
| Game → host | GAME_PONG | `{documentId, sequence}` |

sequence entier positif sûr, retransmis exactement ; code regex
`^[a-z][a-z0-9_]{0,63}$`, aucun texte HTML/stack. PING/PONG servent seulement à détecter
la perte du bridge, pas au jeu réseau. Pas de résultat/scoring/gameplay sur ce V1.
RUNTIME-COMPAT-1 : le SDK répond dès INIT, même avant READY. Le premier PONG
acquitte INIT ; les suivants surveillent la préparation et le gameplay. Aucun
PONG ne déclenche START ni ne prolonge le budget READY ou le bail des artefacts.

## Contexte exact

```ts
type Context = {
  gameId: string
  gameVersionId: string
  execution: 'local' | 'online'
  locale: string
  participants: {participantId: string; username: string}[]
  session?: {sessionId: string; localParticipantIds: string[]}
}
```

Local : pas de session, participants éventuellement vide (invités gérés par le jeu).
Online : session requise et au moins un localParticipantId présent dans participants.
Le host attribue des pseudonymes `p_<32..64 hex>` et session opaque `s_<32..64 hex>`,
distincts des UUID Auth et IDs transport ; username public, 1..80 caractères sans
contrôles. Capacité bornée par le manifest côté serveur. Aucun secret, email, endpoint,
ticket réseau, roomId, réservation, cookie ou champ libre dans ce V1. Le futur contrat
de connexion gameplay devra être ajouté explicitement, pas caché dans un objet extra.

## Adaptateur navigateur SDK 0.2.0

Les types purs `BridgeProtocolVersion` et `BrowserLaunchContext` sont dans le core.
`connectPlatform()` est dans `/client`, avec un module transport interne séparé
qui ne lit window que lors de l'appel. Les messages wire ne sont pas une API gameplay.
`/react` conserve son hook optionnel existant.

```ts
const platform = await connectPlatform()
platform.context
const offStart = platform.onStart(() => { /* reprendre */ })
const offStop = platform.onStop(() => { /* pause/input 0 */ })
platform.ready()                 // ressources du moteur effectivement prêtes
platform.leave()
platform.reportError('load_failed')
platform.close()                 // retrait listeners/timers, callbacks inactifs
```

`connectPlatform` lit cgLaunch/cgGeneration/cgParent dans le fragment bootstrap,
valide les UUID et l'origine HTTPS du parent, exige parent !== self et envoie HELLO
à ce parent exact. INIT doit vérifier source===parent, origin===cgParent, envelope,
génération, documentId et schéma context. Le jeu n'est running qu'après START,
ready reste explicite. Répétitions INIT/START/STOP idempotentes ; messages périmés
ou après close ignorés. PONG géré par le transport, pas par le gameplay.

Ne pas convertir GameClientConnection.send en postMessage de gameplay. Garder ce
contrat pour les connexions/adaptateurs réseau appropriés ; browser integration
est une intégration plateforme distincte, toujours dans le même SDK.
Timeouts, validation stricte et tests bidirectionnels avec ce host sont implémentés.
Version de package préparée 0.2.0 expérimentale, integrationVersion reste 1,
bridge protocolVersion vaut 1 : trois versions indépendantes.

Le build IIFE `chibasko-games-sdk.js` expose `window.ChibaskoGames.connectPlatform`
avec la même implémentation, version explicite et hash de distribution. Aucun accès
Git privé/npm requis pour le jeu HTML. Unity/Godot wrappers appelleront cette API JS ;
pas de wrappers nécessaires pour prouver le protocole. Fullscreen v1 via UI hôte,
pointer lock via geste du jeu ; futur openExternalUrl/fullscreen médiés ne sont pas
des messages V1 acceptés automatiquement.

Sources SDK : types purs dédiés, `src/client/browser/{protocol,connection,errors,standalone}.ts`,
export `/client`, tests browser/protocole, build IIFE, README/CHANGELOG. Les sources
restent dans le repository SDK séparé. RUNTIME-COMPAT-1 corrige seulement l'acceptation
des pings en initialized et adapte les tests/docs ; aucune publication SDK.


## Coexistence v2

Cette spécification reste inchangée pour SDK 0.2.0 publié. Le host accepte aussi
v2, documenté dans `sdk-browser-bridge-v2.md`, sans ajouter de champ au START v1.
