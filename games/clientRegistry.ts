import type { ClientGameRegistry, LocalGameRegistry } from '@chibaskogames/sdk/react'

// Explicit literal imports give Next.js one lazy chunk per internal game.
// No server registration, authoritative capacities or endpoint in this registry.
export const clientGameRegistry: ClientGameRegistry = Object.freeze({
  'chibasko-pong': () => import('@chibaskogames/chibasko-pong/client'),
})

// A separate optional loader keeps local code out of online game chunks.
export const localGameRegistry: LocalGameRegistry = Object.freeze({
  'chibasko-pong': () => import('@chibaskogames/chibasko-pong/local'),
})
