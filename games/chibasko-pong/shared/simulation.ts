export const PONG = Object.freeze({ width: 1000, height: 600, paddleWidth: 16, paddleHeight: 100, inset: 30,
  paddleSpeed: 400, radius: 10, ballSpeed: 480, winningScore: 5, tickRate: 30, countdownMs: 3000, pauseMs: 1000 })
export type Side = 'LEFT' | 'RIGHT'
export type Phase = 'READY' | 'COUNTDOWN' | 'PLAYING' | 'POINT_PAUSE' | 'FINISHED'
export type PongModel = {
  phase: string; remainingMs: number; leftPaddleY: number; rightPaddleY: number
  ballX: number; ballY: number; leftScore: number; rightScore: number; winnerSide: string
}
export function createPongModel(): PongModel {
  return { phase: 'READY', remainingMs: 0, leftPaddleY: (PONG.height - PONG.paddleHeight) / 2,
    rightPaddleY: (PONG.height - PONG.paddleHeight) / 2, ballX: PONG.width / 2, ballY: PONG.height / 2,
    leftScore: 0, rightScore: 0, winnerSide: '' }
}

// Both runtimes use the same bounded, fixed timestep. Time is supplied by the caller.
export function createPongStepper(simulation: PongSimulation) {
  let accumulator = 0
  const step = 1000 / PONG.tickRate
  return (deltaMs: number) => {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) return
    accumulator += Math.min(deltaMs, 250)
    while (accumulator >= step && simulation.state.phase !== 'FINISHED') {
      simulation.step(step)
      accumulator -= step
    }
  }
}
export function readInput(payload: unknown): -1 | 0 | 1 {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length !== 1
    || !('direction' in payload) || ![-1, 0, 1].includes(payload.direction as number)) throw new Error('INVALID_INPUT')
  return payload.direction as -1 | 0 | 1
}
export class PongSimulation {
  private input: Record<Side, number> = { LEFT: 0, RIGHT: 0 }
  private vx = PONG.ballSpeed as number
  private vy = 120
  private serve = 1
  constructor(readonly state: PongModel) {}
  start() { if (this.state.phase !== 'READY') return; this.state.phase = 'COUNTDOWN'; this.state.remainingMs = PONG.countdownMs; this.reset() }
  setInput(side: Side, direction: -1 | 0 | 1) { this.input[side] = direction }
  clearInputs() { this.input.LEFT = 0; this.input.RIGHT = 0 }
  private reset() { this.state.ballX = PONG.width / 2; this.state.ballY = PONG.height / 2; this.vx = this.serve * PONG.ballSpeed; this.vy = 120 * this.serve }
  forfeit(side: Side) { if (!['COUNTDOWN', 'PLAYING', 'POINT_PAUSE'].includes(this.state.phase)) return false; this.finish(side === 'LEFT' ? 'RIGHT' : 'LEFT'); return true }
  private finish(side: Side) { this.state.phase = 'FINISHED'; this.state.winnerSide = side; this.state.remainingMs = 0; this.clearInputs() }
  step(ms: number) {
    const s = this.state
    if (s.phase === 'READY' || s.phase === 'FINISHED') return
    if (s.phase === 'COUNTDOWN' || s.phase === 'POINT_PAUSE') {
      s.remainingMs = Math.max(0, s.remainingMs - ms)
      if (!s.remainingMs) s.phase = 'PLAYING'
      return
    }
    const dt = ms / 1000
    const clamp = (y: number) => Math.max(0, Math.min(PONG.height - PONG.paddleHeight, y))
    s.leftPaddleY = clamp(s.leftPaddleY + this.input.LEFT * PONG.paddleSpeed * dt)
    s.rightPaddleY = clamp(s.rightPaddleY + this.input.RIGHT * PONG.paddleSpeed * dt)
    const oldX = s.ballX
    s.ballX += this.vx * dt; s.ballY += this.vy * dt
    if (s.ballY < PONG.radius) { s.ballY = 2 * PONG.radius - s.ballY; this.vy = Math.abs(this.vy) }
    if (s.ballY > PONG.height - PONG.radius) { s.ballY = 2 * (PONG.height - PONG.radius) - s.ballY; this.vy = -Math.abs(this.vy) }
    const leftFace = PONG.inset + PONG.paddleWidth + PONG.radius
    const rightFace = PONG.width - leftFace
    const bounce = (y: number, direction: number) => {
      const impact = Math.max(-1, Math.min(1, (s.ballY - y - PONG.paddleHeight / 2) / (PONG.paddleHeight / 2)))
      const angle = impact * Math.PI / 3
      this.vx = direction * PONG.ballSpeed * Math.cos(angle); this.vy = PONG.ballSpeed * Math.sin(angle)
    }
    const touches = (y: number) => s.ballY + PONG.radius >= y && s.ballY - PONG.radius <= y + PONG.paddleHeight
    if (this.vx < 0 && oldX >= leftFace && s.ballX <= leftFace && touches(s.leftPaddleY)) { s.ballX = leftFace; bounce(s.leftPaddleY, 1) }
    else if (this.vx > 0 && oldX <= rightFace && s.ballX >= rightFace && touches(s.rightPaddleY)) { s.ballX = rightFace; bounce(s.rightPaddleY, -1) }
    if (s.ballX < -PONG.radius || s.ballX > PONG.width + PONG.radius) {
      const side: Side = s.ballX < 0 ? 'RIGHT' : 'LEFT'
      if (side === 'LEFT') s.leftScore++; else s.rightScore++
      if (Math.max(s.leftScore, s.rightScore) >= PONG.winningScore) { this.finish(side); return }
      this.serve *= -1; this.reset(); s.phase = 'POINT_PAUSE'; s.remainingMs = PONG.pauseMs
    }
  }
}
