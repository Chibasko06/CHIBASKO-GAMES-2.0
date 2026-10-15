import test from 'node:test'
import assert from 'node:assert/strict'
import { createLocalPongRuntime } from '../dist/local/localRuntime.js'

function step(runtime, ticks = 1) { for (let i = 0; i < ticks; i++) runtime.advance(1000 / 30, i * 1000 / 30) }
test('local controls are independent, fixed-step, clamped, resettable and inert after dispose', () => {
  const game = createLocalPongRuntime()
  assert.equal(game.getFrame().current.phase, 'COUNTDOWN')
  step(game, 91)
  assert.equal(game.getFrame().current.phase, 'PLAYING')
  game.setInput('LEFT', -1); game.setInput('RIGHT', 1); step(game)
  assert.ok(game.getFrame().current.leftPaddleY < 250); assert.ok(game.getFrame().current.rightPaddleY > 250)
  step(game, 50); assert.equal(game.getFrame().current.leftPaddleY, 0); assert.equal(game.getFrame().current.rightPaddleY, 500)
  game.clearInputs(); const before = game.getFrame().current.leftPaddleY; step(game)
  assert.equal(game.getFrame().current.leftPaddleY, before)
  let updates = 0; const off = game.subscribe(() => updates++)
  game.restart(); assert.equal(updates, 1); assert.equal(game.getFrame().current.leftScore, 0)
  off(); game.restart(); assert.equal(updates, 1)
  const frame = game.getFrame(); game.dispose(); game.setInput('LEFT', 1); step(game, 100)
  assert.equal(game.getFrame(), frame)
})
test('either local participant can win first-to-five and restart with fresh scores and inputs', () => {
  for (const winner of ['LEFT', 'RIGHT']) {
    const game = createLocalPongRuntime()
    for (let tick = 0; tick < 20000 && game.getFrame().current.phase !== 'FINISHED'; tick++) {
      const v = game.getFrame().current
      const y = winner === 'LEFT' ? v.leftPaddleY : v.rightPaddleY
      game.setInput(winner, Math.abs(v.ballY - y - 50) < 10 ? 0 : v.ballY > y + 50 ? 1 : -1)
      game.setInput(winner === 'LEFT' ? 'RIGHT' : 'LEFT', -1)
      step(game)
    }
    const finished = game.getFrame().current
    assert.equal(finished.phase, 'FINISHED'); assert.equal(finished.winnerSide, winner)
    assert.equal(winner === 'LEFT' ? finished.leftScore : finished.rightScore, 5)
    game.restart(); assert.equal(game.getFrame().current.leftScore, 0); assert.equal(game.getFrame().current.rightScore, 0)
    assert.equal(game.getFrame().current.winnerSide, ''); assert.equal(game.getFrame().current.phase, 'COUNTDOWN')
    game.dispose()
  }
})
