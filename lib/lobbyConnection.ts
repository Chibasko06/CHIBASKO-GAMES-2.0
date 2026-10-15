import { connectGameRoom } from './gameConnection'

export type LobbyPlayer = { userId: string; username: string; avatarUrl: string; ready: boolean }
export type LobbyClientState = {
  visibility?: 'public' | 'private'
  code: string; status: string; hostUserId: string; gameId: string; minPlayers: number; maxPlayers: number
  players: { forEach(callback: (player: LobbyPlayer, id: string) => void): void; get(id: string): LobbyPlayer | undefined }
  winnerUserId?: string; resultReason?: string
  resultPlayers?: { forEach(callback: (player: { userId: string; username: string; score?: number; hasScore?: boolean }) => void): void }
}
export function normalizeLobbyCode(input: string) {
  const code = input.trim().toUpperCase()
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code)) throw new Error('Code invalide')
  return code
}
export type LobbyAccess = { visibility?: 'public' | 'private'; publicOnly?: boolean }
export async function connectLobby(token: string, code: string | undefined, endpoint: string | undefined, gameId: string, access: LobbyAccess = {}) {
  const creating = code === undefined
  const target = creating ? 'lobby' : normalizeLobbyCode(code)
  if (!gameId) throw new Error('UNKNOWN_GAME')
  const room = await connectGameRoom<LobbyClientState>(token, creating ? 'create' : 'joinById', target, endpoint,
    creating ? { gameId, visibility: access.visibility ?? 'private' } : { expectedGameId: gameId, ...(access.publicOnly ? { publicOnly: true } : {}) })
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); room.onStateChange.remove(check); room.onLeave.remove(failed) }
      const failed = () => { cleanup(); reject(new Error('Admission refusée')) }
      const check = () => {
        const self = room.state?.players?.get(room.sessionId)
        if (!self) return
        if (room.state.gameId !== gameId || room.state.code !== room.roomId || (creating && room.state.hostUserId !== self.userId)) { failed(); return }
        cleanup(); resolve()
      }
      const timer = setTimeout(failed, 5000)
      room.onStateChange(check)
      room.onLeave(failed)
      check()
    })
    return room
  } catch {
    await room.leave().catch(() => {})
    throw new Error('Admission refusée')
  }
}
