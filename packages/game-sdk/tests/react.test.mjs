import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useChibaskoGame } from '@chibaskogames/sdk/react'

// A host-owned connection, without platform implementation or transport dependency.
function connection(id) {
  const listeners = new Set(), messages = []
  let revision = 0, state = { answer: 0 }, active = true
  const session = { session: { id: 'opaque-session', gameId: 'example', integrationVersion: 1, execution: 'online' },
    participants: [{ participantId: id, username: 'Player', avatarUrl: null }],
    localParticipantIds: [id], connectedParticipantIds: [id], availability: 'ready' }
  return { facade: Object.freeze({ localPlayerId: id, getState: () => active ? state : null,
    getSession: () => active ? session : null, getRevision: () => revision,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    send: (type, payload) => { if (active) messages.push({ type, payload }) },
  }), listeners, messages,
  update(answer) { state = { answer }; revision++; for (const listener of listeners) listener() },
  invalidate() { active = false; revision++; for (const listener of listeners) listener() },
  }
}

test('React reads a host facade, subscribes, sends, replaces connections and cleans up', async () => {
  const dom = new JSDOM('<div id="host"></div>')
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  const first = connection('participant-a'), second = connection('participant-b')
  const root = createRoot(dom.window.document.getElementById('host'))
  let game
  function Game({ connection }) { game = useChibaskoGame(connection); return React.createElement('span', null, String(game.state?.answer ?? 'closed')) }
  try {
    await act(() => root.render(React.createElement(Game, { connection: first.facade })))
    assert.equal(game.localPlayerId, 'participant-a')
    assert.equal(game.session.participants[0].participantId, 'participant-a')
    assert.equal(first.listeners.size, 1)
    await act(() => first.update(42))
    assert.equal(game.state.answer, 42)
    assert.equal(game.revision, 1)
    game.send('answer', { value: 42 })
    assert.deepEqual(first.messages, [{ type: 'answer', payload: { value: 42 } }])
    await act(() => root.render(React.createElement(Game, { connection: second.facade })))
    assert.equal(first.listeners.size, 0)
    assert.equal(second.listeners.size, 1)
    assert.equal(game.localPlayerId, 'participant-b')
    await act(() => second.invalidate())
    assert.equal(game.session, null)
    assert.equal(game.state, null)
    game.send('answer', { value: 99 })
    assert.deepEqual(second.messages, [])
    assert.equal(dom.window.document.querySelector('span').textContent, 'closed')
  } finally {
    await act(() => root.unmount())
    assert.equal(first.listeners.size, 0)
    assert.equal(second.listeners.size, 0)
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
