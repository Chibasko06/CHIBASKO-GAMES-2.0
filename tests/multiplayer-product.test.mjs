import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createElement, act, useEffect, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { readFile } from 'node:fs/promises'
import { GameCard } from '../components/GameCard.tsx'
import { Navbar } from '../components/Navbar.tsx'
import ChibaskoLogo from '../components/ChibaskoLogo.tsx'
import GamesCatalog from '../components/GamesCatalog.tsx'
import MultiplayerEntry from '../components/multiplayer/MultiplayerEntry.tsx'
import MultiplayerPage, { metadata } from '../app/multiplayer/page.tsx'
import MultiplayerSection from '../components/multiplayer/MultiplayerSection.tsx'
import GamePage from '../app/games/[slug]/page.tsx'
import { getGamesCatalog } from '../lib/queries/games.ts'
import { readCatalogueFilters, catalogueQueryString, filterCatalogue } from '../lib/catalogueFilters.ts'
import { LobbyView } from '../components/multiplayer/LobbyExperience.tsx'
import LobbyPage, { metadata as lobbyMetadata } from '../app/games/[slug]/lobby/[code]/page.tsx'
import LoginPage from '../app/login/page.tsx'
import RegisterPage from '../app/register/page.tsx'
import AuthCallbackPage from '../app/auth/callback/page.tsx'
import PongCanvas from '../games/chibasko-pong/client/PongCanvas.tsx'
import { createGameRuntime } from '../components/multiplayer/GameRuntime.tsx'
import { clientGameRegistry } from '../games/clientRegistry.ts'
import { createGameClientConnection } from '../lib/multiplayer/gameClientModule.ts'
import { useChibaskoGame } from '@chibaskogames/sdk/react'
import { createPongPresentation } from '../games/chibasko-pong/client/pongPresentation.ts'
import { createPongControls } from '../games/chibasko-pong/client/pongControls.ts'
import { drawPong } from '../games/chibasko-pong/client/pongRenderer.ts'
import { gameLaunchOptions } from '../lib/multiplayer/gameLaunchOptions.ts'
import GameResults from '../components/multiplayer/GameResults.tsx'
import PublicLobbyBrowser from '../components/multiplayer/PublicLobbyBrowser.tsx'
import OnlinePage, { metadata as onlineMetadata } from '../app/games/[slug]/online/page.tsx'
import PrivatePage from '../app/games/[slug]/private/page.tsx'
import GameTypeFields from '../components/admin/GameTypeFields.tsx'
import { changeGameFormType, gameFormPayload } from '../lib/multiplayer/catalogue.ts'
import { validateGameCatalogue } from '../lib/server/gameCatalogueValidation.ts'

test('game launch options follow explicit capabilities and keep future public access separate from private/local',()=>{
  const players={min:2,max:2}
  assert.deepEqual(gameLaunchOptions(undefined),[])
  assert.deepEqual(gameLaunchOptions({online:{access:['private'],players}}),[
    {kind:'private',label:'Partie privée',description:'Crée une partie privée ou rejoins-en une avec un code.'},
  ])
  assert.deepEqual(gameLaunchOptions({local:{players}}),[
    {kind:'local',label:'Jouer en local',description:'Joue à deux sur le même appareil.'},
  ])
  const future=gameLaunchOptions({online:{access:['public','private'],players},local:{players}})
  assert.deepEqual(future.map(({kind,label})=>[kind,label]),[
    ['public','Jouer en ligne'],['private','Partie privée'],['local','Jouer en local'],
  ])
  assert.deepEqual(gameLaunchOptions({online:{access:['public'],players}}).map(({kind})=>kind),['public'])
})

test('admin form modes show controlled fields, clear launch values, preserve beta/categories and restore edits',async()=>{
  const saved=[]
  function Form({initial,editing=false}){
    const [form,setForm]=useState(initial)
    return createElement('form',{onSubmit:e=>{e.preventDefault();saved.push(validateGameCatalogue(gameFormPayload(form))) }},
      createElement(GameTypeFields,{type:form.game_type,gameUrl:form.game_url,gameId:form.multiplayer_game_id,onType:type=>setForm(f=>changeGameFormType(f,type,editing)),onUrl:game_url=>setForm(f=>({...f,game_url})),onGameId:multiplayer_game_id=>setForm(f=>({...f,multiplayer_game_id}))}),
      createElement('button',{type:'submit'},'Sauver'))
  }
  const initial={title:'Fixture',slug:'fixture',game_type:'classic',game_url:'https://game.example',multiplayer_game_id:'',is_published:true,is_beta:true,category_ids:['11111111-1111-4111-8111-111111111111']}
  await mounted(Form,{initial},async root=>{
    assert.equal(document.querySelector('input[type=url]').required,true);assert.equal(document.querySelector('select'),null)
    await click(document.querySelector('input[value=multiplayer_chibasko]'))
    assert.equal(document.querySelector('input[type=url]'),null)
    const select=document.querySelector('select');assert.equal(select.required,true)
    assert.deepEqual([...select.options].map(o=>o.value),['','chibasko-pong'])
    assert.match(document.body.textContent,/chargé directement par Chibasko Games/)
    await act(async()=>{select.value='chibasko-pong';select.dispatchEvent(new window.Event('change',{bubbles:true}))})
    assert.match(document.querySelector('output').textContent,/2 joueurs/);assert.equal(document.querySelector('input[type=number]'),null)
    await act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
    assert.equal(saved[0].payload.game_url,null);assert.equal(saved[0].payload.is_published,false);assert.equal(saved[0].payload.is_beta,true)
    assert.deepEqual(saved[0].categoryIds,initial.category_ids)
    await click(document.querySelector('input[value=classic]'))
    assert.equal(document.querySelector('select'),null);assert.equal(document.querySelector('input[type=url]').value,'')
    assert.equal(document.querySelector('input[type=url]').checkValidity(),false)
    await act(async()=>root.render(createElement(Form,{key:'edit',editing:true,initial:{...initial,game_type:'multiplayer_chibasko',game_url:'',multiplayer_game_id:'chibasko-pong'}})))
    assert.equal(document.querySelector('select').value,'chibasko-pong');assert.equal(document.querySelector('input[type=url]'),null)
  })
})

