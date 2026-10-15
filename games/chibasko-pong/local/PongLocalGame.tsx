'use client'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { LocalGameProps } from '@chibaskogames/sdk/react'
import { createLocalPongRuntime } from './localRuntime'
import PongCanvas from '../client/PongCanvas'
import styles from '../client/pong.module.css'

export const gameId = 'chibasko-pong'
const serverSnapshot = () => null
export default function PongLocalGame({ onExit }: LocalGameProps) {
  const [runtime] = useState(createLocalPongRuntime)
  const wrapper = useRef<HTMLElement>(null)
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, serverSnapshot)
  const left = useCallback((direction: -1 | 0 | 1) => runtime.setInput('LEFT', direction), [runtime])
  const right = useCallback((direction: -1 | 0 | 1) => runtime.setInput('RIGHT', direction), [runtime])
  useEffect(() => {
    runtime.restart()
    let previous = performance.now(), id = 0
    const render = (time: number) => { if (!document.hidden) runtime.advance(time - previous, time); previous = time; id = requestAnimationFrame(render) }
    id = requestAnimationFrame(render)
    wrapper.current?.querySelector('canvas')?.focus({ preventScroll: true })
    // Hidden tabs pause local time rather than fast-forwarding an unseen match.
    const visibility = () => { runtime.clearInputs(); previous = performance.now() }
    document.addEventListener('visibilitychange', visibility)
    return () => { cancelAnimationFrame(id); document.removeEventListener('visibilitychange', visibility); runtime.dispose() }
  }, [runtime])
  function restart() { runtime.restart(); wrapper.current?.querySelector('canvas')?.focus({ preventScroll: true }) }
  return <section ref={wrapper} data-pong-local-session aria-label="Partie locale" className={styles.localSession + ' min-w-0 space-y-5'}>
    {view ? <PongCanvas view={view} readFrame={runtime.getFrame} onInput={left} onRightInput={right} /> : <p role="status">Préparation du terrain…</p>}
    {view?.phase === 'FINISHED' && <div role="status" aria-live="polite" className="space-y-3 rounded-2xl border border-cyan-800 bg-cyan-950/30 p-5 text-center">
      <h2 className="text-2xl font-black">Victoire {view.winnerSide === 'LEFT' ? 'Joueur 1' : 'Joueur 2'} !</h2>
      <p className="text-3xl font-black tabular-nums">{view.leftScore} — {view.rightScore}</p>
      <p className="text-sm text-zinc-400">Partie locale, sans classement ni sauvegarde du résultat.</p>
      <button type="button" onClick={restart} className="min-h-12 rounded-xl bg-cyan-400 px-6 py-3 font-bold text-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300">Rejouer</button>
    </div>}
    <button type="button" onClick={onExit} className="min-h-12 rounded-xl border border-zinc-700 px-5 py-3 font-bold text-zinc-200 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-cyan-300">Quitter la partie locale</button>
  </section>
}
