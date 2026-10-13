'use client'
import { useEffect, useRef } from 'react'
import type { PongView } from '@/lib/multiplayer/pongView'

export default function PongCanvas({ view, onInput }: { view: PongView; onInput(direction: -1 | 0 | 1): void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const keys = useRef(new Set<string>())
  const sent = useRef(0)
  function reset() { keys.current.clear(); sent.current = 0; onInput(0) }
  function keyboard(event: React.KeyboardEvent<HTMLCanvasElement>, down: boolean) {
    const key = event.key.toLowerCase()
    if (!['arrowup', 'arrowdown', 'w', 's'].includes(key)) return
    event.preventDefault()
    if (down) keys.current.add(key); else keys.current.delete(key)
    const direction = (Number(keys.current.has('arrowdown') || keys.current.has('s')) - Number(keys.current.has('arrowup') || keys.current.has('w'))) as -1 | 0 | 1
    if (direction !== sent.current) { sent.current = direction; onInput(direction) }
  }
  useEffect(() => {
    const clear = () => { keys.current.clear(); sent.current = 0; onInput(0) }
    const visibility = () => { if (document.hidden) clear() }
    window.addEventListener('blur', clear); document.addEventListener('visibilitychange', visibility)
    return () => { window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', visibility); clear() }
  }, [onInput])
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#09090b'; ctx.fillRect(0, 0, view.width, view.height)
    ctx.strokeStyle = '#164e63'; ctx.lineWidth = 3; ctx.setLineDash([12, 12]); ctx.beginPath(); ctx.moveTo(view.width / 2, 0); ctx.lineTo(view.width / 2, view.height); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = '#67e8f9'; ctx.fillRect(view.inset, view.leftPaddleY, view.paddleWidth, view.paddleHeight)
    ctx.fillStyle = '#fcd34d'; ctx.fillRect(view.width - view.inset - view.paddleWidth, view.rightPaddleY, view.paddleWidth, view.paddleHeight)
    ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.arc(view.ballX, view.ballY, view.radius, 0, Math.PI * 2); ctx.fill()
    ctx.font = 'bold 44px Arial'; ctx.textAlign = 'center'; ctx.fillText(`${view.leftScore}     ${view.rightScore}`, view.width / 2, 60)
    ctx.font = '20px Arial'; ctx.fillText(view.leftName, view.width / 4, 95, view.width / 2 - 40); ctx.fillText(view.rightName, view.width * 3 / 4, 95, view.width / 2 - 40)
    ctx.font = 'bold 44px Arial'
    if (view.phase !== 'PLAYING') {
      ctx.fillStyle = 'rgba(9,9,11,0.65)'; ctx.fillRect(0, 0, view.width, view.height); ctx.fillStyle = '#fafafa'
      const text = view.phase === 'COUNTDOWN' ? String(Math.max(1, Math.ceil(view.remainingMs / 1000))) : view.phase === 'POINT_PAUSE' ? 'Point !' : view.phase === 'FINISHED' ? 'Partie terminée' : 'Préparation…'
      ctx.fillText(text, view.width / 2, view.height / 2)
    }
  }, [view])
  return <div className="min-w-0 space-y-3">
    <div className="grid grid-cols-2 gap-3 text-sm"><p className="break-words text-cyan-200">{view.leftName} · {view.leftScore}</p><p className="break-words text-right text-amber-200">{view.rightName} · {view.rightScore}</p></div>
    <canvas ref={canvas} width={view.width} height={view.height} tabIndex={0} onKeyDown={event => keyboard(event, true)} onKeyUp={event => keyboard(event, false)} onBlur={reset}
      aria-label="Terrain de Pong. Flèche haut ou W pour monter, flèche bas ou S pour descendre." aria-describedby="pong-controls"
      className="block h-auto w-full rounded-xl border border-cyan-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300">
      Ton navigateur ne permet pas d’afficher le terrain.
    </canvas>
    <p id="pong-controls" className="text-sm text-zinc-400">Clique ou place le focus sur le terrain. ↑ / W : monter · ↓ / S : descendre. Tu joues {view.selfSide === 'LEFT' ? 'à gauche' : 'à droite'}. Contrôles clavier sur ordinateur.</p>
    <p role="status" aria-live="polite" className="text-sm">{view.phase === 'COUNTDOWN' ? `Départ dans ${Math.ceil(view.remainingMs / 1000)}…` : view.phase === 'POINT_PAUSE' ? 'Point marqué. La partie reprend…' : view.phase === 'FINISHED' ? 'Partie terminée.' : 'Premier à 5 points.'}</p>
  </div>
}
