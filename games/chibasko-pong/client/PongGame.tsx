'use client'
import { useCallback } from 'react'
import { useChibaskoGame, type GameClientProps } from '@/games/sdk/client/index'
import { readPongView } from './pongView'
import PongCanvas from './PongCanvas'

export const gameId = 'chibasko-pong'
export default function PongGame({ connection }: GameClientProps) {
  const game = useChibaskoGame(connection)
  const { send } = game
  const view = readPongView(game.state, game.localPlayerId)
  const input = useCallback((direction: -1 | 0 | 1) => send('set_input', { direction }), [send])
  if (!view) return <p role="status">Préparation du terrain…</p>
  return <PongCanvas view={view} onInput={input} />
}