test('admin link reflects only server approval and is absent for a normal account',async t=>{
  globalThis.__productAuth={user:{id:'normal'},session:{access_token:'fixture'},loading:false}
  t.mock.method(globalThis,'fetch',async()=>Response.json({isAdmin:false}))
  await mounted(Navbar,{},async()=>{assert.equal(document.querySelector('a[href="/admin"]'),null)})
  globalThis.__productAuth={user:{id:'admin'},session:{access_token:'fixture'},loading:false}
  globalThis.fetch=async()=>Response.json({isAdmin:true})
  await mounted(Navbar,{},async()=>{assert.ok(document.querySelector('a[href="/admin"]'))})
})


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

test('results communicate local outcome, forfeit, host action and waiting without game-specific logic',()=>{
  const result={winner:'Alice',reason:'score',outcome:'win',players:[{username:'Alice',score:5},{username:'Bob',score:3}]}
  const win=html(GameResults,{result,host:true,onReturn(){}})
  assert.match(win,/Victoire !|Alice remporte la partie|5 – 3|Retour à la salle d’attente/)
  const loss=html(GameResults,{result:{...result,outcome:'loss',reason:'forfeit'},host:false})
  assert.match(loss,/Défaite/);assert.match(loss,/Victoire par abandon/);assert.match(loss,/En attente de l’hôte/)
  assert.doesNotMatch(loss,/<button|userId|sessionId/)
  const noScore=html(GameResults,{result:{winner:'',reason:'completed',players:[{username:'A'}]},host:false})
  assert.match(noScore,/Merci d’avoir joué/);assert.doesNotMatch(noScore,/undefined/)
})


const mockCanvas = () => {
  const noop=()=>{}
  return {fillRect:noop,strokeRect:noop,setLineDash:noop,beginPath:noop,moveTo:noop,lineTo:noop,stroke:noop,arc:noop,fill:noop,fillText:noop,createLinearGradient:()=>({addColorStop:noop})}
}

test('client registry loads Pong on demand and contains only component loaders', async () => {
  assert.deepEqual(Object.keys(clientGameRegistry), ['chibasko-pong'])
  assert.equal(Object.hasOwn(clientGameRegistry,'unknown'),false)
  assert.equal(typeof clientGameRegistry['chibasko-pong'],'function')
  const loaded = await clientGameRegistry['chibasko-pong']()
  assert.deepEqual(Object.keys(loaded).sort(), ['default','gameId'])
  assert.equal(loaded.gameId,'chibasko-pong'); assert.equal(loaded.default.$$typeof,Symbol.for('react.memo'))
})

test('real lazy Pong module renders public state, sends its own input and observes revisions', async () => {
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:3000/lobby-playground'})
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
  dom.window.HTMLCanvasElement.prototype.getContext=mockCanvas
  const state={phase:'PLAYING',remainingMs:0,width:1000,height:600,paddleWidth:16,paddleHeight:100,inset:30,radius:10,leftPaddleY:250,rightPaddleY:250,ballX:500,ballY:300,leftScore:0,rightScore:0,players:new Map([['local',{username:'Alice',side:'LEFT'}],['remote',{username:'Bob',side:'RIGHT'}]])}
  const sent=[];const owned=createGameClientConnection({localPlayerId:'local',getState:()=>state,send:(...args)=>sent.push(args)})
  const Runtime=createGameRuntime(clientGameRegistry),root=createRoot(document.getElementById('root'))
  try {
    await act(async()=>root.render(createElement(Runtime,{gameId:'chibasko-pong',connection:owned.connection})))
    const canvas=document.querySelector('canvas');assert.ok(canvas)
    await act(async()=>canvas.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true})))
    assert.deepEqual(sent[0],['set_input',{direction:-1}])
    await act(async()=>{state.leftScore=2;owned.changed()})
    assert.match(document.querySelector('[aria-label^="Score"]').getAttribute('aria-label'),/Alice 2/)
    await act(async()=>root.unmount());assert.deepEqual(sent.at(-1),['set_input',{direction:0}])
  } finally {owned.dispose();dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT}
})

