import type { Server } from '@colyseus/core'
import type { InternalGamePlatform } from '../sdk/index.js'
import { resolveGame } from '../registry.js'
import { createPongRoom } from './PongRoom.js'

export function registerPong(server: Server, platform: InternalGamePlatform) {
  server.define(resolveGame('chibasko-pong').roomType, createPongRoom(platform))
    .on('join', (room, client) => room.admitted(client))
}
