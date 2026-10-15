import type { GameDefinition, GameRegistry } from './types.js'
import { serverGameRegistration } from './types.ts'
import { pongDefinition } from './chibasko-pong/definition.ts'

const pong: GameDefinition = serverGameRegistration(pongDefinition, 'pong')
export const gameRegistry: GameRegistry = new Map([[pong.id, pong]])
export function resolveGame(id: unknown, registry: GameRegistry = gameRegistry): GameDefinition {
  if (typeof id !== 'string' || !registry.has(id)) throw new Error('UNKNOWN_GAME')
  return registry.get(id)!
}