test('runtime renders an injected second lazy module, switches games and cleans without owning Room', async () => {
  let loads=0, mounts=0, cleanups=0
  function TestGame({connection}) {
    const game=useChibaskoGame(connection)
    const {send}=game
    useEffect(()=>{mounts++;return()=>{cleanups++;send('neutral')}},[send])
    return createElement('button',{onClick:()=>game.send('answer',{choice:2})},`Second test module: ${game.state.question}`)
  }
  const registry={...clientGameRegistry,'test-game':async()=>{loads++;return {gameId:'test-game',default:TestGame}}}
  const Runtime=createGameRuntime(registry)
  const messages=[]
  const owned=createGameClientConnection({localPlayerId:'local',getState:()=>({question:'Question distincte'}),send:(type,payload)=>messages.push([type,payload])})
  await mounted(Runtime,{gameId:'unknown',connection:owned.connection},async root=>{
    assert.match(document.body.textContent,/temporairement indisponible/);assert.equal(loads,0)
    await act(async()=>root.render(createElement(Runtime,{gameId:'test-game',connection:owned.connection})))
    assert.match(document.body.textContent,/Second test module/);assert.equal(loads,1);assert.equal(mounts,1)
    assert.match(document.body.textContent,/Question distincte/)
    await click(document.querySelector('button'));assert.deepEqual(messages.shift(),['answer',{choice:2}])
    await act(async()=>root.render(createElement(Runtime,{gameId:'chibasko-pong',connection:owned.connection})))
    assert.match(document.body.textContent,/Préparation du terrain/)
    assert.equal(cleanups,1);assert.equal(messages[0][0],'neutral')
    await act(async()=>root.render(createElement(Runtime,{gameId:'test-game',connection:owned.connection})))
    assert.equal(loads,1);assert.equal(mounts,2)
  })
  assert.equal(cleanups,2)
  owned.dispose();const count=messages.length;owned.connection.send('late');assert.equal(messages.length,count)
  assert.deepEqual(Object.keys(owned.connection).sort(),['getRevision','getSession','getState','localPlayerId','send','subscribe'])
})

test('late lazy module resolving after unmount never mounts or installs game listeners', async () => {
  let release, mountedCount=0
  function DeferredGame(){useEffect(()=>{mountedCount++},[]);return createElement('p',null,'Late')}
  const Runtime=createGameRuntime({'test-game':()=>new Promise(resolve=>{release=resolve})})
  const owned=createGameClientConnection({localPlayerId:'local',getState:()=>null,send(){}})
  await mounted(Runtime,{gameId:'test-game',connection:owned.connection},async root=>{
    assert.match(document.body.textContent,/Chargement du jeu/)
    await act(async()=>root.render(null))
    await act(async()=>release({gameId:'test-game',default:DeferredGame}))
    assert.equal(mountedCount,0)
  })
  owned.dispose()
})

test('SDK hook follows state revisions, switches connections, unsubscribes and rejects stale sends', async () => {
  let state={question:'First'}, observed, notifications=0
  const sent=[]
  const first=createGameClientConnection({localPlayerId:'A',getState:()=>state,send:(...args)=>sent.push(args)})
  const second=createGameClientConnection({localPlayerId:'B',getState:()=>({answer:42}),send:(...args)=>sent.push(args)})
  const watched=connection=>({...connection,subscribe(listener){notifications++;const remove=connection.subscribe(listener);return()=>{notifications--;remove()}}})
  const connectionA=watched(first.connection),connectionB=watched(second.connection)
  function Fixture({connection}){observed=useChibaskoGame(connection);return createElement('p',null,JSON.stringify(observed.state))}
  await mounted(Fixture,{connection:connectionA},async root=>{
    assert.equal(observed.localPlayerId,'A');assert.equal(notifications,1)
    assert.deepEqual(Object.keys(observed).sort(),['localPlayerId','revision','send','session','state','subscribe'])
    let callbacks=0;const unsubscribe=observed.subscribe(()=>callbacks++)
    await act(async()=>{state={question:'Changed'};first.changed()})
    assert.match(document.body.textContent,/Changed/);assert.equal(observed.revision,1);assert.equal(callbacks,1)
    unsubscribe();await act(async()=>first.changed());assert.equal(callbacks,1)
    observed.send('answer',{choice:1});assert.deepEqual(sent.shift(),['answer',{choice:1}])
    const stale=observed
    await act(async()=>{first.dispose();root.render(createElement(Fixture,{connection:connectionB}))})
    assert.equal(observed.localPlayerId,'B');assert.deepEqual(observed.state,{answer:42});assert.equal(notifications,1)
    stale.send('late');assert.equal(sent.length,0);assert.equal(first.connection.getState(),null)
    await act(async()=>second.dispose());assert.equal(observed.state,null)
    observed.send('late');assert.equal(sent.length,0)
  })
  assert.equal(notifications,0);first.dispose();second.dispose()
})

