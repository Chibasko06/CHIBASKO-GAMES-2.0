import { createGameClientConnection } from './multiplayer/gameClientModule'
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
  let publicConnection: ReturnType<typeof createGameClientConnection> | null = null
  const close = (failed = false) => {
    publicConnection?.dispose(); publicConnection = null
    generation++
    transitionId = null
    const previous = room
    room = null
    if (previous) {
      if (previous.connection?.isOpen === false) previous.removeAllListeners?.()
      else void previous.leave().catch(() => {}).finally(() => previous.removeAllListeners?.())
    }
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
        publicConnection = createGameClientConnection({ localPlayerId: next.sessionId, getState: () => next.state, send: (type, payload) => { if (room === next && !disposed) next.send(type, payload) } })
        const refresh = () => { if (room === next && !disposed) { publicConnection?.changed(); changed(next, false) } }
        next.onStateChange(refresh)
        next.onLeave(() => { if (room === next) close(true) })
        next.onError(() => { if (room === next) close(true) })
        refresh()
      } catch { if (!disposed && generation === attempt) close(true) }
    },
    cancelled(id: string) { if (transitionId === id) close() },
    close,
    getConnection() { return publicConnection?.connection ?? null },
    dispose() { disposed = true; close() },
  }
}
