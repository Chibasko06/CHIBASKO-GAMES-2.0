import type { Server } from '@colyseus/core'
import type { GameSessionCoordinator } from '../platform/multiplayer/GameSessionCoordinator.js'
import { createInternalGamePlatform } from '../platform/multiplayer/internalGameSdk.js'
import type { InternalGamePlatform } from './sdk/index.js'
import { registerPong } from './chibasko-pong/register.js'

export type InternalGameRegistration = (server: Server, platform: InternalGamePlatform) => void
export function registerInternalGames(server: Server, coordinator: GameSessionCoordinator,
  registrations: readonly InternalGameRegistration[] = [registerPong]) {
  const platform = createInternalGamePlatform(coordinator)
  for (const register of registrations) register(server, platform)
}
