import type { ComponentType } from 'react'

// Public-state capability only. The platform owns the transport and its lifetime.
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
