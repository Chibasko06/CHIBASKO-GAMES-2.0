'use client'
import { memo, useCallback, useMemo, useSyncExternalStore } from 'react'
import type { GameClientProps } from '@/games/sdk/client/types'
import { createPongPresentation } from './pongPresentation'
import PongCanvas from './PongCanvas'

export const gameId = 'chibasko-pong'
const serverSnapshot = () => null
function PongGame({ connection }: GameClientProps) {
  const presentation = useMemo(() => createPongPresentation(connection), [connection])
  const view = useSyncExternalStore(presentation.subscribe, presentation.getSnapshot, serverSnapshot)
  const { send } = connection
  const input = useCallback((direction: -1 | 0 | 1) => send('set_input', { direction }), [send])
  if (!view) return <p role="status">Préparation du terrain…</p>
  return <PongCanvas view={view} readFrame={presentation.getFrame} onInput={input} />
}
export default memo(PongGame)
