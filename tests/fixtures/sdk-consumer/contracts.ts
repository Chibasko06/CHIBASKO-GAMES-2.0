import type { GameDefinition, GameParticipant, GameResult } from '@chibaskogames/sdk'
import type { GameClientConnection } from '@chibaskogames/sdk/client'
import type { GameServerSession } from '@chibaskogames/sdk/server'

const definition: GameDefinition = { id: 'example', integrationVersion: 1, capabilities: { online: { access: ['private'], players: { min: 2, max: 2 } } } }
const player: GameParticipant = { participantId: 'opaque', username: 'Player', avatarUrl: null }
// @ts-expect-error Infrastructure is not part of a game definition.
void definition.roomType
// @ts-expect-error Authentication is not exposed to games.
void player.access_token
const result: GameResult = { gameId: 'example', winnerParticipantId: null, players: [{ participantId: player.participantId }], reason: 'completed' }
function contracts(client: GameClientConnection, server: GameServerSession) {
  client.getSession()?.localParticipantIds.forEach(id => id.toUpperCase())
  server.complete(result)
  // @ts-expect-error The online browser cannot declare completion.
  client.complete(result)
  // @ts-expect-error No raw transport.
  void client.room
  // @ts-expect-error No private transition.
  void server.transitionId
  // @ts-expect-error No raw network admission in the game-facing session.
  server.admit({})
}
void contracts