test('generic platform has no Pong import, condition or direction input; registry is the explicit boundary', async () => {
  for (const path of ['components/multiplayer/LobbyExperience.tsx','components/multiplayer/MultiplayerProvider.tsx','lib/multiplayer/productSession.ts','lib/lobbyGameSession.ts','components/multiplayer/GameRuntime.tsx','components/multiplayer/PublicLobbyBrowser.tsx','lib/multiplayer/publicLobbies.ts','game-server/src/index.ts','game-server/src/rooms/LobbyRoom.ts','game-server/src/platform/multiplayer/GameSessionCoordinator.ts']) {
    const source=await readFile(new URL(`../${path}`,import.meta.url),'utf8')
    assert.doesNotMatch(source,/chibasko-pong|PongCanvas|PongRoom|pongView|set_input|direction/)
  }
  const registry=await readFile(new URL('../games/clientRegistry.ts',import.meta.url),'utf8')
  assert.ok(registry.includes("() => import('@chibaskogames/chibasko-pong/client')"))
  assert.doesNotMatch(registry,/roomType|SUPABASE|https?:\/\/|minPlayers|secret/)
  for(const path of ['packages/game-sdk/src/index.ts','packages/game-sdk/src/client/index.ts','packages/game-sdk/src/react/index.ts','packages/game-sdk/src/server/index.ts','game-server/src/platform/multiplayer/internalGameAdapter.ts']) {
    assert.doesNotMatch(await readFile(new URL(`../${path}`,import.meta.url),'utf8'),/Pong|chibasko-pong|set_input|direction/)
  }
  for(const path of ['games/chibasko-pong/client/PongGame.tsx','games/chibasko-pong/server/PongRoom.ts']) {
    const source=await readFile(new URL(`../${path}`,import.meta.url),'utf8')
    assert.match(source,/@chibaskogames\/sdk/)
    assert.doesNotMatch(source,/GameSessionCoordinator|GameAdmission|MultiplayerProvider|AuthProvider|expiresAt/)
  }
})

