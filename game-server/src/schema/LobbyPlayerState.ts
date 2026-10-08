import { schema, t, type SchemaType } from '@colyseus/schema'
export const LobbyPlayerState = schema({
  userId: t.string().default(''), username: t.string().default(''),
  avatarUrl: t.string().default(''), ready: t.boolean().default(false),
}, 'LobbyPlayerState')
export type LobbyPlayerState = SchemaType<typeof LobbyPlayerState>
