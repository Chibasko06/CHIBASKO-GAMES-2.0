import type { GameClientConnection } from '@chibaskogames/sdk/client'
import type { GameSessionSnapshot } from '@chibaskogames/sdk'
// Compatibility imports for platform adapters; game modules import the SDK.
export type { GameClientConnection, GameClientProps } from '@chibaskogames/sdk/client'
export type { GameClientModule, ClientGameRegistry } from '@chibaskogames/sdk/react'

export function createGameClientConnection(source: {
  localPlayerId?: string; getSession?(): GameSessionSnapshot | null; getState(): unknown; send(type: string, payload?: unknown): void
}) {
  let active = true, revision = 0
  const listeners = new Set<() => void>()
  const connection: GameClientConnection = Object.freeze({
    get localPlayerId() { return active ? source.getSession?.()?.localParticipantIds[0] ?? source.localPlayerId ?? '' : '' },
    getSession: () => active ? source.getSession?.() ?? null : null,
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
