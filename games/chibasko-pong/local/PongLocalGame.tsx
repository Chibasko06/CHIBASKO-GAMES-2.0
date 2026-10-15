'use client'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { LocalGameProps } from '@chibaskogames/sdk/react'
import { createLocalPongRuntime } from './localRuntime.js'
import PongCanvas from '../client/PongCanvas.js'
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
  return <section ref={wrapper} data-pong-local-session aria-label="Partie locale" className={styles.localSession}>
    {view ? <PongCanvas view={view} readFrame={runtime.getFrame} onInput={left} onRightInput={right} /> : <p role="status">Préparation du terrain…</p>}
    {view?.phase === 'FINISHED' && <div role="status" aria-live="polite" className={styles.localResult}>
      <h2 className={styles.resultTitle}>Victoire {view.winnerSide === 'LEFT' ? 'Joueur 1' : 'Joueur 2'} !</h2>
      <p className={styles.resultScore}>{view.leftScore} — {view.rightScore}</p>
      <p className={styles.resultNote}>Partie locale, sans classement ni sauvegarde du résultat.</p>
      <button type="button" onClick={restart} className={styles.replay}>Rejouer</button>
    </div>}
    <button type="button" onClick={onExit} className={styles.exit}>Quitter la partie locale</button>
  </section>
}