test('technical Pong renders responsive logical canvas; results expose only public names/scores', () => {
  const view = { phase:'COUNTDOWN', remainingMs:3000,width:1000,height:600,paddleWidth:16,paddleHeight:100,inset:30,radius:10,leftPaddleY:250,rightPaddleY:250,ballX:500,ballY:300,leftScore:0,rightScore:0,leftName:'Alice',rightName:'Bob',selfSide:'LEFT' }
  const canvas = renderToStaticMarkup(createElement(PongCanvas,{view,onInput(){}}))
  assert.match(canvas,/width="1000"/); assert.match(canvas,/height="600"/); assert.match(canvas,/class="canvas"/); assert.match(canvas,/tabindex="0"/)
  assert.match(canvas,/Alice/); assert.match(canvas,/Bob/); assert.doesNotMatch(canvas,/userId|sessionId|JWT/)
  const result = renderToStaticMarkup(createElement(LobbyView,{title:'Test local',state:{error:'',lobby:{slug:'test',gameId:'chibasko-pong',code:'AB7KQ2',status:'RESULTS',minPlayers:2,maxPlayers:2,players:[{username:'Alice',avatarUrl:'',ready:true,self:true,host:true}],result:{winner:'Alice',reason:'forfeit',players:[{username:'Alice',score:3},{username:'Bob',score:1}]}},game:{connected:true,count:2,expected:2,status:'READY'}},onReady(){},onStart(){},onLeave(){},onReturn(){}}))
  assert.match(result,/Partie terminée/); assert.match(result,/Alice remporte la partie/); assert.match(result,/3 – 1/); assert.match(result,/Victoire par abandon/); assert.match(result,/Retour à la salle d’attente/)
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

const classic = { id:'classic', title:'Arcade Classic', slug:'classic', game_type:'classic', game_url:'https://example.com/game', multiplayer_game_id:null, thumbnail_url:null, is_beta:false, is_published:true, views_count:5, mobile_compatible:'oui', created_at:'2026-01-01', categories:[{id:'arcade',slug:'arcade',name:'Arcade'}] }
const multi = {...classic,id:'multi',title:'Chibasko Pong',slug:'pong',game_type:'multiplayer_chibasko',game_url:null,multiplayer_game_id:'chibasko-pong',is_beta:true}
const hidden = {...multi,id:'hidden',slug:'hidden',is_published:false}
const html = (Component,props={}) => renderToStaticMarkup(createElement(Component,props))
beforeEach(()=>{globalThis.__productAuth={user:null,session:null,loading:false};globalThis.__productRows=[classic,multi,hidden];globalThis.__productSearch=''})

async function mounted(Component, props, run) {
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:3000/games'})
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
  const originalReplace=window.history.replaceState.bind(window.history)
  window.history.replaceState=(...args)=>{originalReplace(...args);window.dispatchEvent(new window.PopStateEvent('popstate'))}
  const root=createRoot(document.getElementById('root'))
  try {await act(async()=>root.render(createElement(Component,props)));await run(root)}
  finally {await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT}
}
const click=async element=>{await act(async()=>element.click())}

test('online/private routes require a session, validate catalogue/capability, and retain exact safe returns', async()=>{
  for(const [Page,path] of [[OnlinePage,'online'],[PrivatePage,'private']]){
    await assert.rejects(Page({params:Promise.resolve({slug:'pong'})}),new RegExp('REDIRECT /login\\?next='+encodeURIComponent('/games/pong/'+path)))
    for(const slug of ['missing','classic','hidden']) await assert.rejects(Page({params:Promise.resolve({slug})}),/NOT_FOUND/)
    globalThis.__productAuth={user:{id:'A'},loading:false}
    const content=renderToStaticMarkup(await Page({params:Promise.resolve({slug:'pong'})}))
    assert.match(content,/Chibasko Pong/); assert.match(content,path==='online'?/Salons publics/:/Créer une partie privée/)
    globalThis.__productAuth={user:null,loading:false}
  }
  assert.equal(onlineMetadata.robots.index,false)
  globalThis.__productRows=[{...multi,multiplayer_game_id:'unknown'}]
  await assert.rejects(OnlinePage({params:Promise.resolve({slug:'pong'})}),/NOT_FOUND/)
})

test('public browser loads only explicitly, refreshes, creates and joins using the shared product controller', async()=>{
  const calls=[],game={slug:'pong',gameId:'chibasko-pong'}
  let lists=0
  globalThis.__productAuth={user:{id:'A'},loading:false}
  globalThis.__productMultiplayer={available:true,state:{busy:false,error:''},controller:{
    async listPublic(id,signal){lists++;assert.equal(id,game.gameId);assert.equal(signal.aborted,false);return lists===1?[]:[{code:'ABCDEF',gameId:game.gameId,host:{username:'Alice très long nom public',avatarUrl:null},currentPlayers:1,maxPlayers:2}]},
    async connect(...args){calls.push(args);return {...game,code:'ABCDEF'}},
  }}
  try{
    await mounted(PublicLobbyBrowser,{game},async()=>{
      assert.equal(lists,1);assert.match(document.body.textContent,/Aucun salon public/)
      assert.equal(calls.length,0,'viewing a page never joins')
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Actualiser'))
      assert.equal(lists,2);assert.match(document.body.textContent,/Salon de Alice/);assert.match(document.body.textContent,/1 \/ 2 joueurs/)
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Rejoindre'))
      assert.deepEqual(calls[0],[game,'ABCDEF',{publicOnly:true}]);assert.equal(globalThis.__productNavigation,'/games/pong/lobby/ABCDEF')
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Créer un salon public'))
      assert.deepEqual(calls[1],[game,undefined,{visibility:'public'}])
    })
  }finally{delete globalThis.__productMultiplayer}
})

test('public browser handles errors, expired auth, unavailable server and aborts old listing on account change/unmount',async()=>{
  const game={slug:'pong',gameId:'chibasko-pong'}
  const state={busy:false,error:''};let mode='network',requests=[]
  globalThis.__productAuth={user:{id:'A'},loading:false}
  globalThis.__productMultiplayer={available:true,state,controller:{async listPublic(_id,signal){requests.push(signal);if(mode==='pending')return new Promise(()=>{});throw mode==='expired'?new Error('AUTH_REQUIRED'):new TypeError('fetch failed')}}}
  try{
    await mounted(PublicLobbyBrowser,{game},async root=>{
      assert.match(document.querySelector('[role=alert]').textContent,/temporairement indisponible/)
      const refresh=[...document.querySelectorAll('button')].find(b=>b.textContent==='Actualiser')
      assert.equal(refresh.disabled,false,'failed request never leaves an infinite spinner')
      mode='expired';await click(refresh);assert.equal(globalThis.__productNavigation,'/login?next=%2Fgames%2Fpong%2Fonline')
      mode='pending';await click(refresh);assert.equal(refresh.disabled,true)
      const previous=requests.at(-1);globalThis.__productAuth={user:{id:'B'},loading:false}
      await act(async()=>root.render(createElement(PublicLobbyBrowser,{game})));assert.equal(previous.aborted,true)
      await act(async()=>root.unmount());assert.equal(requests.at(-1).aborted,true)
    })
    globalThis.__productMultiplayer.available=false
    await mounted(PublicLobbyBrowser,{game},async()=>{
      assert.match(document.body.textContent,/temporairement indisponible/)
      assert.ok([...document.querySelectorAll('button')].every(b=>b.disabled))
    })
    globalThis.__productAuth={user:null,loading:false}
    await mounted(PublicLobbyBrowser,{game},async()=>{
      assert.ok(document.querySelector('a[href="/login?next=%2Fgames%2Fpong%2Fonline"]'))
      assert.equal(document.querySelector('ul'),null)
    })
  }finally{delete globalThis.__productMultiplayer}
})

test('dedicated private form creates through the existing pipeline; lobby identifies public access',async()=>{
  const game={slug:'pong',gameId:'chibasko-pong'},calls=[]
  globalThis.__productAuth={user:{id:'A'},loading:false}
  globalThis.__productMultiplayer={available:true,state:{busy:false,error:''},controller:{async connect(...args){calls.push(args);return {...game,code:'ABCDEF'}}}}
  try{
    await mounted(MultiplayerEntry,{game,expanded:true,returnPath:'/games/pong/private'},async()=>{
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Créer une partie privée'))
      assert.deepEqual(calls[0],[game,undefined]);assert.equal(globalThis.__productNavigation,'/games/pong/lobby/ABCDEF')
    })
    const markup=html(LobbyView,{title:'Fixture',state:{error:'',lobby:{...game,visibility:'public',code:'ABCDEF',status:'WAITING',minPlayers:2,maxPlayers:2,players:[]},game:{}},onReady(){},onStart(){},onLeave(){}})
    assert.match(markup,/Salon public/)
  }finally{delete globalThis.__productMultiplayer}
})

test('navbar desktop/mobile has Multiplayer, no Home link, logo still links home',async()=>{
  assert.match(html(ChibaskoLogo),/href="\/"/)
  await mounted(Navbar,{},async()=>{
    assert.equal(document.querySelectorAll('a[href="/multiplayer"]').length,1)
    await click(document.querySelector('button[aria-label="Ouvrir le menu"]'))
    assert.equal(document.querySelectorAll('a[href="/multiplayer"]').length,2)
    assert.ok([...document.querySelectorAll('a')].every(a=>a.textContent.trim()!=='Accueil'))
    assert.ok(document.querySelector('a[href="/"] img[alt="Logo Chibasko Games"]'))
  })
})
test('cards share routes, preserve classics and show public multiplayer/beta capacity',()=>{
  const plain=html(GameCard,{game:classic}), multiplayer=html(GameCard,{game:multi})
  assert.match(plain,/href="\/games\/classic"/);assert.doesNotMatch(plain,/Multijoueur|Bêta|joueurs/)
  assert.match(multiplayer,/href="\/games\/pong"/);assert.match(multiplayer,/Multijoueur/);assert.match(multiplayer,/2 joueurs/);assert.match(multiplayer,/Bêta/)
  assert.match(html(GameCard,{game:{...multi,multiplayer_game_id:'unknown'}}),/Indisponible/)
})
test('type, search, category, device and sorting compose and round-trip URLs',()=>{
  const defaults=readCatalogueFilters(new URLSearchParams())
  assert.equal(filterCatalogue([classic,multi],defaults).length,2)
  assert.deepEqual(filterCatalogue([classic,multi],{...defaults,type:'classic'}).map(g=>g.id),['classic'])
  const filters={...defaults,type:'multiplayer',search:'pong',category:'arcade',device:'mobile',sort:'title-asc'}
  assert.deepEqual(filterCatalogue([classic,multi],filters).map(g=>g.id),['multi'])
  assert.equal(filterCatalogue([classic,multi],{...filters,category:'sport'}).length,0)
  assert.deepEqual(readCatalogueFilters(new URL(catalogueQueryString(filters),'http://localhost').searchParams),filters)
  assert.equal(catalogueQueryString({...defaults,type:'multiplayer'}),'/games?type=multiplayer')
})
test('catalogue type controls update the shareable URL and retain category filters',async()=>{
  await mounted(GamesCatalog,{games:[classic,multi],categories:classic.categories},async()=>{
    const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)
    await click(button('Multijoueur'))
    assert.equal(window.location.search,'?type=multiplayer')
    assert.equal(document.querySelectorAll('article').length,1)
    await click(button('Arcade'));assert.match(window.location.search,/category=arcade/)
    await click(button('Classiques'));assert.equal(document.querySelector('article h3').textContent,classic.title)
    await click(button('Tous'));assert.equal(document.querySelectorAll('article').length,2)
  })
})
test('published queries share logic, multiplayer page excludes classic/hidden and has SEO',async()=>{
  assert.deepEqual((await getGamesCatalog()).map(g=>g.id),['classic','multi'])
  assert.deepEqual((await getGamesCatalog('classic')).map(g=>g.id),['classic'])
  assert.deepEqual((await getGamesCatalog('multiplayer_chibasko')).map(g=>g.id),['multi'])
  const content=renderToStaticMarkup(await MultiplayerPage())
  assert.match(content,/href="\/games\/pong"/);assert.doesNotMatch(content,/href="\/games\/classic"|href="\/games\/hidden"/)
  assert.match(metadata.alternates.canonical,/\/multiplayer$/)
  globalThis.__productRows=[classic]
  assert.match(renderToStaticMarkup(await MultiplayerPage()),/arrivent bientôt/)
})
test('home multiplayer section works with published games or an empty catalogue',()=>{
  assert.match(html(MultiplayerSection,{games:[],home:true}),/arrivent bientôt/)
  const content=html(MultiplayerSection,{games:[multi],home:true})
  assert.match(content,/href="\/multiplayer"/);assert.match(content,/href="\/games\/pong"/)
})
test('shared game detail keeps classic iframe and exposes multiplayer without iframe',async()=>{
  const render=async slug=>renderToStaticMarkup(await GamePage({params:Promise.resolve({slug})}))
  const a=await render('classic');assert.match(a,/<iframe/);assert.match(a,/https:\/\/example.com\/game/)
  const b=await render('pong');assert.doesNotMatch(b,/<iframe/);assert.match(b,/2 joueurs/);assert.match(b,/Bêta/);assert.match(b,/Partie privée/)
  assert.match(b,/Crée une partie privée ou rejoins-en une avec un code\./)
  assert.match(b,/Jouer en local/);assert.match(b,/Joue à deux sur le même appareil\./)
  assert.doesNotMatch(b,/Jouer en multijoueur/);assert.ok(b.includes('href="/games/pong/online"'));assert.ok(b.includes('href="/games/pong/private"'));assert.match(b,/Rejoins un salon public ou crée le tien/)
  for(const content of [a,b]){assert.match(content,/Favoris/);assert.match(content,/data-testid="reviews"/);assert.match(content,/👍/)}
  globalThis.__productRows=[{...multi,multiplayer_game_id:'unknown'}]
  assert.match(await render('pong'),/temporairement indisponible/)
})
test('entry invites guests before any network request; absent service disables authenticated actions',async()=>{
  let calls=0;const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw new Error('Network forbidden')}
  try {
    await mounted(MultiplayerEntry,{game:{slug:'pong',gameId:'chibasko-pong'}},async()=>{
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Partie privée'))
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Créer une partie'))
      assert.ok(document.querySelector('a[href^="/login?next="]'));assert.ok(document.querySelector('a[href^="/register?next="]'))
      globalThis.__productAuth={user:{id:'verified'},session:{},loading:false}
      // Fresh mount below verifies the signed-in service-unavailable policy.
    })
    globalThis.__productMultiplayer={available:false,state:{busy:false,error:''},controller:{}}
    await mounted(MultiplayerEntry,{game:{slug:'pong',gameId:'chibasko-pong'}},async()=>{
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Partie privée'))
      for(const label of ['Créer une partie','Rejoindre'])assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent===label).disabled)
    })
    assert.equal(calls,0)
  } finally {globalThis.fetch=originalFetch;delete globalThis.__productMultiplayer}
})
test('multiplayer route is included in sitemap source; game tracking does not mark preview as played',async()=>{
  assert.match(await readFile(new URL('../app/sitemap.ts',import.meta.url),'utf8'),/absoluteUrl\('\/multiplayer'\)/)
  assert.match(await readFile(new URL('../components/PlaySessionTracker.tsx',import.meta.url),'utf8'),/if \(!recordPlay \|\| !user/)
})

test('network outage disables create/join and offers an explicit retry',async()=>{
  let retried=0
  globalThis.__productAuth={user:{id:'A'},loading:false}
  globalThis.__productMultiplayer={available:true,state:{busy:false,unavailable:true,error:'Le multijoueur de Chibasko Games est temporairement indisponible.'},controller:{retry(){retried++}}}
  try {
    await mounted(MultiplayerEntry,{game:{slug:'pong',gameId:'chibasko-pong'}},async()=>{
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Partie privée'))
      assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='Créer une partie').disabled)
      assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='Rejoindre').disabled)
      assert.match(document.querySelector('[role="alert"]').textContent,/temporairement indisponible/)
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Réessayer la connexion'));assert.equal(retried,1)
    })
  } finally {delete globalThis.__productMultiplayer}
})

