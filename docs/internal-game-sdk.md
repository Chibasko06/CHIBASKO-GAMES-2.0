# Internal Game SDK v0 — Chibasko Games

Code interne du dépôt, sans package npm, API réseau publique ni promesse de
compatibilité externe. v0 formalise les capacités utilisées par nos propres jeux.

## Responsabilités

La plateforme possède Auth/Supabase, les connexions et réservations, l'admission,
le coordinateur, la salle d'attente, host/ready, le lifecycle global et la navigation.
Le jeu possède son état public, ses messages, ses règles, sa simulation, son rendu
et ses listeners clavier/pointer/canvas. Le SDK est la frontière entre les deux,
pas une deuxième plateforme ni une classe universelle de GameRoom.

## Client

Importer `useChibaskoGame` et `GameClientProps` depuis `games/sdk/client/index`.
GameRuntime fournit une `GameClientConnection` à un composant client lazy :

```tsx
'use client'
import { useChibaskoGame, type GameClientProps } from '@/games/sdk/client/index'

export const gameId = 'example-game'
export default function Game({ connection }: GameClientProps) {
  const game = useChibaskoGame(connection)
  // Valider/projeter game.state selon le schéma propre au jeu.
  return <button onClick={() => game.send('answer', { choice: 1 })}>Répondre</button>
}
```

API du hook :

- `state: unknown` : état public courant, `null` après invalidation ; aucun schéma
  de gameplay imposé. Le jeu construit son view model (exemple `readPongView`).
- `revision: number` : notification de changement même si Colyseus mute le même
  objet. Le hook utilise `useSyncExternalStore` et désabonne l'ancienne connexion.
- `localPlayerId: string` : identifiant temporaire pour retrouver le joueur local
  dans l'état ; ne pas l'afficher dans l'interface.
- `subscribe(listener): unsubscribe` : abonnement manuel si nécessaire ; le jeu
  doit appeler son unsubscribe. Le hook gère son propre abonnement automatiquement.
- `send(type, payload?)` : message métier opaque ; le serveur valide son contenu.

Pas de contexte React supplémentaire : la prop suffit pour une session isolée.
La connexion est gelée et ne fournit ni Auth, session Supabase, JWT, réservation,
endpoint, navigation, ni méthode leave/dispose. La plateforme conserve l'adaptateur
`createGameClientConnection`, invalide la façade **avant** de fermer la Room et
retire les abonnements. Un send sur une ancienne façade est ignoré ; il ne peut
atteindre la nouvelle partie. Le jeu retire ses listeners propres au démontage.

`games/clientRegistry.ts` contient exclusivement des imports dynamiques littéraux.
Le SDK partagé reste léger ; aucun import de jeu dans le SDK. La registration ne
charge pas tous les jeux. Aucun état ou identifiant privé n'est persisté par le SDK.

## Serveur

Importer les types depuis `game-server/src/games/sdk/index.ts`.
`registerInternalGames` fournit `InternalGamePlatform` à chaque registration.
La registration crée sa Room et installe le hook d'admission réelle :

```ts
export function registerGame(server: Server, platform: InternalGamePlatform) {
  server.define('example_room', createExampleRoom(platform))
    .on('join', (room, client) => room.admitted(client))
}
```

Dans onCreate, créer **un** contexte lié à la transition et à cette Room :

```ts
this.platform = platform.createContext({
  transitionId: options.transitionId,
  roomId: this.roomId,
  roomType: 'example_room',
})
this.maxClients = this.platform.definition.maxPlayers
this.seatReservationTimeout = this.platform.reservationSeconds
// Garder la Room privée, non listée et inaccessible au matchmaking public.
```

Le type de Room est fixé dans le module serveur, jamais choisi par le navigateur.
API du contexte :

- `definition`, `expectedPlayers`, `reservationSeconds` : données serveur liées à
  la session ; la définition est une copie gelée, sans metadata de catalogue.
