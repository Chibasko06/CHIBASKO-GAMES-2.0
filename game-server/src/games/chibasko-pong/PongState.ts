import { schema, t, type SchemaType } from '@colyseus/schema'
const PongPlayer = schema({ userId: t.string(), username: t.string(), avatarUrl: t.string() }, 'PongPlayer')
export const PongState = schema({
  gameId: t.string().default(''), status: t.string().default('PREPARING'), expectedPlayers: t.number().default(0), players: t.map(PongPlayer),
}, 'PongState')
export type PongState = SchemaType<typeof PongState>
export { PongPlayer }
