'use client'
import type { createPongControls } from '../client/pongControls.js'
import styles from '../client/pong.module.css'
type Controls = ReturnType<typeof createPongControls>
export default function PongLocalControls({ left, right, active }: { left: Controls; right: Controls; active: boolean }) {
  return <div className={styles.localControls}>
    {([{ controls: left, name: 'Joueur 1', keys: 'Z / S' }, { controls: right, name: 'Joueur 2', keys: '↑ / ↓' }]).map(({ controls, name, keys }) => <div key={name} role="group" aria-label={'Contrôles ' + name} className={styles.localGroup}>
      <p className={styles.localLabel}>{name} · {keys}</p>
      <div className={styles.localButtons}>
        {([-1, 1] as const).map(direction => <button type="button" key={direction} disabled={!active} aria-label={(direction === -1 ? 'Monter' : 'Descendre') + ' ' + name}
          className={styles.localButton}
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
