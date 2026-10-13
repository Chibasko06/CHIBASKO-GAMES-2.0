'use client'
import { useSyncExternalStore } from 'react'
import type { GameClientConnection } from './types'

export type { GameClientConnection, GameClientProps, GameClientModule, ClientGameRegistry } from './types'

// No context is needed: GameRuntime supplies one scoped connection to its module.
// State is unknown deliberately; each game validates/projects its own schema.
export function useChibaskoGame(connection: GameClientConnection) {
  const revision = useSyncExternalStore(connection.subscribe, connection.getRevision, () => 0)
  return {
    localPlayerId: connection.localPlayerId,
    state: connection.getState(),
    revision,
    subscribe: connection.subscribe,
    send: connection.send,
  } as const
}
