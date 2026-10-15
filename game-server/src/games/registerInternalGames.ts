import type { Server } from '@colyseus/core'
import type { Schema } from '@colyseus/schema'
import type { GameServerModule } from '@chibaskogames/sdk/server'
import type { GameSessionCoordinator } from '../platform/multiplayer/GameSessionCoordinator.js'
import { createInternalGameAdapter } from '../platform/multiplayer/internalGameAdapter.js'
import { registerColyseusGame } from '../platform/multiplayer/colyseusGameAdapter.js'
import { pongServerModule } from '@chibaskogames/chibasko-pong/server'
import { resolveGame } from './registry.js'

export type InternalGameRegistration = { roomType: string; module: GameServerModule<Schema> }
export function registerInternalGames(server: Server, coordinator: GameSessionCoordinator,
  registrations: readonly InternalGameRegistration[] = [{ roomType: resolveGame(pongServerModule.definition.id).roomType, module: pongServerModule }]) {
  const adapter = createInternalGameAdapter(coordinator)
  for (const { roomType, module } of registrations) registerColyseusGame(server, roomType, module, adapter)
}
