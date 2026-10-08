import { Server } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { pathToFileURL } from 'node:url'
import { createPlaygroundRoom } from './rooms/PlaygroundRoom.js'
import { createSupabaseAuthenticator, type Authenticate } from './auth/supabaseAuth.js'

export function createPlaygroundServer(authenticate: Authenticate = createSupabaseAuthenticator(
  process.env.SUPABASE_URL ?? '', process.env.SUPABASE_PUBLISHABLE_KEY ?? '',
)) {
  const server = new Server({
    transport: new WebSocketTransport(),
    greet: false,
    gracefullyShutdown: false,
  })
  server.define('playground', createPlaygroundRoom(authenticate))
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
