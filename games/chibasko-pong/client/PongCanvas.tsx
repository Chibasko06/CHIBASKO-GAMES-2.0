'use client'
/* eslint-disable @next/next/no-img-element -- Portable React game: avatars are public URLs supplied by the SDK. */
import { useEffect, useId, useMemo, useRef } from 'react'
import type { PongView } from './pongView.js'
import type { PongFrame } from './pongPresentation.js'
import { createPongControls, localLeftKeys, type Direction } from './pongControls.js'
import { fitPongCourt } from './pongLayout.js'
import { drawPong } from './pongRenderer.js'
import styles from './pong.module.css'
import PongLocalControls from '../local/PongLocalControls.js'

const ignoreInput = () => {}
const controlClass = styles.touchButton
function Player({ name, avatar, local, right, keys }: { name: string; avatar?: string; local: boolean; right?: boolean; keys?: string }) {
  return <div className={styles.player + (right ? ' ' + styles.rightPlayer : '')}>
    {avatar ? <img loading="lazy" decoding="async" referrerPolicy="no-referrer" src={avatar} alt="" width={36} height={36} className={styles.avatar} /> : <span aria-hidden="true" className={styles.avatarFallback + (right ? ' ' + styles.warmAvatar : '')}>{name.slice(0, 1).toUpperCase() || '?'}</span>}
    <p className={styles.playerName + (right ? ' ' + styles.warmName : '')}>{name || 'Joueur'}</p>
    <span className={styles.playerHint}>{keys ?? (local ? 'Toi' : 'Adversaire')} · {right ? 'Droite' : 'Gauche'}</span>
  </div>
}
export default function PongCanvas({ view, onInput, onRightInput, readFrame }: { view: PongView; onInput(direction: Direction): void; onRightInput?: (direction: Direction) => void; readFrame?: () => PongFrame | null }) {
  const canvas = useRef<HTMLCanvasElement>(null), latest = useRef(view)
  const root = useRef<HTMLElement>(null)
  const local = !!onRightInput
  const controls = useMemo(() => createPongControls(onInput, local ? localLeftKeys : undefined), [onInput, local])
  const rightControls = useMemo(() => createPongControls(onRightInput ?? ignoreInput), [onRightInput])
  const clear = useMemo(() => () => { controls.reset(); if (local) rightControls.reset() }, [controls, rightControls, local])
  const controlsId = useId()
  const active = ['COUNTDOWN', 'PLAYING', 'POINT_PAUSE'].includes(view.phase) && (local || ['LEFT', 'RIGHT'].includes(view.selfSide))
  useEffect(() => { latest.current = view }, [view])
  useEffect(() => { if (root.current) return fitPongCourt(root.current) }, [])
  useEffect(() => {
    const visibility = () => { if (document.hidden) clear() }
    window.addEventListener('blur', clear); document.addEventListener('visibilitychange', visibility)
    return () => { window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', visibility); clear() }
  }, [clear])
  useEffect(() => { if (!active) clear() }, [active, clear])
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let id = 0, disposed = false
    const render = (time: number) => {
      if (disposed) return
      const frame = readFrame ? readFrame() : { previous: null, current: latest.current, receivedAt: time, goUntil: 0 }
      if (frame) drawPong(ctx, frame, time, media?.matches ?? false)
      if (window.requestAnimationFrame) id = window.requestAnimationFrame(render)
    }
    render(performance.now())
    return () => { disposed = true; if (id) window.cancelAnimationFrame(id) }
  }, [readFrame])
  function keyboard(event: React.KeyboardEvent, down: boolean) {
    if (!active) return
    if (!local) { if (controls.key(event.key, down)) event.preventDefault(); return }
    const key = event.key.toLowerCase()
    if (controls.key(key, down)) event.preventDefault()
    if (['arrowup', 'arrowdown'].includes(key)) { rightControls.key(key, down); event.preventDefault() }
  }
  function press(event: React.PointerEvent<HTMLButtonElement>, direction: Direction) {
    if (!active || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    controls.press(event.pointerId, direction)
  }
  const phaseText = view.phase === 'COUNTDOWN' ? 'Départ dans ' + Math.max(1, Math.ceil(view.remainingMs / 1000)) + '…'
    : view.phase === 'POINT_PAUSE' ? (view.pointName ? 'Point pour ' + view.pointName + ' !' : 'Point marqué !')
    : view.phase === 'FINISHED' ? (local ? 'Victoire ' + (view.winnerSide === 'LEFT' ? view.leftName : view.rightName) + ' !' : view.winnerSide === view.selfSide ? 'Victoire !' : 'Partie terminée.') : view.phase === 'READY' ? 'Préparation du terrain…' : 'À toi de jouer !'
  return <section ref={root} aria-label="Chibasko Pong" className={styles.game + (local ? ' ' + styles.localGame : '')} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) clear() }}>
    <header className={styles.heading}><h2 className={styles.title}>Chibasko Pong</h2><span className={styles.badge}>Duel · 2 joueurs · Premier à 5</span></header>
    <div className={styles.hud}>
      <Player name={view.leftName} avatar={view.leftAvatar} local={view.selfSide === 'LEFT'} keys={local ? 'Z / S' : undefined} />
      <div className={styles.center}><p aria-label={'Score : ' + view.leftName + ' ' + view.leftScore + ', ' + view.rightName + ' ' + view.rightScore} className={styles.score}><span className={styles.coolScore}>{view.leftScore}</span><span className={styles.scoreDash}>—</span><span className={styles.warmScore}>{view.rightScore}</span></p><p className={styles.scoreHint}>Premier à 5</p></div>
      <Player name={view.rightName} avatar={view.rightAvatar} local={view.selfSide === 'RIGHT'} right keys={local ? '↑ / ↓' : undefined} />
    </div>
    <div data-pong-court className={styles.court}>
      <canvas ref={canvas} width={view.width} height={view.height} tabIndex={0} onKeyDown={event => keyboard(event, true)} onKeyUp={event => keyboard(event, false)} onBlur={clear}
        aria-label={local ? 'Terrain de Pong local. Joueur 1 : Z et S. Joueur 2 : flèches haut et bas.' : 'Terrain de Pong. Flèche haut ou W pour monter, flèche bas ou S pour descendre.'} aria-describedby={controlsId}
        className={styles.canvas}>Ton navigateur ne permet pas d’afficher le terrain.</canvas>
      {['READY', 'COUNTDOWN', 'POINT_PAUSE', 'FINISHED'].includes(view.phase) && <div className={styles.overlay}>
        <div key={view.phase === 'COUNTDOWN' ? Math.ceil(view.remainingMs / 1000) : view.phase + '-' + view.leftScore + '-' + view.rightScore} className={styles.reveal}>
          {view.phase === 'COUNTDOWN' ? <><p className={styles.prepare}>Prépare-toi</p><p aria-hidden="true" className={styles.countdown}>{Math.max(1, Math.ceil(view.remainingMs / 1000))}</p></> : <p className={styles.phaseTitle}>{view.phase === 'READY' ? 'Préparation du terrain…' : phaseText}</p>}
          {view.phase === 'POINT_PAUSE' && <p className={styles.resume}>La partie reprend…</p>}
        </div>
      </div>}
    </div>
    <p role="status" aria-live="polite" aria-atomic="true" className={styles.status}>{phaseText}</p>
    <div className={styles.controls} onKeyDown={event => keyboard(event, true)} onKeyUp={event => keyboard(event, false)}>
      <p id={controlsId} className={styles.instructions}>{local ? 'Protège ton côté et marque 5 points. Place le focus sur le terrain : Joueur 1 utilise Z / S ; Joueur 2 utilise ↑ / ↓. Sur écran tactile, chacun utilise les boutons de son côté.' : <>Protège ton côté : déplace ta raquette pour empêcher la balle de passer. Sur ordinateur, place le focus sur le terrain : <kbd className={styles.key}>↑ / W</kbd> pour monter, <kbd className={styles.key}>↓ / S</kbd> pour descendre.</>}</p>
      {local ? <PongLocalControls left={controls} right={rightControls} active={active} /> : <div className={styles.onlineControls} role="group" aria-label="Contrôles de ta raquette" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) controls.reset() }}>
        {([-1, 1] as const).map(direction => <button key={direction} type="button" disabled={!active} className={controlClass} aria-label={direction === -1 ? 'Monter la raquette' : 'Descendre la raquette'}
          onPointerDown={event => press(event, direction)} onPointerUp={event => controls.release(event.pointerId)} onPointerCancel={event => controls.release(event.pointerId)} onLostPointerCapture={event => controls.release(event.pointerId)}
          onPointerLeave={event => controls.release(event.pointerId)}
          onBlur={controls.reset}
          onKeyDown={event => { if (active && [' ', 'Enter'].includes(event.key)) { event.preventDefault(); controls.press(direction - 10, direction) } }}
          onKeyUp={event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); controls.release(direction - 10) } }}>
          <span aria-hidden="true">{direction === -1 ? '▲' : '▼'}</span><span className={styles.controlLabel}>{direction === -1 ? 'Monter' : 'Descendre'}</span>
        </button>)}
      </div>}
    </div>
    <p className={styles.suggestion}>Pour plus de confort, joue en mode paysage.</p>
  </section>
}
