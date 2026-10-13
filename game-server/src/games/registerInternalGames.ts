import type { Server } from '@colyseus/core'
import type { GameSessionCoordinator } from '../platform/multiplayer/GameSessionCoordinator.js'
import { registerPong } from './chibasko-pong/register.js'

export type InternalGameRegistration = (server: Server, coordinator: GameSessionCoordinator) => void
export function registerInternalGames(server: Server, coordinator: GameSessionCoordinator,
  registrations: readonly InternalGameRegistration[] = [registerPong]) {
  for (const register of registrations) register(server, coordinator)
}
