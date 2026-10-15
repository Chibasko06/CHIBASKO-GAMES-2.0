import test from 'node:test'
import assert from 'node:assert/strict'
import { PongState } from '../src/games/chibasko-pong/PongState.js'
import { PONG, PongSimulation, readInput } from '@chibaskogames/pong-engine'

function fixture() { const state = new PongState(); const sim = new PongSimulation(state); sim.start(); sim.step(PONG.countdownMs); return { state, sim } }
test('strict input rejects identities, coordinates and result injection', () => {
  for (const direction of [-1, 0, 1]) assert.equal(readInput({ direction }), direction)
  for (const payload of [null, [], {}, { direction: 2 }, { direction: NaN }, { direction: '1' }, { direction: true },
    ...['userId', 'side', 'paddleY', 'ballX', 'score', 'winner', 'result'].map(key => ({ direction: 1, [key]: 'forged' }))]) assert.throws(() => readInput(payload))
})
test('paddle inputs are separate, speed fixed and clamped at both boundaries', () => {
  const { state, sim } = fixture()
  sim.setInput('LEFT', 1); sim.step(1000 / 30)
  assert.ok(state.leftPaddleY > 250); assert.equal(state.rightPaddleY, 250)
  sim.setInput('LEFT', -1); sim.setInput('RIGHT', 1)
  for (let i = 0; i < 90; i++) sim.step(1000 / 30)
  assert.equal(state.leftPaddleY, 0); assert.equal(state.rightPaddleY, 500)
  sim.clearInputs(); const y = state.leftPaddleY; sim.step(1000 / 30); assert.equal(state.leftPaddleY, y)
})
test('ball moves, bounces on walls and paddles without sticking', () => {
  const { state, sim } = fixture()
  sim.step(1000 / 30); assert.ok(state.ballX > 500)
  state.ballY = PONG.height - 1; sim.step(1000 / 30); assert.ok(state.ballY < PONG.height - PONG.radius)
  state.ballY = 1; sim.step(1000 / 30); assert.ok(state.ballY >= PONG.radius)
  state.ballX = PONG.width - PONG.inset - PONG.paddleWidth - PONG.radius - 1; state.ballY = 300
  sim.step(1000 / 30); const right = state.ballX; sim.step(1000 / 30); assert.ok(state.ballX < right)
  state.ballX = PONG.inset + PONG.paddleWidth + PONG.radius + 1; state.ballY = 300
  sim.step(1000 / 30); const left = state.ballX; sim.step(1000 / 30); assert.ok(state.ballX > left)
})
test('countdown, both goals, point reset/pause and authoritative first-to-five', () => {
  const state = new PongState(), sim = new PongSimulation(state)
  assert.equal(state.phase, 'READY'); sim.start(); assert.equal(state.phase, 'COUNTDOWN')
  sim.step(2999); assert.equal(state.phase, 'COUNTDOWN'); sim.step(1); assert.equal(state.phase, 'PLAYING')
  state.ballX = -100; sim.step(1000 / 30); assert.equal(state.rightScore, 1)
  assert.equal(state.phase, 'POINT_PAUSE'); assert.equal(state.ballX, 500); assert.equal(state.ballY, 300)
  sim.step(999); assert.equal(state.phase, 'POINT_PAUSE'); sim.step(1); assert.equal(state.phase, 'PLAYING')
  for (let i = 0; i < 5; i++) { state.ballX = 1100; sim.step(1000 / 30); if (i < 4) sim.step(1000) }
  assert.equal(state.leftScore, 5); assert.equal(state.rightScore, 1); assert.equal(state.phase, 'FINISHED'); assert.equal(state.winnerSide, 'LEFT')
  sim.step(1000); assert.equal(state.leftScore, 5)
})
test('forfeit is a game policy during countdown, play and point pause, terminal result stays fixed', () => {
  for (const phase of ['COUNTDOWN', 'PLAYING', 'POINT_PAUSE']) {
    const { state, sim } = fixture(); state.phase = phase
    assert.equal(sim.forfeit('LEFT'), true); assert.equal(state.winnerSide, 'RIGHT'); assert.equal(state.phase, 'FINISHED')
    assert.equal(sim.forfeit('RIGHT'), false); assert.equal(state.winnerSide, 'RIGHT')
  }
})