test('lobby UI renders public players, host, ready, start rules and game readiness',async()=>{
  const state={busy:false,error:'',lobby:{slug:'pong',gameId:'chibasko-pong',code:'AB7KQ2',status:'WAITING',minPlayers:2,maxPlayers:2,players:[{username:'Alice',avatarUrl:'',ready:false,host:true,self:true}]},game:{connected:false,count:0,expected:2,status:''}}
  const actions=[]
  await mounted(LobbyView,{title:'Chibasko Pong',state,onReady:v=>actions.push(['ready',v]),onStart:()=>actions.push(['start']),onLeave:()=>actions.push(['leave'])},async root=>{
    assert.match(document.body.textContent,/Hôte|Pas prêt|En attente d’un autre joueur/)
    assert.equal(document.querySelectorAll('img').length,0)
    const button=name=>[...document.querySelectorAll('button')].find(b=>b.textContent===name)
    assert.equal(button('Lancer la partie').disabled,true)
    await click(button('Je suis prêt'));assert.deepEqual(actions[0],['ready',true])
    const players=[{...state.lobby.players[0],ready:true},{username:'Bob',avatarUrl:'https://assets.chibaskogames.fr/avatars/test/image.webp',ready:true,host:false,self:false}]
    const render=next=>act(async()=>root.render(createElement(LobbyView,{title:'Chibasko Pong',state:next,onReady:v=>actions.push(['ready',v]),onStart:()=>actions.push(['start']),onLeave:()=>actions.push(['leave'])})))
    await render({...state,lobby:{...state.lobby,players}})
    assert.equal(button('Lancer la partie').disabled,false);await click(button('Annuler prêt'));assert.deepEqual(actions[1],['ready',false])
    await click(button('Lancer la partie'));assert.deepEqual(actions[2],['start'])
    await render({...state,lobby:{...state.lobby,players,status:'STARTING'}})
    assert.equal(button('Lancer la partie').hasAttribute('aria-describedby'),false)
    assert.match(document.body.textContent,/La partie démarre|Connexion au serveur de jeu/)
    assert.equal(button('Annuler prêt').disabled,true)
    await render({...state,lobby:{...state.lobby,players,status:'PLAYING'},game:{connected:true,count:2,expected:2,status:'READY'}})
    assert.match(document.body.textContent,/Partie prête|2 \/ 2 joueurs connectés|pas encore de jeu jouable/)
    assert.doesNotMatch(document.body.textContent,/sessionId|userId|Colyseus|JWT/)
    await click(button('Quitter la partie'));assert.deepEqual(actions[3],['leave'])
    await render({...state,lobby:{...state.lobby,players:players.map(p=>({...p,host:!p.host}))}})
    assert.equal(button('Lancer la partie'),undefined)
  })
})

