import type { Server } from '@colyseus/core'
import type { GameSessionCoordinator } from '../../platform/multiplayer/GameSessionCoordinator.js'
import { resolveGame } from '../registry.js'
import { createPongRoom } from './PongRoom.js'

export function registerPong(server: Server, coordinator: GameSessionCoordinator) {
  server.define(resolveGame('chibasko-pong').roomType, createPongRoom(coordinator))
    .on('join', (room, client) => room.admitted(client))
}
