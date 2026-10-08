import { Server } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { pathToFileURL } from 'node:url'
import { createPlaygroundRoom } from './rooms/PlaygroundRoom.js'
import { createSupabaseAuthenticator, type Authenticate } from './auth/supabaseAuth.js'
import { createLobbyRoom, type LobbyOptions } from './rooms/LobbyRoom.js'
import { GameSessionCoordinator, type GameBackend } from './platform/multiplayer/GameSessionCoordinator.js'
import { createPongRoom } from './games/chibasko-pong/PongRoom.js'

export function createPlaygroundServer(authenticate: Authenticate = createSupabaseAuthenticator(
  process.env.SUPABASE_URL ?? '', process.env.SUPABASE_PUBLISHABLE_KEY ?? '',
), lobbyOptions: LobbyOptions = {}, sessionOptions: { timeoutMs?: number; backend?: Partial<GameBackend> } = {}) {
  const coordinator = new GameSessionCoordinator(sessionOptions.timeoutMs, sessionOptions.backend)
  const server = new Server({
    transport: new WebSocketTransport(),
    greet: false,
    gracefullyShutdown: false,
  })
  server.define('playground', createPlaygroundRoom(authenticate))
  server.define('lobby', createLobbyRoom(authenticate, coordinator, lobbyOptions))
  server.define('pong', createPongRoom(coordinator)).on('join', (room, client) => room.admitted(client))
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createPlaygroundServer()
  server.listen(2567, '127.0.0.1').then(() => {
    console.log('Chibasko Playground : http://127.0.0.1:2567 (local uniquement)')
  }).catch(() => {
    console.error('Impossible de démarrer Colyseus sur 127.0.0.1:2567.')
    process.exitCode = 1
  })
  const stop = () => { void server.gracefullyShutdown(false) }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}
