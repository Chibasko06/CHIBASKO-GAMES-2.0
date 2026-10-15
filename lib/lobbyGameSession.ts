import { createGameClientConnection } from './multiplayer/gameClientModule'
import { consumeGameReservation } from './gameConnection'
import { readGameSession } from './multiplayer/gameSessionMetadata'
import type { GameSessionSnapshot } from '@chibaskogames/sdk'

// Gameplay state is opaque to the platform.
export type BridgeGameState = unknown
type GameConnection = Awaited<ReturnType<typeof consumeGameReservation<BridgeGameState>>>
type Offer = { transitionId: string; gameId: string; reservation: unknown }
export function createLobbyGameSession(
  changed: (room: GameConnection | null, failed: boolean, session: GameSessionSnapshot | null) => void,
  consume = (reservation: unknown) => consumeGameReservation<BridgeGameState>(reservation),
) {
  let generation = 0
  let room: GameConnection | null = null
  let transitionId: string | null = null
  let disposed = false
  let publicConnection: ReturnType<typeof createGameClientConnection> | null = null
  let session: GameSessionSnapshot | null = null
  let metadataTimer: ReturnType<typeof setTimeout> | undefined
  const close = (failed = false) => {
    clearTimeout(metadataTimer); metadataTimer = undefined
    publicConnection?.dispose(); publicConnection = null; session = null
    generation++
    transitionId = null
    const previous = room
    room = null
    if (previous) {
      if (previous.connection?.isOpen === false) previous.removeAllListeners?.()
      else void previous.leave().catch(() => {}).finally(() => previous.removeAllListeners?.())
    }
    if (!disposed) changed(null, failed, null)
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
        publicConnection = createGameClientConnection({ getSession: () => session, getState: () => next.state, send: (type, payload) => { if (room === next && !disposed && typeof type === 'string' && !type.startsWith('__sdk_')) next.send(type, payload) } })
        const refresh = () => { if (room === next && !disposed) { publicConnection?.changed(); changed(next, false, session) } }
        next.onMessage('__sdk_session', (message: unknown) => {
          if (room !== next || disposed) return
          const decoded = readGameSession(message, expectedGameId)
          if (!decoded) { close(true); return }
          clearTimeout(metadataTimer); metadataTimer = undefined
          session = decoded; refresh()
        })
        next.onStateChange(refresh)
        next.onLeave(() => { if (room === next) close(true) })
        next.onError(() => { if (room === next) close(true) })
        // Pull after listeners exist: initial server messages may precede consume().
        metadataTimer = setTimeout(() => { if (room === next && !session) close(true) }, 10000)
        next.send('__sdk_session')
        refresh()
      } catch { if (!disposed && generation === attempt) close(true) }
    },
    cancelled(id: string) { if (transitionId === id) close() },
    close,
    getConnection() { return publicConnection?.connection ?? null },
    dispose() { disposed = true; close() },
  }
}
