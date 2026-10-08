import { matchMaker } from '@colyseus/core'
import type { ServerOptions } from '@colyseus/core'
import type { Authenticate, AuthenticatedPlayer } from '../auth/supabaseAuth.js'

// Single-process, authenticated lookup. No list endpoint, roster or reservations.
export function lobbyResolutionRoutes(authenticate: Authenticate): NonNullable<ServerOptions['express']> {
  return app => {
    app.post('/lobbies/:code', async (req, res) => {
      res.set({ 'Cache-Control': 'no-store' })
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
