import type { GameClientConnection } from '@/games/sdk/client/types'
import { readPongView, type PongView } from './pongView'

export type PongFrame = { previous: PongView | null; current: PongView; receivedAt: number; goUntil: number }
// One SDK subscription. React observes HUD changes; motion is read imperatively.
export function createPongPresentation(connection: GameClientConnection, now = () => performance.now()) {
  let revision = -1, frame: PongFrame | null = null, snapshot: PongView | null = null, key = '', pointName = ''
  function refresh() {
    const nextRevision = connection.getRevision()
    if (revision === nextRevision) return
    revision = nextRevision
    const next = readPongView(connection.getState(), connection.localPlayerId)
    if (!next) { frame = null; snapshot = null; key = ''; return }
    const previous = frame?.current ?? null, time = now()
    if (previous && next.leftScore > previous.leftScore) pointName = next.leftName
    if (previous && next.rightScore > previous.rightScore) pointName = next.rightName
    if (next.phase === 'COUNTDOWN' || next.phase === 'READY') pointName = ''
    next.pointName = pointName
    frame = { previous: previous?.phase === next.phase && previous.leftScore === next.leftScore && previous.rightScore === next.rightScore ? previous : null,
      current: next, receivedAt: time,
      goUntil: previous?.phase === 'COUNTDOWN' && next.phase === 'PLAYING' ? time + 450 : (frame?.goUntil ?? 0) }
    const nextKey = JSON.stringify([next.phase, Math.ceil(next.remainingMs / 1000), next.leftScore, next.rightScore,
      next.leftName, next.rightName, next.leftAvatar, next.rightAvatar, next.selfSide, next.winnerSide, pointName])
    if (nextKey !== key) { snapshot = next; key = nextKey }
  }
  return { subscribe: connection.subscribe,
    getSnapshot() { refresh(); return snapshot },
    getFrame() { refresh(); return frame },
  }
}