test('private route validates catalogue/type/code and requires explicit join with noindex',async()=>{
  assert.equal(lobbyMetadata.robots.index,false)
  const content=renderToStaticMarkup(await LobbyPage({params:Promise.resolve({slug:'pong',code:'ab7kq2'})}))
  assert.match(content,/Rejoindre cette partie/);assert.match(content,/AB7KQ2/)
  for(const params of [{slug:'missing',code:'AB7KQ2'},{slug:'classic',code:'AB7KQ2'},{slug:'pong',code:'INVALID'}])await assert.rejects(LobbyPage({params:Promise.resolve(params)}),/NOT_FOUND/)
})

test('login, register confirmation and Google/callback preserve a safe return path',async()=>{
  const next='/games/pong/lobby/AB7KQ2'
  const destination=async()=>act(async()=>window.history.replaceState(null,'',`/login?next=${encodeURIComponent(next)}`))
  await mounted(LoginPage,{},async()=>{
    await destination()
    await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Connexion'))
    assert.equal(globalThis.__productNavigation,next)
    await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Google')))
    assert.equal(new URL(globalThis.__productOAuth.options.redirectTo).searchParams.get('next'),next)
  })
  await mounted(RegisterPage,{},async()=>{
    await destination()
    await act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
    assert.equal(new URL(globalThis.__productSignUp.options.emailRedirectTo).searchParams.get('next'),next)
  })
  globalThis.__productSession={user:{id:'A'}}
  await mounted(RegisterPage,{},async()=>{
    await destination()
    await act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
    assert.equal(globalThis.__productNavigation,next)
  })
  globalThis.__productSearch=`?next=${encodeURIComponent(next)}`
  // Callback reads the browser URL before its effect runs.
  const dom=new JSDOM('<div id="root"></div>',{url:`http://localhost:3000/auth/callback?next=${encodeURIComponent(next)}`})
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
  const root=createRoot(document.getElementById('root'))
  try {await act(async()=>root.render(createElement(AuthCallbackPage)));assert.equal(globalThis.__productNavigation,next)}
  finally {await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;delete globalThis.__productSession}
})

