import { consumeGameReservation } from './gameConnection'

export type BridgeGameState = {
  gameId: string; status: string; expectedPlayers: number
  players: { forEach(callback: (player: { userId: string; username: string; avatarUrl: string }, sessionId: string) => void): void }
}
type GameConnection = Awaited<ReturnType<typeof consumeGameReservation<BridgeGameState>>>
type Offer = { transitionId: string; gameId: string; reservation: unknown }
export function createLobbyGameSession(
  changed: (room: GameConnection | null, failed: boolean) => void,
  consume = (reservation: unknown) => consumeGameReservation<BridgeGameState>(reservation),
) {
  let generation = 0
  let room: GameConnection | null = null
  let transitionId: string | null = null
  let disposed = false
  const close = (failed = false) => {
    generation++
    transitionId = null
    const previous = room
    room = null
    void previous?.leave().catch(() => {})
    if (!disposed) changed(null, failed)
  }
  return {
    async receive(message: unknown, expectedGameId: string) {
      if (disposed || !message || typeof message !== 'object') return
      const offer = message as Offer
      if (typeof offer.transitionId !== 'string' || offer.gameId !== expectedGameId || !offer.reservation) return
      if (transitionId === offer.transitionId) return
      close()
      transitionId = offer.transitionId
      const attempt = generation
      try {
        const next = await consume(offer.reservation)
        if (disposed || generation !== attempt) { await next.leave().catch(() => {}); return }
        room = next
        const refresh = () => { if (room === next && !disposed) changed(next, false) }
        next.onStateChange(refresh)
        next.onLeave(() => { if (room === next) close(true) })
        next.onError(() => { if (room === next) close(true) })
        refresh()
      } catch { if (!disposed && generation === attempt) close(true) }
    },
    cancelled(id: string) { if (transitionId === id) close() },
    close,
    dispose() { disposed = true; close() },
  }
}
