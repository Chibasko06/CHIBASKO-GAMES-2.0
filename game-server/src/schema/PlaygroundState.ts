import { schema, t, type SchemaType } from '@colyseus/schema'

export const PlayerState = schema({
  userId: t.string().default(''),
  username: t.string().default(''),
  avatarUrl: t.string().default(''),
  x: t.number().default(50),
  y: t.number().default(50),
}, 'PlayerState')
export type PlayerState = SchemaType<typeof PlayerState>

export const PlaygroundState = schema({
  players: t.map(PlayerState),
}, 'PlaygroundState')
export type PlaygroundState = SchemaType<typeof PlaygroundState>