test('authenticated entry hands off to the correct product route without browser identity fields',async()=>{
  const game={slug:'pong',gameId:'chibasko-pong'},calls=[]
  globalThis.__productAuth={user:{id:'A'},session:{},loading:false}
  globalThis.__productMultiplayer={available:true,state:{busy:false,error:''},controller:{connect:async(...args)=>{calls.push(args);return {...game,code:'AB7KQ2'}}}}
  try {
    await mounted(MultiplayerEntry,{game},async()=>{
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Partie privée'))
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Créer une partie'))
      assert.deepEqual(calls[0],[game,undefined]);assert.equal(globalThis.__productNavigation,'/games/pong/lobby/AB7KQ2')
    })
    globalThis.__productAuth={user:null,session:null,loading:false}
    await mounted(MultiplayerEntry,{game,directCode:'AB7KQ2'},async()=>{
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Rejoindre cette partie'))
      assert.equal(calls.length,1)
      const next=new URL(document.querySelector('a[href^="/login?"]').href).searchParams.get('next')
      assert.equal(next,'/games/pong/lobby/AB7KQ2')
    })
  } finally {delete globalThis.__productMultiplayer}
})

test('public branding is Chibasko Games while technical multiplayer identifiers stay unchanged',async()=>{
  for(const file of ['../components/multiplayer/MultiplayerSection.tsx','../app/admin/page.tsx','../app/login/page.tsx','../app/register/page.tsx']){
    const source=await readFile(new URL(file,import.meta.url),'utf8')
    assert.doesNotMatch(source,/sur Chibasko(?! Games)|Multijoueur Chibasko(?! Games)|Game Chibasko(?:<| )|compte ChibaskoGames/)
  }
  const admin=await readFile(new URL('../app/admin/page.tsx',import.meta.url),'utf8')
  assert.match(admin,/multiplayer_chibasko/);assert.match(admin,/Multijoueur Chibasko Games/)
})
