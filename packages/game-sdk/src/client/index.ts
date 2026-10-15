import type { GameSessionSnapshot } from '../index.js'

export type GameClientConnection = Readonly<{
  // Session participant, never a network connection ID. Singular convenience for online.
  localPlayerId: string
  getSession(): GameSessionSnapshot | null
  getState(): unknown
  getRevision(): number
  subscribe(listener: () => void): () => void
  send(type: string, payload?: unknown): void
}>
export type GameClientProps = { connection: GameClientConnection }
