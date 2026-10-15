'use client'
import { useSyncExternalStore, type ComponentType } from 'react'
import type { GameClientConnection, GameClientProps } from '../client/index.js'
export type { GameClientConnection, GameClientProps } from '../client/index.js'
export type GameClientModule = { gameId: string; default: ComponentType<GameClientProps> }
export type ClientGameRegistry = Readonly<Record<string, () => Promise<GameClientModule>>>
// Local games receive no network facade or account. The platform owns navigation.
export type LocalGameProps = { onExit(): void }
export type LocalGameModule = { gameId: string; default: ComponentType<LocalGameProps> }
export type LocalGameRegistry = Readonly<Record<string, () => Promise<LocalGameModule>>>
export function useChibaskoGame(connection: GameClientConnection) {
  const revision = useSyncExternalStore(connection.subscribe, connection.getRevision, () => 0)
  return {
    localPlayerId: connection.localPlayerId, session: connection.getSession(),
    state: connection.getState(), revision, subscribe: connection.subscribe, send: connection.send,
  } as const
}
