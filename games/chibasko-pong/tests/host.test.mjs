import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createElement, act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { useChibaskoGame } from '@chibaskogames/sdk/react'
import { pongDefinition } from '@chibaskogames/chibasko-pong'
import Online from '@chibaskogames/chibasko-pong/client'
import Local from '@chibaskogames/chibasko-pong/local'
import { PONG, createPongModel } from '@chibaskogames/chibasko-pong/shared'

test('portable package exports contain no platform entry and carry autonomous CSS', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.deepEqual(Object.keys(pkg.exports), ['.', './client', './local', './server', './shared'])
  assert.equal(pkg.private, true); assert.equal(pongDefinition.integrationVersion, 1)
  const css = await readFile(new URL('../dist/client/pong.module.css', import.meta.url), 'utf8')
  assert.doesNotMatch(css, /@import|@tailwind|@apply|var\(--(?!pong-)/)
  assert.match(css, /font-family: "Trebuchet MS", "Segoe UI", sans-serif/)
  assert.throws(() => createRequire(import.meta.url).resolve('@chibaskogames/chibasko-pong/client/PongCanvas.js'), /not defined by "exports"/)
})

test('minimal React host imports local and SDK online without Next, Auth, transport or global CSS; cleanup survives StrictMode', async () => {
  const dom = new JSDOM('<div id="host"></div>', { pretendToBeVisual: true })
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const frames = new Map(); let sequence = 0, exited = 0
  window.requestAnimationFrame = globalThis.requestAnimationFrame = callback => { frames.set(++sequence, callback); return sequence }
  window.cancelAnimationFrame = globalThis.cancelAnimationFrame = id => frames.delete(id)
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({ createLinearGradient: () => ({ addColorStop() {} }) }, { get: (target, key) => target[key] ?? (() => {}) })
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => { throw new Error('No network belongs in this host') }
  window.WebSocket = class { constructor() { throw new Error('No WebSocket belongs in this host') } }
  const root = createRoot(document.getElementById('host'))
  const listeners = new Set(), sent = []
  const state = { ...createPongModel(), ...PONG, phase: 'PLAYING', players: new Map([
    ['left', { side: 'LEFT', username: 'Alice', avatarUrl: 'https://example.invalid/a.png' }], ['right', { side: 'RIGHT', username: 'Bob' }],
  ]) }
  const connection = { localPlayerId: 'left', getState: () => state, getRevision: () => 1, getSession: () => null,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }, send(type, payload) { sent.push([type, payload]) } }
  function Host() { useChibaskoGame(connection); return createElement(Online, { connection }) }
  try {
    await act(async () => root.render(createElement(StrictMode, null, createElement(Local, { onExit() { exited++ } }))))
    assert.equal(document.querySelectorAll('canvas').length, 1); assert.equal(document.querySelectorAll('button[aria-label]').length, 4)
    assert.match(document.body.textContent, /Joueur 1.*Z \/ S/)
    await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Quitter la partie locale').click())
    assert.equal(exited, 1)
    await act(async () => root.render(createElement(Host)))
    assert.match(document.body.textContent, /Alice/); assert.match(document.body.textContent, /Bob/)
    const avatar = document.querySelector('img'); assert.equal(avatar.src, 'https://example.invalid/a.png'); assert.equal(avatar.width, 36)
    const canvas = document.querySelector('canvas'); canvas.focus()
    canvas.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
    assert.deepEqual(sent.at(-1), ['set_input', { direction: -1 }])
    window.dispatchEvent(new window.Event('blur')); assert.deepEqual(sent.at(-1), ['set_input', { direction: 0 }])
    await act(async () => root.unmount()); assert.equal(frames.size, 0); assert.equal(listeners.size, 0)
  } finally {
    await act(async () => root.unmount()); globalThis.fetch = originalFetch; dom.window.close()
    for (const key of ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT', 'requestAnimationFrame', 'cancelAnimationFrame']) delete globalThis[key]
  }
})
