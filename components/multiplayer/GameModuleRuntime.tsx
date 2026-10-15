'use client'
import { Component, Suspense, lazy, type ReactNode, type ComponentType } from 'react'

function Unavailable() { return <p role="status">Ce jeu est temporairement indisponible sur Chibasko Games.</p> }
class ModuleBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <Unavailable /> : this.props.children }
}
export function createModuleRuntime<Props extends object>(registry: Readonly<Record<string, () => Promise<{ gameId: string; default: ComponentType<Props> }>>>) {
  const loaded = new Map<string, ReturnType<typeof lazy<ComponentType<Props>>>>()
  return function ModuleRuntime({ gameId, ...props }: Props & { gameId: string }) {
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
    return <ModuleBoundary key={gameId}><Suspense fallback={<p role="status">Chargement du jeu…</p>}><Game {...props as Props} /></Suspense></ModuleBoundary>
  }
}
