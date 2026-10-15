import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement, act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import PongCanvas from '../games/chibasko-pong/client/PongCanvas.tsx'
import PongLocalGame from '../games/chibasko-pong/local/PongLocalGame.tsx'
import LocalGamePage from '../app/games/[slug]/local/page.tsx'
import LocalGameRuntime, { createLocalGameRuntime } from '../components/multiplayer/LocalGameRuntime.tsx'
import MultiplayerGamePanel from '../components/multiplayer/MultiplayerGamePanel.tsx'
import { localGameRegistry } from '../games/clientRegistry.ts'
import { getMultiplayerDefinition, multiplayerGames } from '../lib/multiplayer/catalogue.ts'
import { createPongControls } from '../games/chibasko-pong/client/pongControls.ts'
import { fitPongCourt } from '../games/chibasko-pong/client/pongLayout.ts'

const view = { phase: 'PLAYING', remainingMs: 0, width: 1000, height: 600, paddleWidth: 16, paddleHeight: 100, inset: 30, radius: 10,
  leftPaddleY: 250, rightPaddleY: 250, ballX: 500, ballY: 300, leftScore: 0, rightScore: 0, leftName: 'Joueur 1', rightName: 'Joueur 2', selfSide: '' }
async function mounted(Component, props, run) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:3000/games/pong/local', pretendToBeVisual: true })
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const callbacks = new Map(); let sequence = 0
  window.requestAnimationFrame = globalThis.requestAnimationFrame = cb => { callbacks.set(++sequence, cb); return sequence }
  window.cancelAnimationFrame = globalThis.cancelAnimationFrame = id => callbacks.delete(id)
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({ createLinearGradient: () => ({ addColorStop() {} }) }, { get: (obj, key) => obj[key] ?? (() => {}) })
  const root = createRoot(document.getElementById('root'))
  try { await act(async () => root.render(createElement(Component, props))); await run({ root, callbacks }) }
  finally {
    await act(async () => root.unmount()); assert.equal(callbacks.size, 0)
    dom.window.close()
    for (const key of ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT', 'requestAnimationFrame', 'cancelAnimationFrame']) delete globalThis[key]
  }
}
const keyboard = (target, key, type = 'keydown', code = '') => target.dispatchEvent(new window.KeyboardEvent(type, { key, code, bubbles: true, cancelable: true }))
async function pointer(target, type, id) {
  await act(async () => {
    const event = new window.Event(type, { bubbles: true, cancelable: true })
    Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: 'touch' }, button: { value: 0 } })
    target.dispatchEvent(event)
  })
}
test('local keyboard and multi-touch isolate both players and clear release, blur, hidden tab and unmount', async () => {
  const sent = [], left = d => sent.push(['LEFT', d]), right = d => sent.push(['RIGHT', d])
  await mounted(PongCanvas, { view, onInput: left, onRightInput: right }, async ({ root }) => {
    const canvas = document.querySelector('canvas'); canvas.focus()
    assert.match(document.body.textContent, /Z \/ S/)
    assert.doesNotMatch(document.body.textContent, /W \/ S/)
    assert.match(canvas.getAttribute('aria-label'), /Joueur 1 : Z et S/)
    keyboard(canvas, 'z', 'keydown', 'KeyW'); assert.deepEqual(sent.at(-1), ['LEFT', -1]) // AZERTY
    keyboard(canvas, 'w', 'keydown', 'KeyZ'); const holding = sent.length
    keyboard(canvas, 'z', 'keyup', 'KeyW'); assert.equal(sent.length, holding)
    keyboard(canvas, 'w', 'keyup', 'KeyZ'); assert.deepEqual(sent.at(-1), ['LEFT', 0])
    keyboard(canvas, 'W'); keyboard(canvas, 'Z'); const holdingUppercase = sent.length
    keyboard(canvas, 'w', 'keyup'); assert.equal(sent.length, holdingUppercase)
    keyboard(canvas, 'z', 'keyup'); assert.deepEqual(sent.at(-1), ['LEFT', 0])
    keyboard(canvas, 's'); assert.deepEqual(sent.at(-1), ['LEFT', 1]); keyboard(canvas, 's', 'keyup')
    keyboard(canvas, 'w'); keyboard(canvas, 'ArrowDown')
    assert.deepEqual(sent.slice(-2), [['LEFT', -1], ['RIGHT', 1]])
    assert.equal(keyboard(canvas, 'ArrowUp'), false) // active key prevents page scroll
    keyboard(canvas, 'w', 'keyup'); keyboard(canvas, 'ArrowDown', 'keyup'); keyboard(canvas, 'ArrowUp', 'keyup')
    assert.deepEqual(sent.slice(-2), [['RIGHT', -1], ['RIGHT', 0]])
    const up = document.querySelector('[aria-label="Monter Joueur 1"]'), down = document.querySelector('[aria-label="Descendre Joueur 2"]')
    await pointer(up, 'pointerdown', 1); await pointer(down, 'pointerdown', 2)
    assert.deepEqual(sent.slice(-2), [['LEFT', -1], ['RIGHT', 1]])
    await pointer(up, 'pointerup', 1); assert.deepEqual(sent.at(-1), ['LEFT', 0])
    await pointer(down, 'pointercancel', 2); assert.deepEqual(sent.at(-1), ['RIGHT', 0])
    await pointer(up, 'pointerdown', 3); await pointer(up, 'lostpointercapture', 3); assert.deepEqual(sent.at(-1), ['LEFT', 0])
    await pointer(down, 'pointerdown', 4); await pointer(down, 'pointerout', 4); assert.deepEqual(sent.at(-1), ['RIGHT', 0])
    keyboard(canvas, 's'); await act(async () => window.dispatchEvent(new window.Event('blur')))
    assert.deepEqual(sent.slice(-2), [['LEFT', 0], ['RIGHT', 0]])
    keyboard(canvas, 'z'); keyboard(canvas, 'w'); Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    await act(async () => document.dispatchEvent(new window.Event('visibilitychange')))
    assert.deepEqual(sent.slice(-2), [['LEFT', 0], ['RIGHT', 0]])
    keyboard(canvas, 'z', 'keyup'); keyboard(canvas, 'w', 'keyup'); assert.deepEqual(sent.at(-1), ['RIGHT', 0])
    keyboard(canvas, 'z'); keyboard(canvas, 'ArrowDown')
    assert.equal(keyboard(document.body, 'ArrowDown'), true) // no global scroll hijack
    await act(async () => root.unmount()); const count = sent.length
    assert.deepEqual(sent.slice(-2), [['LEFT', 0], ['RIGHT', 0]])
    window.dispatchEvent(new window.Event('blur')); document.dispatchEvent(new window.Event('visibilitychange'))
    assert.equal(sent.length, count)
    assert.ok(sent.every(([side, d]) => ['LEFT', 'RIGHT'].includes(side) && [-1, 0, 1].includes(d)))
  })
})
test('online bindings remain unchanged while inactive local arrows do not prevent scrolling', async () => {
  const sent = [], online = createPongControls(d => sent.push(d))
  assert.equal(online.key('z', true), false)
  online.key('w', true); online.key('w', false); online.key('ArrowDown', true)
  assert.deepEqual(sent, [-1, 0, 1])
  await mounted(PongCanvas, { view: { ...view, phase: 'FINISHED' }, onInput() {}, onRightInput() {} }, async () => {
    assert.equal(keyboard(document.querySelector('canvas'), 'ArrowDown'), true)
  })
})
test('court budget includes actual surrounding UI and local exit; resize observers, frames and listeners clean up', async () => {
  await mounted(() => createElement('div'), {}, async ({ callbacks }) => {
    const section = document.createElement('section'), root = document.createElement('section'), court = document.createElement('div')
    section.setAttribute('data-pong-local-session', ''); court.setAttribute('data-pong-court', '')
    section.append(root); root.append(court); document.body.append(section)
    root.getBoundingClientRect = () => ({ width: 1024, top: 150, height: 600, bottom: 750 })
    court.getBoundingClientRect = () => ({ height: 400 })
    section.getBoundingClientRect = () => ({ bottom: 820 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 })
    let watched = 0, disconnected = 0, resize
    globalThis.ResizeObserver = class { constructor(callback) { resize = callback } observe() { watched++ } disconnect() { disconnected++ } }
    try {
      const off = fitPongCourt(root)
      assert.equal(court.style.getPropertyValue('--pong-court-height'), '336px')
      assert.equal(watched, 2)
      resize(); window.dispatchEvent(new window.Event('resize')); assert.equal(callbacks.size, 1)
      off(); assert.equal(callbacks.size, 0); assert.equal(disconnected, 1)
      assert.equal(court.style.getPropertyValue('--pong-court-height'), '')
      window.dispatchEvent(new window.Event('resize')); window.dispatchEvent(new window.Event('scroll')); assert.equal(callbacks.size, 0)
    } finally { delete globalThis.ResizeObserver; section.remove() }
  })
})
test('anonymous local game completes, replays and exits with no request or WebSocket', async t => {
  let requests = 0, sockets = 0, exited = 0
  t.mock.method(globalThis, 'fetch', () => { requests++; throw new Error('Unexpected local request') })
  t.mock.method(globalThis, 'WebSocket', function () { sockets++; throw new Error('Unexpected local socket') })
  await mounted(PongLocalGame, { onExit: () => exited++ }, async ({ callbacks }) => {
    const canvas = document.querySelector('canvas'); assert.equal(document.activeElement, canvas)
    keyboard(canvas, 'w'); keyboard(canvas, 'ArrowDown')
    const start = performance.now()
    for (let tick = 1; tick < 20000 && !document.querySelector('button')?.textContent.includes('Rejouer'); tick++) {
      await act(async () => { const batch = [...callbacks.values()]; callbacks.clear(); batch.forEach(cb => cb(start + tick * 1000 / 30)) })
      if ([...document.querySelectorAll('button')].some(b => b.textContent === 'Rejouer')) break
    }
    const replay = [...document.querySelectorAll('button')].find(b => b.textContent === 'Rejouer')
    assert.ok(replay); assert.match(document.body.textContent, /Victoire Joueur [12]/)
    await act(async () => replay.click()); assert.match(document.body.textContent, /Départ dans 3/)
    await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Quitter la partie locale').click())
    assert.equal(exited, 1); assert.equal(requests, 0); assert.equal(sockets, 0)
  })
})
test('optional local loader is lazy and generic, with safe unknown-game fallback', async () => {
  let loads = 0, exits = 0
  const registry = { 'test-game': async () => { loads++; return { gameId: 'test-game', default: ({ onExit }) => createElement('button', { onClick: onExit }, 'Autre jeu local') } } }
  const Runtime = createLocalGameRuntime(registry)
  assert.equal(loads, 0)
  await mounted(Runtime, { gameId: 'unknown', onExit() {} }, async ({ root }) => {
    assert.match(document.body.textContent, /indisponible/); assert.equal(loads, 0)
    await act(async () => root.render(createElement(Runtime, { gameId: 'test-game', onExit: () => exits++ })))
    await act(async () => document.querySelector('button').click()); assert.equal(exits, 1); assert.equal(loads, 1)
  })
  assert.equal((await localGameRegistry['chibasko-pong']()).gameId, 'chibasko-pong')
  for (const { gameId } of multiplayerGames) if (getMultiplayerDefinition(gameId).capabilities.local) assert.ok(Object.hasOwn(localGameRegistry, gameId), 'Declared local capability needs a real loader')
})
test('hidden tabs pause local time and StrictMode does not duplicate animation loops', async () => {
  function StrictGame() { return createElement(StrictMode, null, createElement(PongLocalGame, { onExit() {} })) }
  await mounted(StrictGame, {}, async ({ callbacks }) => {
    assert.equal(callbacks.size, 2) // one canvas loop and one simulation loop
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    await act(async () => document.dispatchEvent(new window.Event('visibilitychange')))
    let time = performance.now()
    for (let i = 0; i < 150; i++) {
      time += 1000 / 30
      await act(async () => { const batch = [...callbacks.values()]; callbacks.clear(); batch.forEach(cb => cb(time)) })
    }
    assert.match(document.body.textContent, /Départ dans 3/)
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    await act(async () => document.dispatchEvent(new window.Event('visibilitychange')))
    time = performance.now()
    for (let i = 0; i < 100; i++) {
      time += 1000 / 30
      await act(async () => { const batch = [...callbacks.values()]; callbacks.clear(); batch.forEach(cb => cb(time)) })
    }
    assert.match(document.body.textContent, /À toi de jouer/)
    assert.equal(callbacks.size, 2)
  })
})
test('local route and CTA use capabilities, published catalogue and an optional module, never auth', async () => {
  const multi = { id: 'test', title: 'Fixture', slug: 'fixture', game_type: 'multiplayer_chibasko', multiplayer_game_id: 'chibasko-pong', game_url: null, is_published: true, thumbnail_url: null }
  globalThis.__productAuth = { user: null, session: null, loading: false }
  globalThis.__productRows = [multi]
  const page = await LocalGamePage({ params: Promise.resolve({ slug: 'fixture' }) })
  assert.equal(page.props.children.at(-1).type, LocalGameRuntime)
  assert.equal(page.props.children.at(-1).props.gameId, 'chibasko-pong')
  const markup = renderToStaticMarkup(createElement(MultiplayerGamePanel, { game: multi }))
  assert.match(markup, /href="\/games\/fixture\/local"/); assert.match(markup, /Jouer en local/)
  for (const row of [{ ...multi, is_published: false }, { ...multi, game_type: 'classic' }, { ...multi, multiplayer_game_id: 'unknown' }]) {
    globalThis.__productRows = [row]
    await assert.rejects(() => LocalGamePage({ params: Promise.resolve({ slug: 'fixture' }) }), /NOT_FOUND/)
  }
  globalThis.__productRows = []; await assert.rejects(() => LocalGamePage({ params: Promise.resolve({ slug: 'missing' }) }), /NOT_FOUND/)
  assert.doesNotMatch(renderToStaticMarkup(createElement(MultiplayerGamePanel, { game: { ...multi, multiplayer_game_id: 'unknown' } })), /Jouer en local/)
})
