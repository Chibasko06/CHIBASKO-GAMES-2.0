import { Server } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { pathToFileURL } from 'node:url'
import { createPlaygroundRoom } from './rooms/PlaygroundRoom.js'
import { createSupabaseAuthenticator, type Authenticate } from './auth/supabaseAuth.js'
import { createLobbyRoom, type LobbyOptions } from './rooms/LobbyRoom.js'
import { GameSessionCoordinator, type GameBackend } from './platform/multiplayer/GameSessionCoordinator.js'
import { createPongRoom } from './games/chibasko-pong/PongRoom.js'
import { lobbyResolutionRoutes } from './lobby/resolveLobby.js'
import { gameRegistry } from './games/registry.js'
import { readPolicy, readRuntimeConfig, type RuntimePolicy } from './runtime/config.js'
import { installRequestPolicy, originAllowed, type RuntimeState } from './runtime/requestPolicy.js'
import { safeLog, sdkLogger } from './runtime/logging.js'
import { createShutdown } from './runtime/lifecycle.js'
export const runtimeStates = new WeakMap<Server, RuntimeState>()

export function createPlaygroundServer(authenticate: Authenticate = createSupabaseAuthenticator(
  process.env.SUPABASE_URL ?? '', process.env.SUPABASE_PUBLISHABLE_KEY ?? '',
), lobbyOptions: LobbyOptions = {}, sessionOptions: { timeoutMs?: number; backend?: Partial<GameBackend> } = {}, policy: RuntimePolicy = readPolicy()) {
  const state: RuntimeState = { shuttingDown: false }
  const coordinator = new GameSessionCoordinator(sessionOptions.timeoutMs, sessionOptions.backend, () => !state.shuttingDown)
  const guardedAuthenticate: Authenticate = async token => {
    if (state.shuttingDown) throw new Error('UNAVAILABLE')
    const identity = await authenticate(token)
    if (state.shuttingDown) throw new Error('UNAVAILABLE')
    return identity
  }
  const creators = new Map<string, number>()
  const reserveCreation = (userId: string) => {
    const count = creators.get(userId) ?? 0
    if (count >= 3) return undefined
    creators.set(userId, count + 1)
    let released = false
    return () => { if (released) return; released = true; const next = (creators.get(userId) ?? 1) - 1; if (next) creators.set(userId, next); else creators.delete(userId) }
  }
  const registry = new Map([...(lobbyOptions.registry ?? gameRegistry)].filter(([id]) => policy.enabledGames.includes(id)))
  const server = new Server({
    transport: new WebSocketTransport({ beforeUpgrade: request => {
      if (state.shuttingDown) return new Response(null, { status: 503 })
      if (!originAllowed(request.headers.get('origin'), policy)) return new Response(null, { status: 403 })
      const url = new URL(request.url)
      const params = [...url.searchParams.keys()]
      if (params.length !== 1 || params[0] !== 'sessionId' || request.headers.has('authorization')) return new Response(null, { status: 403 })
    } }),
    logger: sdkLogger,
    greet: false,
    gracefullyShutdown: false,
    express: lobbyResolutionRoutes(guardedAuthenticate),
  })
  if (!policy.production) server.define('playground', createPlaygroundRoom(guardedAuthenticate))
  server.define('lobby', createLobbyRoom(guardedAuthenticate, coordinator, { ...lobbyOptions, registry, reserveCreation, available: () => !state.shuttingDown }))
  server.define('pong', createPongRoom(coordinator)).on('join', (room, client) => room.admitted(client))
  runtimeStates.set(server, state)
  const listen = server.listen.bind(server)
  server.listen = (port, hostname, backlog, callback) => listen(port, hostname, backlog, (error?: Error) => {
    installRequestPolicy(server.transport.server!, policy, state)
    callback?.(error)
  })
  let completed = false
  server.onBeforeShutdown(async () => { state.shuttingDown = true; await coordinator.shutdown() })
  server.onShutdown(() => { completed = true })
  const graceful = server.gracefullyShutdown.bind(server)
  server.gracefullyShutdown = async (exit = true, error) => {
    const http = server.transport.server
    const closed = http?.listening ? new Promise<void>(resolve => http.once('close', resolve)) : Promise.resolve()
    await graceful(false, error)
    if (!completed) throw new Error('SHUTDOWN_FAILED')
    await closed
    if (exit) process.exit(error ? 1 : 0)
  }
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { policy, authenticate } = readRuntimeConfig()
    const server = createPlaygroundServer(authenticate, {}, {}, policy)
    const stop = createShutdown(runtimeStates.get(server)!, () => server.gracefullyShutdown(false), code => process.exit(code), policy.shutdownMs)
    let signalSeen = false
    const signal = () => { void stop(false, signalSeen); signalSeen = true }
    process.on('SIGINT', signal)
    process.on('SIGTERM', signal)
    let fatalSeen = false
    const fatal = () => { if (!fatalSeen) { fatalSeen = true; safeLog('fatal_error') }; void stop(true) }
    process.on('uncaughtException', fatal)
    process.on('unhandledRejection', fatal)
    server.transport.server?.on('error', fatal)
    void server.listen(policy.port, policy.host).then(() => safeLog('server_started')).catch(fatal)
  } catch { safeLog('fatal_error'); process.exitCode = 1 }
}
