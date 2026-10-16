import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement, act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import PongCanvas from '../dist/client/PongCanvas.js'
import PongLocalGame from '../dist/local/PongLocalGame.js'
import { createPongControls } from '../dist/client/pongControls.js'
import { fitPongCourt } from '../dist/client/pongLayout.js'
import { createPongPresentation } from '../dist/client/pongPresentation.js'
import { drawPong } from '../dist/client/pongRenderer.js'
import { readPongView } from '../dist/client/pongView.js'
import { createTestConnection as createGameClientConnection } from './connection.mjs'

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

const mockCanvas = () => {
  const noop=()=>{}
  return {fillRect:noop,strokeRect:noop,setLineDash:noop,beginPath:noop,moveTo:noop,lineTo:noop,stroke:noop,arc:noop,fill:noop,fillText:noop,createLinearGradient:()=>({addColorStop:noop})}
}


test('Pong touch controls send only directions and neutralize release, cancellation, focus, visibility and unmount',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:3000/lobby-playground'})
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
  dom.window.HTMLCanvasElement.prototype.getContext=mockCanvas
  let scheduled=0,cancelled=0;window.requestAnimationFrame=()=>++scheduled;window.cancelAnimationFrame=()=>cancelled++
  const sent=[],view={phase:'PLAYING',remainingMs:0,width:1000,height:600,paddleWidth:16,paddleHeight:100,inset:30,radius:10,leftPaddleY:250,rightPaddleY:250,ballX:500,ballY:300,leftScore:0,rightScore:0,leftName:'Alice',rightName:'Bob',selfSide:'LEFT'}
  const root=createRoot(document.getElementById('root'))
  const onInput=direction=>sent.push(['set_input',{direction}])
  try {
    await act(async()=>root.render(createElement(PongCanvas,{view,onInput})))
    const up=document.querySelector('[aria-label="Monter la raquette"]'),down=document.querySelector('[aria-label="Descendre la raquette"]')
    const pointer=async(target,type,id=1)=>act(async()=>{
      const event=new window.Event(type,{bubbles:true,cancelable:true})
      Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:'touch'},button:{value:0}})
      target.dispatchEvent(event)
    })
    await pointer(up,'pointerdown');assert.deepEqual(sent.at(-1),['set_input',{direction:-1}])
    await pointer(up,'pointerup');assert.equal(sent.at(-1)[1].direction,0)
    await pointer(down,'pointerdown');assert.equal(sent.at(-1)[1].direction,1)
    await pointer(down,'pointercancel');assert.equal(sent.at(-1)[1].direction,0)
    await pointer(up,'pointerdown');await pointer(up,'pointerout');assert.equal(sent.at(-1)[1].direction,0)
    await pointer(up,'pointerdown');await pointer(up,'lostpointercapture');assert.equal(sent.at(-1)[1].direction,0)
    await pointer(down,'pointerdown')
    Object.defineProperty(document,'hidden',{configurable:true,value:true})
    await act(async()=>document.dispatchEvent(new window.Event('visibilitychange')));assert.equal(sent.at(-1)[1].direction,0)
    await pointer(up,'pointerdown');await act(async()=>window.dispatchEvent(new window.Event('blur')));assert.equal(sent.at(-1)[1].direction,0)
    await pointer(down,'pointerdown');await act(async()=>root.unmount());assert.equal(sent.at(-1)[1].direction,0)
    assert.equal(cancelled,1);assert.equal(scheduled,1)
    const count=sent.length;window.dispatchEvent(new window.Event('blur'));assert.equal(sent.length,count)
    for(const [,payload] of sent){assert.deepEqual(Object.keys(payload),['direction']);assert.ok([-1,0,1].includes(payload.direction))}
  }finally{await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT}
})

test('Pong simultaneous inputs remain directional and reset clears every source',()=>{
  const sent=[],controls=createPongControls(v=>sent.push(v))
  controls.press(1,-1);controls.press(2,1);controls.release(1);controls.release(2)
  assert.deepEqual(sent,[-1,0,1,0])
  controls.key('W',true);controls.reset();controls.key('W',false)
  assert.equal(sent.at(-1),0);assert.equal(controls.key('x',true),false)
})

