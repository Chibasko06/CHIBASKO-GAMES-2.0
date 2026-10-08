import { connectGameRoom } from './gameConnection'

export type LobbyPlayer = { userId: string; username: string; avatarUrl: string; ready: boolean }
export type LobbyClientState = {
  code: string; status: string; hostUserId: string; gameId: string; minPlayers: number; maxPlayers: number
  players: { forEach(callback: (player: LobbyPlayer, id: string) => void): void; get(id: string): LobbyPlayer | undefined }
}
export function normalizeLobbyCode(input: string) {
  const code = input.trim().toUpperCase()
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code)) throw new Error('Code invalide')
  return code
}
export async function connectLobby(token: string, code?: string, endpoint?: string, gameId = 'chibasko-pong') {
  const creating = code === undefined
  const room = await connectGameRoom<LobbyClientState>(token, creating ? 'create' : 'joinById', creating ? 'lobby' : normalizeLobbyCode(code), endpoint, creating ? { gameId } : { expectedGameId: gameId })
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
