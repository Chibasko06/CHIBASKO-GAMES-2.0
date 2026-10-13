import type { ClientGameRegistry } from './sdk/client/types'

// Explicit literal imports give Next.js one lazy chunk per internal game.
// No server registration, authoritative capacities or endpoint in this registry.
export const clientGameRegistry: ClientGameRegistry = Object.freeze({
  'chibasko-pong': () => import('./chibasko-pong/client/PongGame'),
})
