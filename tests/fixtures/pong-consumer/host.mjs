import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { pongDefinition } from '@chibaskogames/chibasko-pong'
import Online from '@chibaskogames/chibasko-pong/client'
import Local from '@chibaskogames/chibasko-pong/local'
import { pongServerModule } from '@chibaskogames/chibasko-pong/server'
import { PONG, createPongModel } from '@chibaskogames/chibasko-pong/shared'
assert.equal(pongDefinition, pongServerModule.definition)
assert.equal(PONG.width, 1000); assert.equal(PONG.height, 600)
const dom = new JSDOM('<div id="host"></div>', { pretendToBeVisual: true })
Object.assign(globalThis, { window:dom.window, document:dom.window.document, IS_REACT_ACT_ENVIRONMENT:true })
const frames = new Map(); let sequence = 0, exited = 0
window.requestAnimationFrame = globalThis.requestAnimationFrame = cb => { frames.set(++sequence, cb); return sequence }
window.cancelAnimationFrame = globalThis.cancelAnimationFrame = id => frames.delete(id)
window.HTMLCanvasElement.prototype.getContext = () => new Proxy({ createLinearGradient:() => ({addColorStop(){}}) }, {get:(target,key) => target[key] ?? (()=>{})})
globalThis.fetch = () => { throw new Error('No game-server or platform request in a local game') }
window.WebSocket = class { constructor() { throw new Error('No WebSocket in a local game') } }
const root = createRoot(document.getElementById('host')), listeners = new Set()
const state = { ...createPongModel(), ...PONG, phase:'PLAYING', players:new Map([['left',{side:'LEFT',username:'Alice'}],['right',{side:'RIGHT',username:'Bob'}]]) }
const connection = { localPlayerId:'left', getSession:()=>null, getState:()=>state, getRevision:()=>1, subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},send(){} }
try {
  await act(() => root.render(React.createElement(Local,{onExit(){exited++}})))
  assert.equal(document.querySelectorAll('canvas').length,1)
  assert.equal(document.querySelectorAll('button[aria-label]').length,4)
  await act(() => [...document.querySelectorAll('button')].find(b=>b.textContent==='Quitter la partie locale').click())
  assert.equal(exited,1)
  await act(() => root.render(React.createElement(Online,{connection})))
  assert.match(document.body.textContent,/Alice/);assert.match(document.body.textContent,/Bob/)
} finally { await act(() => root.unmount()); dom.window.close() }
assert.equal(frames.size,0);assert.equal(listeners.size,0)
console.log('All five public Pong entries work in an external React host; local cleanup needs no network.')
