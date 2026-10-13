import { schema, t, type SchemaType } from '@colyseus/schema'
import { LobbyPlayerState } from './LobbyPlayerState.js'
export const ResultPlayer = schema({ userId: t.string(), username: t.string(), score: t.number() }, 'ResultPlayer')
export const LobbyState = schema({
  code: t.string().default(''), status: t.string().default('WAITING'),
  gameId: t.string().default(''), minPlayers: t.number().default(0), maxPlayers: t.number().default(0),
  hostUserId: t.string().default(''), players: t.map(LobbyPlayerState),
  winnerUserId: t.string().default(''), resultReason: t.string().default(''), resultPlayers: t.array(ResultPlayer),
}, 'LobbyState')
export type LobbyState = SchemaType<typeof LobbyState>
