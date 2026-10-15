# Chibasko Games SDK

**EXPÉRIMENTAL — version 0.1.0, contrat d’intégration 1.**

Le SDK est le contrat d’intégration entre un jeu et Chibasko Games. Un jeu décrit ses capacités, reçoit une identité publique et une façade de session fournie par son hôte, échange ses messages métier et produit un résultat côté serveur.

Un seul package, quatre points d’entrée publics :

| Import | Contenu | Dépendances runtime |
| --- | --- | --- |
| `@chibaskogames/sdk` | `defineGame`, `INTEGRATION_VERSION`, contrats purs | Aucune |
| `@chibaskogames/sdk/client` | Contrats de façade client | Aucune |
| `@chibaskogames/sdk/react` | `useChibaskoGame`, contrats de modules React | React 19, peer optionnel |
| `@chibaskogames/sdk/server` | Contrats de session et de jeu serveur | Aucune |

Le SDK ne fournit **ni hébergement, ni authentification, ni Supabase, ni LobbyRoom, ni base de données, ni transport réseau, ni secrets, ni accès administrateur**. Les adaptateurs qui implémentent ces contrats appartiennent à l’hôte. Même SDK ne signifie pas même niveau de confiance dans les serveurs ou leurs résultats. Il n’existe pas encore d’intégration réseau de serveur tiers livrée par ce package.

## Installation

Le package n’est pas publié sur npm. Une fois le dépôt et le tag créés, l’installation temporaire sera :

```sh
npm install "github:Chibasko06/chibasko-games-sdk#v0.1.0"
```

Cette commande est une instruction future : le dépôt/tag doit exister. Git et une toolchain Node/npm sont nécessaires. `prepare` compile automatiquement le SDK avant son installation depuis Git, y compris lorsque le consommateur utilise uniquement le serveur. Les dépendances de développement servent à cette compilation, sans devenir des dépendances runtime du consommateur.

Pour tester une distribution locale dès maintenant :

```sh
npm install /chemin/chibaskogames-sdk-0.1.0.tgz
```

Plus tard seulement, après publication npm : `npm install @chibaskogames/sdk`.
Pour `/react`, installer également `react@^19`. Aucun import profond vers `src/` ou `dist/` n’est supporté.

Le format est **ESM uniquement**, avec JavaScript ES2022 et déclarations TypeScript. Utiliser un bundler moderne ou un environnement ESM. Aucun build CommonJS séparé n’est fourni. Les contrats purs ne nécessitent aucune API Node ou navigateur. Le développement et les tests du package sont validés avec Node 24.

## Définition et capacités

```ts
import { defineGame } from '@chibaskogames/sdk'

export const definition = defineGame({
  id: 'example-game',
  integrationVersion: 1,
  capabilities: {
    online: {
      access: ['public', 'private'],
      players: { min: 2, max: 4 },
    },
    local: { players: { min: 2, max: 2 } },
  },
})
```

Déclarer uniquement les capacités réellement implémentées. `online` et `local` sont deux exécutions. `public` et `private` sont des politiques d’accès au même gameplay online. Aucune capacité n’est activée par défaut. Les capacités peuvent définir des nombres de joueurs différents entre online et local. `defineGame` valide l’identifiant, la version et les capacités, puis retourne une copie immuable. L’hébergement, les endpoints et les classes de transport ne font pas partie de la définition.

## Identité et session

`GameParticipant` contient `participantId`, `username` et `avatarUrl` nullable. L’identifiant est opaque : il ne faut pas le comparer à un identifiant de connexion réseau ou supposer qu’il s’agit d’un identifiant de compte global. Aucun email, JWT ou ticket n’est exposé.

`GameSessionDescriptor` décrit `id`, `gameId`, `integrationVersion` et `execution`. `GameSessionSnapshot` ajoute les participants, les identifiants locaux et connectés ainsi que `availability` (`preparing`, `ready`, `completed`). Plusieurs participants locaux peuvent être représentés ; leur gestion concrète appartient à l’hôte.

## Client sans React

```ts
import type { GameClientConnection } from '@chibaskogames/sdk/client'

export function attachGame(connection: GameClientConnection) {
  const unsubscribe = connection.subscribe(() => {
    const state = connection.getState() // unknown : le jeu valide son propre état
    const revision = connection.getRevision()
    // Mettre à jour le rendu du jeu à partir de state/revision.
    void state; void revision
  })
  connection.send('answer', { value: 42 })
  return unsubscribe
}
```

La façade expose `localPlayerId`, `getSession`, `getState`, `getRevision`, `subscribe` et `send`. Le SDK ne comprend pas le payload métier et ne fournit pas de connexion réseau. L’hôte implémente la façade : il doit invalider une ancienne session, empêcher tout envoi après sa fermeture et notifier les abonnés. L’état et la session peuvent alors être `null`. Il ne faut pas conserver de référence à un état après invalidation. L’abonnement retourne un désabonnement idempotent ; la révision est un snapshot stable jusqu’à la prochaine notification.

