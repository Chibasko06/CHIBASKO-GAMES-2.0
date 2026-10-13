import type { GameClientConnection } from '@/games/sdk/client/types'
// Compatibility imports for platform adapters; game modules import the SDK.
export type { GameClientConnection, GameClientProps, GameClientModule, ClientGameRegistry } from '@/games/sdk/client/types'

export function createGameClientConnection(source: {
  localPlayerId: string; getState(): unknown; send(type: string, payload?: unknown): void
}) {
  let active = true, revision = 0
  const listeners = new Set<() => void>()
  const connection: GameClientConnection = Object.freeze({
    localPlayerId: source.localPlayerId,
    getState: () => active ? source.getState() : null,
    getRevision: () => revision,
    subscribe(listener: () => void) { if (active) listeners.add(listener); return () => { listeners.delete(listener) } },
    send(type: string, payload?: unknown) { if (active) source.send(type, payload) },
  })
  return { connection,
    changed() { if (active) { revision++; listeners.forEach(fn => fn()) } },
    dispose() { if (!active) return; active = false; revision++; listeners.forEach(fn => fn()); listeners.clear() },
  }
}
