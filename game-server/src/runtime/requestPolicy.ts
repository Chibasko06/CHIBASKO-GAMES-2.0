import { isIP } from 'node:net'
import type { IncomingMessage, OutgoingHttpHeaders, OutgoingHttpHeader, RequestListener, Server as HttpServer } from 'node:http'
import type { RuntimePolicy } from './config.js'

type PeerRequest = Pick<IncomingMessage, 'headers'> & { socket: { remoteAddress?: string } }
function normalizedIp(value: string) { return value.startsWith('::ffff:') && isIP(value.slice(7)) === 4 ? value.slice(7) : value }
export function getTrustedClientIp(req: PeerRequest) {
  const direct = normalizedIp(req.socket.remoteAddress ?? '')
  if (!isIP(direct)) return 'unknown'
  const forwarded = req.headers['x-real-ip']
  if ((direct === '127.0.0.1' || direct === '::1') && typeof forwarded === 'string' && isIP(forwarded)) return normalizedIp(forwarded)
  return direct
}
export class WindowLimiter {
  private entries = new Map<string, { count: number; until: number }>()
  constructor(private limit: number, private windowMs = 60000, private maxKeys = 10000) {}
  take(key: string, now = Date.now()) {
    for (const [ip, value] of this.entries) if (value.until <= now) this.entries.delete(ip)
    let value = this.entries.get(key)
    if (!value) {
      if (this.entries.size >= this.maxKeys) return false
      value = { count: 0, until: now + this.windowMs }; this.entries.set(key, value)
    }
    return ++value.count <= this.limit
  }
  clear() { this.entries.clear() }
}
export function originAllowed(origin: string | null | undefined, policy: RuntimePolicy) {
  return origin ? policy.origins.includes(origin) : !policy.production
}
export type RuntimeState = { shuttingDown: boolean }
// Installed after Colyseus binds its routes, before listen() resolves. All HTTP
// requests pass this gate, including Colyseus OPTIONS and /matchmake/*.
export function installRequestPolicy(server: HttpServer, policy: RuntimePolicy, state: RuntimeState) {
  const handlers = server.listeners('request') as RequestListener[]
  server.removeAllListeners('request')
  const resolve = new WindowLimiter(10), create = new WindowLimiter(policy.production ? 10 : 100), matchmaking = new WindowLimiter(policy.production ? 60 : 600)
  server.on('close', () => { resolve.clear(); create.clear(); matchmaking.clear() })
  server.on('request', (req, res) => {
    const path = (req.url ?? '/').split('?')[0]!.replace(/\/+$/, '') || '/'
    res.setHeader('Cache-Control', 'no-store')
    const reply = (status: number, body: object) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
    if (path === '/health' && req.method === 'GET') { reply(state.shuttingDown ? 503 : 200, { status: state.shuttingDown ? 'shutting_down' : 'ok' }); return }
    if (path === '/' || path === '/__healthcheck') { reply(404, { error: 'NOT_FOUND' }); return }
    if (state.shuttingDown) { reply(503, { error: 'UNAVAILABLE' }); return }
    if (!originAllowed(req.headers.origin, policy)) { reply(403, { error: 'ORIGIN_DENIED' }); return }
    // Colyseus sets permissive CORS itself: overwrite at header commit too.
    const writeHead = res.writeHead.bind(res)
    res.writeHead = (status: number, messageOrHeaders?: string | OutgoingHttpHeaders | OutgoingHttpHeader[], headers?: OutgoingHttpHeaders | OutgoingHttpHeader[]) => {
      res.removeHeader('Access-Control-Allow-Credentials')
      res.removeHeader('Access-Control-Allow-Origin')
      if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      return typeof messageOrHeaders === 'string' ? writeHead(status, messageOrHeaders, headers) : writeHead(status, messageOrHeaders)
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
    const ip = getTrustedClientIp(req)
    // Remove untrusted alternate headers before Colyseus constructs AuthContext.
    delete req.headers['x-forwarded-for']; delete req.headers['x-client-ip']; delete req.headers['cf-connecting-ip']
    req.headers['x-real-ip'] = ip
    const limiter = path.startsWith('/lobbies/') ? resolve : path === '/matchmake/create/lobby' ? create : path.startsWith('/matchmake/') ? matchmaking : undefined
    if (limiter && !limiter.take(ip)) { res.setHeader('Retry-After', '60'); reply(429, { error: 'RATE_LIMIT' }); return }
    for (const handler of handlers) handler.call(server, req, res)
  })
}
