import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import PongLocalGame from '@chibaskogames/chibasko-pong/local'
import LocalGamePage from '../app/games/[slug]/local/page.tsx'
import LocalGameRuntime, { createLocalGameRuntime } from '../components/multiplayer/LocalGameRuntime.tsx'
import MultiplayerGamePanel from '../components/multiplayer/MultiplayerGamePanel.tsx'
import { localGameRegistry } from '../games/clientRegistry.ts'
import { getMultiplayerDefinition, multiplayerGames } from '../lib/multiplayer/catalogue.ts'

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
