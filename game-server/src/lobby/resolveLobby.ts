import { matchMaker } from '@colyseus/core'
import type { ServerOptions } from '@colyseus/core'
import type { Authenticate, AuthenticatedPlayer } from '../auth/supabaseAuth.js'
import type { GameRegistry } from '../games/types.js'
import type { PublicLobbyDirectory } from './PublicLobbyDirectory.js'

// Single-process, authenticated discovery. No private roster or reservations.
export function lobbyResolutionRoutes(authenticate: Authenticate, directory: PublicLobbyDirectory, registry: GameRegistry): NonNullable<ServerOptions['express']> {
  return app => {
    app.get('/lobbies/public', async (req, res) => {
      res.set({ 'Cache-Control': 'no-store' })
      const gameId = req.query.gameId
      if (typeof gameId !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(gameId) || Object.keys(req.query).length !== 1) { res.status(400).json({ error: 'UNKNOWN_GAME' }); return }
      const game = registry.get(gameId)
      if (!game) { res.status(404).json({ error: 'UNKNOWN_GAME' }); return }
      if (!game.definition.capabilities.online?.access.includes('public')) { res.status(403).json({ error: 'ACCESS_UNSUPPORTED' }); return }
      try { await authenticate(req.get('Authorization')?.match(/^Bearer (.+)$/)?.[1]) }
      catch { res.status(401).json({ error: 'AUTH_REQUIRED' }); return }
      const lobbies = directory.list(gameId).filter(summary => {
        const room = matchMaker.getLocalRoomById(summary.code)
        const state = room?.state as { status?: string; visibility?: string; gameId?: string } | undefined
        return room?.roomName === 'lobby' && !room.locked && !room.hasReachedMaxClients() && state?.status === 'WAITING' && state.visibility === 'public' && state.gameId === gameId
      })
      res.json({ lobbies })
    })
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
      if (!registry.has(state.gameId)) { res.status(404).json({ error: 'LOBBY_NOT_FOUND' }); return }
      for (const player of state.players.values()) if (player.userId === identity.userId) { res.status(409).json({ error: 'DUPLICATE_USER' }); return }
      if (state.status !== 'WAITING') { res.status(409).json({ error: 'LOBBY_STARTED' }); return }
      if (state.players.size >= state.maxPlayers) { res.status(409).json({ error: 'LOBBY_FULL' }); return }
      res.json({ gameId: state.gameId })
    })
  }
}