L’hôte possède le transport et son nettoyage ; le jeu possède ses listeners clavier/pointer et son rendu. Le jeu ne peut pas fermer arbitrairement le transport ou accéder à des réservations via la façade.

## React optionnel

```tsx
import { useChibaskoGame, type GameClientProps } from '@chibaskogames/sdk/react'

export default function ExampleGame({ connection }: GameClientProps) {
  const game = useChibaskoGame(connection)
  return <button onClick={() => game.send('answer', { value: 42 })}>
    Répondre
  </button>
}
```

Le hook utilise `useSyncExternalStore`, suit la révision et retire son abonnement au démontage ou au remplacement de connexion. Il n’ajoute ni navigation, ni auth, ni autorité de résultat. Les jeux dont le rendu est impératif peuvent consommer directement la façade. `GameClientModule`/`ClientGameRegistry` décrivent les modules online chargés à la demande ; `LocalGameModule`/`LocalGameRegistry` décrivent un module local React qui reçoit uniquement `onExit()`.

## Serveur

```ts
import type { GameResult } from '@chibaskogames/sdk'
import type { GameServerSession } from '@chibaskogames/sdk/server'

export function finishDraw(platform: GameServerSession) {
  const result: GameResult = {
    gameId: platform.session.gameId,
    winnerParticipantId: null,
    players: platform.participants.map(p => ({ participantId: p.participantId })),
    reason: 'draw',
  }
  return platform.complete(result)
}
```

`GameServerSession` fournit une session, ses participants vérifiés, `isParticipantActive(id)`, `complete(result)` et `fail()`. `GameServerModule<State>` expose `definition`, `tickRate`, `patchRateMs` et `create(session)`. Son instance expose l’état et les hooks `participantJoined`, `participantLeft`, `receive`, `start`, `tick(deltaMs)` et `dispose`. Un message arrive avec un `GameMessagePeer` associant le participant vérifié et une fonction de réponse. Le client ne choisit jamais cette identité.

L’adaptateur hôte doit contrôler admission, activation, validation du résultat, completion unique et cleanup idempotent. `complete` retourne si la completion a été acceptée ; un doublon ne doit pas publier un second résultat. Le SDK décrit ces exigences ; il ne contient pas leur implémentation privilégiée. Les règles et phases internes du jeu restent propres au jeu.

## Résultats

`GameResult` contient `gameId`, `winnerParticipantId` nullable, `reason` et `players` (`participantId`, `score` numérique optionnel). Une égalité ou un résultat sans score sont possibles. Le navigateur online ne dispose d’aucune méthode `complete`. Un résultat local ne constitue pas un résultat serveur vérifié. Le SDK n’ajoute ni classement, ni récompenses, ni persistance, ni validation de confiance de tiers.

## Développer et empaqueter ce dépôt

```sh
npm install
npm run build
npm run typecheck
npm test
npm pack
```

`npm ci` utilise le lockfile pour une installation reproductible. `prepare` assure le build à l’installation des sources et avant `npm pack` ; aucun `dist` n’a besoin d’être versionné. Un consommateur du tarball reçoit déjà le JavaScript et les déclarations, sans compiler les sources. Ne pas utiliser `--ignore-scripts` pour une installation depuis Git, sinon le build de préparation serait désactivé.

Le tarball ne contient que `package.json`, `README.md`, `CHANGELOG.md` et les huit fichiers JS/déclarations des quatre points d’entrée dans `dist/`. Sources, tests, lockfile, configs, node_modules et caches restent hors distribution. Les tests vérifient les définitions, les frontières d’import et le hook React avec une façade hôte factice. Ils ne nécessitent aucun compte ni serveur Chibasko Games.

## Versions et licence

`0.1.0` est la version SemVer du **package**. `integrationVersion: 1` est la version du **contrat d’intégration** ; elle n’augmente pas à chaque publication. Les correctifs compatibles utilisent `0.1.x`, une évolution potentiellement cassante utilise `0.2.0`, et `1.0.0` indiquera une API considérée stable. Avant 1.0, les changements incompatibles doivent être annoncés dans le changelog. Plateforme et jeux doivent d’abord utiliser le même tag exact et versionner leur lockfile. Une évolution incompatible du protocole nécessite une décision distincte sur `integrationVersion`.

**Licence à valider par le propriétaire.** `UNLICENSED` conserve les droits réservés et ne constitue pas une licence open source. `private: true` bloque une publication npm accidentelle ; cela n’empêche pas une installation Git ou tarball. Rendre le code visible sur GitHub ne suffit pas à accorder les droits de réutilisation souhaités. Avant d’annoncer un SDK public réutilisable, choisir une licence et ajouter son texte : MIT (permissive courte), Apache-2.0 (permissive avec clauses explicites sur les brevets), ou BSD-3-Clause (permissive avec clause de non-approbation) sont des options à examiner. Aucune licence n’a été choisie automatiquement.

Références npm : [cycle de vie et prepare](https://docs.npmjs.com/cli/v11/using-npm/scripts/), [dépendances Git et GitHub](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#git-urls-as-dependencies).
