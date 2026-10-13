'use client'
import { Component, Suspense, lazy, type ReactNode, type LazyExoticComponent, type ComponentType } from 'react'
import { clientGameRegistry } from '@/games/clientRegistry'
import type { ClientGameRegistry, GameClientProps } from '@/lib/multiplayer/gameClientModule'

function Unavailable() { return <p role="status">Ce jeu est temporairement indisponible sur Chibasko Games.</p> }
class ModuleBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <Unavailable /> : this.props.children }
}
// Injection is used only by tests; production always uses the explicit registry.
export function createGameRuntime(registry: ClientGameRegistry) {
  const loaded = new Map<string, LazyExoticComponent<ComponentType<GameClientProps>>>()
  return function GameRuntime({ gameId, connection }: GameClientProps & { gameId: string }) {
    if (!Object.hasOwn(registry, gameId)) return <Unavailable />
    let Game = loaded.get(gameId)
    if (!Game) {
      const loader = registry[gameId]!
      Game = lazy(async () => {
        const loadedModule = await loader()
        if (loadedModule.gameId !== gameId) throw new Error('Game module unavailable')
        return { default: loadedModule.default }
      })
      loaded.set(gameId, Game)
    }
    return <ModuleBoundary key={gameId}><Suspense fallback={<p role="status">Chargement du jeu…</p>}><Game connection={connection} /></Suspense></ModuleBoundary>
  }
}
export default createGameRuntime(clientGameRegistry)
