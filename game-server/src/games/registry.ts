import type { GameDefinition, GameRegistry } from './types.js'

const pong: GameDefinition = Object.freeze({ id: 'chibasko-pong', roomType: 'pong', minPlayers: 2, maxPlayers: 2 })
export const gameRegistry: GameRegistry = new Map([[pong.id, pong]])
export function resolveGame(id: unknown, registry: GameRegistry = gameRegistry): GameDefinition {
  if (typeof id !== 'string' || !registry.has(id)) throw new Error('UNKNOWN_GAME')
  return registry.get(id)!
}
