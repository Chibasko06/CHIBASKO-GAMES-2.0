'use client'
import { useCallback, useSyncExternalStore } from 'react'
import type { GameClientProps } from '@/lib/multiplayer/gameClientModule'
import { readPongView } from './pongView'
import PongCanvas from './PongCanvas'

export const gameId = 'chibasko-pong'
export default function PongGame({ connection }: GameClientProps) {
  useSyncExternalStore(connection.subscribe, connection.getRevision, () => 0)
  const view = readPongView(connection.getState(), connection.localPlayerId)
  const input = useCallback((direction: -1 | 0 | 1) => connection.send('set_input', { direction }), [connection])
  if (!view) return <p role="status">Préparation du terrain…</p>
  return <PongCanvas view={view} onInput={input} />
}
