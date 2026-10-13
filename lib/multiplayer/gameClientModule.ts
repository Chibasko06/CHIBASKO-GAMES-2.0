import type { ComponentType } from 'react'

// A public-state capability, not a Room owner: no JWT, auth, endpoint or leave.
export type GameClientConnection = Readonly<{
  localPlayerId: string
  getState(): unknown
  getRevision(): number
  subscribe(listener: () => void): () => void
  send(type: string, payload?: unknown): void
}>
export type GameClientProps = { connection: GameClientConnection }
export type GameClientModule = { gameId: string; default: ComponentType<GameClientProps> }
export type ClientGameRegistry = Readonly<Record<string, () => Promise<GameClientModule>>>

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