test('Pong presentation keeps motion out of React snapshots, projects points and invalidates through SDK',()=>{
  const state={phase:'COUNTDOWN',remainingMs:3000,width:1000,height:600,paddleWidth:16,paddleHeight:100,inset:30,radius:10,leftPaddleY:250,rightPaddleY:250,ballX:500,ballY:300,leftScore:0,rightScore:0,players:new Map([['local',{username:'Alice',side:'LEFT',avatarUrl:'https://assets.chibaskogames.fr/avatars/test/a.webp'}],['remote',{username:'Bob',side:'RIGHT'}]])}
  const owned=createGameClientConnection({localPlayerId:'local',getState:()=>state,send(){}})
  let time=0;const presentation=createPongPresentation(owned.connection,()=>time)
  assert.equal(presentation.getSnapshot().leftAvatar,state.players.get('local').avatarUrl)
  state.phase='PLAYING';time=10;owned.changed();presentation.getSnapshot()
  assert.equal(presentation.getFrame().goUntil,460)
  const hud=presentation.getSnapshot()
  state.ballX=550;time=60;owned.changed();assert.equal(presentation.getSnapshot(),hud)
  assert.equal(presentation.getFrame().current.ballX,550)
  const frame=presentation.getFrame(),positions=[],ctx=mockCanvas()
  ctx.arc=(x,y)=>positions.push([x,y])
  drawPong(ctx,frame,85,false);assert.equal(positions.at(-1)[0],525)
  drawPong(ctx,frame,85,true);assert.equal(positions.at(-1)[0],550)
  state.leftScore=1;state.phase='POINT_PAUSE';owned.changed()
  assert.equal(presentation.getSnapshot().pointName,'Alice');assert.equal(presentation.getFrame().previous,null)
  owned.dispose();assert.equal(presentation.getSnapshot(),null);assert.equal(presentation.getFrame(),null)
})

test('Pong keyboard sends direction changes only; blur and unmount clear input/listeners', async () => {
  const dom = new JSDOM('<div id="root"></div>', {url:'http://localhost:3000/lobby-playground'})
  globalThis.window=dom.window; globalThis.document=dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT=true
  const calls=[]
  dom.window.HTMLCanvasElement.prototype.getContext=mockCanvas
  const view={phase:'PLAYING',remainingMs:0,width:1000,height:600,paddleWidth:16,paddleHeight:100,inset:30,radius:10,leftPaddleY:250,rightPaddleY:250,ballX:500,ballY:300,leftScore:0,rightScore:0,leftName:'Alice',rightName:'Bob',selfSide:'LEFT'}
  const root=createRoot(document.getElementById('root'))
  try {
    await act(async()=>root.render(createElement(PongCanvas,{view,onInput:direction=>calls.push(direction)})))
    const canvas=document.querySelector('canvas')
    const key=async(type,key)=>act(async()=>canvas.dispatchEvent(new window.KeyboardEvent(type,{key,bubbles:true,cancelable:true})))
    await key('keydown','ArrowUp'); await key('keydown','ArrowUp'); await key('keydown','ArrowDown'); await key('keyup','ArrowUp'); await key('keyup','ArrowDown')
    assert.deepEqual(calls,[-1,0,1,0])
    await key('keydown','w'); window.dispatchEvent(new window.Event('blur')); assert.equal(calls.at(-1),0)
    await act(async()=>root.unmount()); const count=calls.length
    window.dispatchEvent(new window.Event('blur')); assert.equal(calls.length,count)
    assert.equal(canvas.width,1000); assert.equal(canvas.height,600)
  } finally { dom.window.close(); delete globalThis.window; delete globalThis.document; delete globalThis.IS_REACT_ACT_ENVIRONMENT }
})

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

test('Pong view projects public positions and local side, never identity/auth fields', () => {
  const state = { phase:'PLAYING', remainingMs:0,width:1000,height:600,paddleWidth:16,paddleHeight:100,inset:30,radius:10,leftPaddleY:250,rightPaddleY:250,ballX:500,ballY:300,leftScore:1,rightScore:0,players:new Map([['a',{username:'Alice',side:'LEFT',userId:'private-id'}],['b',{username:'Bob',side:'RIGHT',expiresAt:42}]]) }
  const view = readPongView(state,'a'); assert.equal(view.selfSide,'LEFT'); assert.equal(view.leftName,'Alice')
  assert.doesNotMatch(JSON.stringify(view),/private-id|expiresAt|userId|sessionId/)
  assert.equal(readPongView({...state,width:NaN},'a'),null); assert.equal(readPongView({},'a'),null)
})

test('technical Pong renders responsive logical canvas; results expose only public names/scores', () => {
  const view = { phase:'COUNTDOWN', remainingMs:3000,width:1000,height:600,paddleWidth:16,paddleHeight:100,inset:30,radius:10,leftPaddleY:250,rightPaddleY:250,ballX:500,ballY:300,leftScore:0,rightScore:0,leftName:'Alice',rightName:'Bob',selfSide:'LEFT' }
  const canvas = renderToStaticMarkup(createElement(PongCanvas,{view,onInput(){}}))
  assert.match(canvas,/width="1000"/); assert.match(canvas,/height="600"/); assert.match(canvas,/class="canvas"/); assert.match(canvas,/tabindex="0"/)
  assert.match(canvas,/Alice/); assert.match(canvas,/Bob/); assert.doesNotMatch(canvas,/userId|sessionId|JWT/)
})
