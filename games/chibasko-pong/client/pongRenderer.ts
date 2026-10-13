import type { PongFrame } from './pongPresentation'
const backgrounds = new WeakMap<CanvasRenderingContext2D, CanvasGradient>()

export function drawPong(ctx: CanvasRenderingContext2D, frame: PongFrame, time: number, reducedMotion: boolean) {
  const v = frame.current, previous = frame.previous
  // Received positions only. Reset/phase changes snap; no extrapolation.
  const alpha = reducedMotion || !previous ? 1 : Math.max(0, Math.min(1, (time - frame.receivedAt) / 50))
  const mix = (a: number | undefined, b: number) => a === undefined ? b : a + (b - a) * alpha
  let background = backgrounds.get(ctx)
  if (!background) {
    background = ctx.createLinearGradient(0, 0, v.width, v.height)
    background.addColorStop(0, '#0b202a'); background.addColorStop(0.5, '#080f1b'); background.addColorStop(1, '#261d17')
    backgrounds.set(ctx, background)
  }
  ctx.fillStyle = background; ctx.fillRect(0, 0, v.width, v.height)
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(148,163,184,0.07)'; ctx.beginPath()
  for (let x = 50; x < v.width; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, v.height) }
  for (let y = 50; y < v.height; y += 50) { ctx.moveTo(0, y); ctx.lineTo(v.width, y) }
  ctx.stroke()
  ctx.strokeStyle = 'rgba(148,163,184,0.3)'; ctx.lineWidth = 3; ctx.setLineDash([10, 14])
  ctx.beginPath(); ctx.moveTo(v.width / 2, 24); ctx.lineTo(v.width / 2, v.height - 24); ctx.stroke(); ctx.setLineDash([])
  ctx.strokeStyle = 'rgba(103,232,249,0.25)'; ctx.strokeRect(10, 10, v.width - 20, v.height - 20)
  ctx.shadowBlur = reducedMotion ? 0 : 14
  ctx.shadowColor = '#22d3ee'; ctx.fillStyle = '#67e8f9'
  ctx.fillRect(v.inset, mix(previous?.leftPaddleY, v.leftPaddleY), v.paddleWidth, v.paddleHeight)
  ctx.shadowColor = '#fbbf24'; ctx.fillStyle = '#fcd34d'
  ctx.fillRect(v.width - v.inset - v.paddleWidth, mix(previous?.rightPaddleY, v.rightPaddleY), v.paddleWidth, v.paddleHeight)
  ctx.shadowColor = '#fff'; ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(mix(previous?.ballX, v.ballX), mix(previous?.ballY, v.ballY), v.radius, 0, Math.PI * 2); ctx.fill()
  ctx.shadowBlur = 0
  if (v.phase === 'POINT_PAUSE' && !reducedMotion) {
    ctx.fillStyle = 'rgba(103,232,249,0.06)'; ctx.fillRect(0, 0, v.width, v.height)
  }
  if (v.phase === 'PLAYING' && time < frame.goUntil) {
    ctx.font = 'bold 80px Trebuchet MS, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#e0faff'
    ctx.fillText('GO !', v.width / 2, v.height / 2 + 25)
  }
}
