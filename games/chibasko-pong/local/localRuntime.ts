import { PONG, PongSimulation, createPongModel, createPongStepper, type Side } from '../shared/simulation'
import type { PongView } from '../client/pongView'
import type { PongFrame } from '../client/pongPresentation'

// No transport, identity, storage or browser APIs. The browser supplies elapsed time.
export function createLocalPongRuntime() {
  let model = createPongModel(), simulation = new PongSimulation(model), advance = createPongStepper(simulation)
  let disposed = false, key = '', pointName = '', goUntil = 0
  let snapshot: PongView, frame: PongFrame
  const listeners = new Set<() => void>()
  function publish(time: number, previousPhase: string) {
    if (model.phase === 'COUNTDOWN') pointName = ''
    if (previousPhase === 'COUNTDOWN' && model.phase === 'PLAYING') goUntil = time + 450
    const view: PongView = { ...model, width: PONG.width, height: PONG.height, paddleWidth: PONG.paddleWidth,
      paddleHeight: PONG.paddleHeight, inset: PONG.inset, radius: PONG.radius,
      leftName: 'Joueur 1', rightName: 'Joueur 2', selfSide: '', pointName }
    frame = { current: view, previous: null, receivedAt: time, goUntil }
    const nextKey = JSON.stringify([model.phase, Math.ceil(model.remainingMs / 1000), model.leftScore, model.rightScore, model.winnerSide])
    if (nextKey !== key) { key = nextKey; snapshot = view; listeners.forEach(listener => listener()) }
  }
  simulation.start(); publish(0, 'READY')
  return {
    getSnapshot: () => snapshot,
    getFrame: () => frame,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    setInput(side: Side, direction: -1 | 0 | 1) { if (!disposed) simulation.setInput(side, direction) },
    clearInputs() { simulation.clearInputs() },
    advance(deltaMs: number, time: number) {
      if (disposed) return
      const phase = model.phase, left = model.leftScore, right = model.rightScore
      advance(deltaMs)
      if (model.leftScore > left) pointName = 'Joueur 1'
      if (model.rightScore > right) pointName = 'Joueur 2'
      publish(time, phase)
    },
    restart() {
      simulation.clearInputs(); disposed = false
      model = createPongModel(); simulation = new PongSimulation(model); advance = createPongStepper(simulation)
      key = ''; pointName = ''; goUntil = 0; simulation.start(); publish(0, 'READY')
    },
    dispose() { disposed = true; simulation.clearInputs(); listeners.clear() },
  }
}
