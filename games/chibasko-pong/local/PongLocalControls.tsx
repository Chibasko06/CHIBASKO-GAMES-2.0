'use client'
import type { createPongControls } from '../client/pongControls'
import styles from '../client/pong.module.css'
type Controls = ReturnType<typeof createPongControls>
export default function PongLocalControls({ left, right, active }: { left: Controls; right: Controls; active: boolean }) {
  return <div className={styles.localControls + ' grid min-w-0 grid-cols-2 gap-3'}>
    {([{ controls: left, name: 'Joueur 1', keys: 'Z / S' }, { controls: right, name: 'Joueur 2', keys: '↑ / ↓' }]).map(({ controls, name, keys }) => <div key={name} role="group" aria-label={'Contrôles ' + name} className="min-w-0 space-y-2">
      <p className="text-center text-sm font-bold text-zinc-200">{name} · {keys}</p>
      <div className="grid grid-cols-2 gap-2">
        {([-1, 1] as const).map(direction => <button type="button" key={direction} disabled={!active} aria-label={(direction === -1 ? 'Monter' : 'Descendre') + ' ' + name}
          className="min-h-16 min-w-0 touch-none select-none rounded-xl border border-cyan-800 bg-cyan-950/50 px-2 py-3 text-2xl text-cyan-100 active:bg-cyan-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:opacity-40"
          onPointerDown={event => {
            if (!active || (event.pointerType === 'mouse' && event.button !== 0)) return
            event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); controls.press(event.pointerId, direction)
          }}
          onPointerUp={event => controls.release(event.pointerId)} onPointerCancel={event => controls.release(event.pointerId)}
          onPointerLeave={event => controls.release(event.pointerId)} onLostPointerCapture={event => controls.release(event.pointerId)}
          onKeyDown={event => { if (active && [' ', 'Enter'].includes(event.key)) { event.preventDefault(); controls.press(direction - 10, direction) } }}
          onKeyUp={event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); controls.release(direction - 10) } }} onBlur={controls.reset}>
          <span aria-hidden="true">{direction === -1 ? '▲' : '▼'}</span>
        </button>)}
      </div>
    </div>)}
  </div>
}
