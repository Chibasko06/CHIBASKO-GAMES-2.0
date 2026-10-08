import { matchMaker } from '@colyseus/core'
import type { ServerOptions } from '@colyseus/core'
import type { Authenticate, AuthenticatedPlayer } from '../auth/supabaseAuth.js'

// Single-process, authenticated lookup. No list endpoint, roster or reservations.
export function lobbyResolutionRoutes(authenticate: Authenticate): NonNullable<ServerOptions['express']> {
  const requests = new Map<string, { count: number; until: number }>()
  return app => {
    app.options('/lobbies/:code', (_req, res) => {
      res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Allow-Methods': 'POST' }).sendStatus(204)
    })
    app.post('/lobbies/:code', async (req, res) => {
      res.set({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' })
      const now = Date.now()
      for (const [ip, quota] of requests) if (quota.until <= now) requests.delete(ip)
      const ip = req.socket.remoteAddress ?? 'unknown'
      const quota = requests.get(ip) ?? { count: 0, until: now + 60000 }
      if (requests.size >= 10000 && !requests.has(ip)) { res.status(429).json({ error: 'RATE_LIMIT' }); return }
      requests.set(ip, quota)
      if (++quota.count > 10) { res.status(429).json({ error: 'RATE_LIMIT' }); return }
      const code = req.params.code
      if (typeof code !== 'string' || !/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code)) { res.status(400).json({ error: 'INVALID_CODE' }); return }
      let identity: AuthenticatedPlayer
      try { identity = await authenticate(req.get('Authorization')?.match(/^Bearer (.+)$/)?.[1]) }
      catch { res.status(401).json({ error: 'AUTH_REQUIRED' }); return }
      const room = matchMaker.getLocalRoomById(code)
      if (!room || room.roomName !== 'lobby') { res.status(404).json({ error: 'LOBBY_NOT_FOUND' }); return }
      const state = room.state as { status: string; gameId: string; maxPlayers: number; players: Map<string, { userId: string }> }
      for (const player of state.players.values()) if (player.userId === identity.userId) { res.status(409).json({ error: 'DUPLICATE_USER' }); return }
      if (state.status !== 'WAITING') { res.status(409).json({ error: 'LOBBY_STARTED' }); return }
      if (state.players.size >= state.maxPlayers) { res.status(409).json({ error: 'LOBBY_FULL' }); return }
      res.json({ gameId: state.gameId })
    })
  }
}