- `admit(client)` dans onJoin : réutilise GameAdmission, vérifie transition/Room/
  réservation/identité/expiration/doublon et retourne uniquement une identité
  publique gelée `{ userId, username, avatarUrl }`.
- `getPlayer(client)` : identité publique du client réellement admis, ou null
  après expiration, completion, annulation/disposal ou pour un client différent.
- `admitted(client)` : appelé par le hook Colyseus après onJoin réussi ; notifie
  le coordinateur avec la copie privée vérifiée, sans relire une identité modifiée.
- `assertCanActivate(transitionId)` : appelé dans activate avant le démarrage
  métier ; vérifie la session et la présence effective des joueurs attendus.
- `complete(result): boolean` : exclusivement serveur, valide structure et
  délègue la vérification source/roster au coordinateur. true une fois seulement,
  false si résultat invalide, ancien, hors phase, ou déjà livré.
- `leave(client)` : annule le timer d'expiration et informe le cycle de session.
- `fail()` : incident inattendu sans détail sensible, annulation/nettoyage.
- `dispose()` : cleanup idempotent des membres/timers et notification de disposal.

Le contexte ne révèle ni coordinateur, authData, expiry, email, token ou session
Supabase. `InternalGameClient.auth` est opaque (`unknown`) ; les jeux ne doivent
pas interpréter l'auth du transport Colyseus. Seul l'adaptateur plateforme le fait.
Le jeu reste responsable de ses timers de simulation et de ses inputs. Aucun
BaseGameRoom, markReady fictif, authentification supplémentaire ou nouveau ticket.

## Lifecycle et résultats

Plateforme : WAITING → STARTING → PLAYING → RESULTS → WAITING.
Le jeu a ses phases indépendantes (Pong : COUNTDOWN/PLAYING/POINT_PAUSE/FINISHED).
L'admission réelle déclenche l'activation ; elle ne correspond pas au ready lobby.

`GameResult` conserve gameId, winnerUserId nullable, reason (clé courte), players
avec userId et score numérique **facultatif**. Pas de score obligatoire ni gagnant
obligatoire ; aucun détail privé ou champ supplémentaire. La plateforme copie
uniquement ces champs publics. Le navigateur ne déclare jamais un résultat.
Les règles d'abandon restent dans le jeu. Retour salle d'attente nettoie l'ancienne
session avant de permettre une nouvelle GameRoom.

Pong utilise le hook pour projection/input et le contexte pour admission,
activation, completion et nettoyage ; sa physique, ses règles et son UI restent
inchangées. Les modules factices injectés uniquement dans les tests utilisent un
état question/answer et un résultat sans score ni gagnant avec ces mêmes APIs.

## Ajouter un jeu

1. Créer `games/<id>/client/`, utiliser le hook et projeter l'état propre au jeu.
2. Ajouter son loader littéral dans clientRegistry.
3. Créer `game-server/src/games/<id>/` : Room, State, logique et registration ;
   recevoir le contexte SDK, garder la Room privée, brancher le hook admitted.
4. Ajouter sa GameDefinition et sa registration serveur explicite.
5. Générer puis vérifier le manifeste public min/max.
6. Tester inputs/admissions, cleanup, completion, résultats et deuxième partie.
7. Créer une fiche non publiée via admin, liée par multiplayer_game_id.
8. Décider séparément activation serveur/publication après recette.

Pas de modification des internes du provider, lobby, auth ou coordinateur.
La DB garde le catalogue ; jamais chemins d'import, classe de Room, serveur
arbitraire ou capacités réseau autoritaires.

## Évolution externe : documentation seulement

Un noyau conceptuel commun pourrait exposer état, identité locale minimale,
messages et lifecycle côté client. Côté serveur externe, identité/admission et
completion auraient besoin d'une API publique sécurisée et d'une validation de
ticket, remplaçant l'adaptateur interne privilégié. Aucune de ces APIs, clé,
webhook, ticket externe ou publication npm n'est implémentée en v0.
