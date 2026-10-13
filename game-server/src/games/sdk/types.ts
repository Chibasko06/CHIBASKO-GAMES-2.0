import type { Client } from '@colyseus/core'
import type { GameDefinition } from '../types.js'
import type { GameResult } from '../../platform/multiplayer/GameResult.js'

export type { GameDefinition, GameResult }
// Games do not interpret transport auth: only admit() can expose public identity.
export type InternalGameClient = Client<{ auth: unknown }>
export type PublicGamePlayer = Readonly<{ userId: string; username: string; avatarUrl: string | null }>
export type InternalGameContext = Readonly<{
  definition: GameDefinition
  expectedPlayers: number
  reservationSeconds: number
  admit(client: InternalGameClient): PublicGamePlayer
  getPlayer(client: InternalGameClient): PublicGamePlayer | null
  admitted(client: InternalGameClient): void
  assertCanActivate(transitionId: string): void
  complete(result: GameResult): boolean
  leave(client: InternalGameClient): void
  fail(): void
  dispose(): void
}>
export type InternalGamePlatform = Readonly<{
  createContext(options: { transitionId: unknown; roomId: string; roomType: string }): InternalGameContext
}>
