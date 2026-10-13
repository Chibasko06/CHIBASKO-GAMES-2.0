'use client'
import { useEffect, useId, useMemo, useRef } from 'react'
import Image from 'next/image'
import type { PongView } from './pongView'
import type { PongFrame } from './pongPresentation'
import { createPongControls, type Direction } from './pongControls'
import { drawPong } from './pongRenderer'
import styles from './pong.module.css'

const controlClass = 'min-h-16 flex-1 touch-none select-none rounded-2xl border border-cyan-800 bg-cyan-950/50 px-4 py-4 text-3xl text-cyan-100 hover:bg-cyan-900/60 active:bg-cyan-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 disabled:opacity-40'
function Player({ name, avatar, local, right }: { name: string; avatar?: string; local: boolean; right?: boolean }) {
  return <div className={'flex min-w-0 flex-col gap-2 ' + (right ? 'items-end text-right' : 'items-start')}>
    {avatar ? <Image src={avatar} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" /> : <span aria-hidden="true" className={'flex h-9 w-9 items-center justify-center rounded-full ' + (right ? 'bg-amber-950 text-amber-200' : 'bg-cyan-950 text-cyan-200')}>{name.slice(0, 1).toUpperCase() || '?'}</span>}
    <p className={'w-full break-words text-sm font-bold sm:text-base ' + (right ? 'text-amber-100' : 'text-cyan-100')}>{name || 'Joueur'}</p>
    <span className="text-xs text-zinc-400">{local ? 'Toi' : 'Adversaire'} · {right ? 'Droite' : 'Gauche'}</span>
  </div>
}
export default function PongCanvas({ view, onInput, readFrame }: { view: PongView; onInput(direction: Direction): void; readFrame?: () => PongFrame | null }) {
  const canvas = useRef<HTMLCanvasElement>(null), latest = useRef(view)
  const controls = useMemo(() => createPongControls(onInput), [onInput])
  const controlsId = useId()
  const active = ['COUNTDOWN', 'PLAYING', 'POINT_PAUSE'].includes(view.phase) && ['LEFT', 'RIGHT'].includes(view.selfSide)
  useEffect(() => { latest.current = view }, [view])
  useEffect(() => {
    const clear = controls.reset
    const visibility = () => { if (document.hidden) clear() }
    window.addEventListener('blur', clear); document.addEventListener('visibilitychange', visibility)
    return () => { window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', visibility); clear() }
  }, [controls])
  useEffect(() => { if (!active) controls.reset() }, [active, controls])
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
    if (active && controls.key(event.key, down)) event.preventDefault()
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
    : view.phase === 'FINISHED' ? (view.winnerSide === view.selfSide ? 'Victoire !' : 'Partie terminée.') : view.phase === 'READY' ? 'Préparation du terrain…' : 'À toi de jouer !'
  return <section aria-label="Chibasko Pong" className="min-w-0 space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-black tracking-tight">Chibasko Pong</h2><span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300">Duel · 2 joueurs · Premier à 5</span></header>
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-zinc-800 bg-black/40 p-3 sm:p-4">
      <Player name={view.leftName} avatar={view.leftAvatar} local={view.selfSide === 'LEFT'} />
      <div className="text-center"><p aria-label={'Score : ' + view.leftName + ' ' + view.leftScore + ', ' + view.rightName + ' ' + view.rightScore} className="whitespace-nowrap text-3xl font-black tabular-nums sm:text-5xl"><span className="text-cyan-200">{view.leftScore}</span><span className="mx-2 text-zinc-600">—</span><span className="text-amber-200">{view.rightScore}</span></p><p className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500">Premier à 5</p></div>
      <Player name={view.rightName} avatar={view.rightAvatar} local={view.selfSide === 'RIGHT'} right />
    </div>
    <div className={styles.court + ' relative overflow-hidden rounded-2xl border border-cyan-900/70 bg-zinc-950 shadow-[0_0_32px_rgba(34,211,238,0.08)]'}>
      <canvas ref={canvas} width={view.width} height={view.height} tabIndex={0} onKeyDown={event => keyboard(event, true)} onKeyUp={event => keyboard(event, false)} onBlur={controls.reset}
        aria-label="Terrain de Pong. Flèche haut ou W pour monter, flèche bas ou S pour descendre." aria-describedby={controlsId}
        className="block h-auto w-full focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-cyan-300">Ton navigateur ne permet pas d’afficher le terrain.</canvas>
      {['READY', 'COUNTDOWN', 'POINT_PAUSE', 'FINISHED'].includes(view.phase) && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-zinc-950/55 p-4 text-center">
        <div key={view.phase === 'COUNTDOWN' ? Math.ceil(view.remainingMs / 1000) : view.phase + '-' + view.leftScore + '-' + view.rightScore} className={styles.reveal}>
          {view.phase === 'COUNTDOWN' ? <><p className="text-xs uppercase tracking-widest text-cyan-200">Prépare-toi</p><p aria-hidden="true" className="text-6xl font-black text-white sm:text-8xl">{Math.max(1, Math.ceil(view.remainingMs / 1000))}</p></> : <p className="break-words text-xl font-black text-white sm:text-3xl">{view.phase === 'READY' ? 'Préparation du terrain…' : phaseText}</p>}
          {view.phase === 'POINT_PAUSE' && <p className="mt-2 text-sm text-zinc-300">La partie reprend…</p>}
        </div>
      </div>}
    </div>
    <p role="status" aria-live="polite" aria-atomic="true" className="min-h-6 break-words text-center text-sm font-semibold text-cyan-100">{phaseText}</p>
    <div onKeyDown={event => keyboard(event, true)} onKeyUp={event => keyboard(event, false)}>
      <p id={controlsId} className={styles.instructions + ' text-sm text-zinc-400'}>Protège ton côté : déplace ta raquette pour empêcher la balle de passer. Sur ordinateur, place le focus sur le terrain : <kbd className="text-zinc-100">↑ / W</kbd> pour monter, <kbd className="text-zinc-100">↓ / S</kbd> pour descendre.</p>
      <div className="mt-3 flex gap-3" role="group" aria-label="Contrôles de ta raquette" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) controls.reset() }}>
        {([-1, 1] as const).map(direction => <button key={direction} type="button" disabled={!active} className={controlClass} aria-label={direction === -1 ? 'Monter la raquette' : 'Descendre la raquette'}
          onPointerDown={event => press(event, direction)} onPointerUp={event => controls.release(event.pointerId)} onPointerCancel={event => controls.release(event.pointerId)} onLostPointerCapture={event => controls.release(event.pointerId)}
          onPointerLeave={event => controls.release(event.pointerId)}
          onBlur={controls.reset}
          onKeyDown={event => { if (active && [' ', 'Enter'].includes(event.key)) { event.preventDefault(); controls.press(direction - 10, direction) } }}
          onKeyUp={event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); controls.release(direction - 10) } }}>
          <span aria-hidden="true">{direction === -1 ? '▲' : '▼'}</span><span className="ml-3 align-middle text-sm font-semibold">{direction === -1 ? 'Monter' : 'Descendre'}</span>
        </button>)}
      </div>
    </div>
    <p className="text-center text-xs text-zinc-500 sm:hidden">Pour plus de confort, joue en mode paysage.</p>
  </section>
}
