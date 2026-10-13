import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createElement, act, useEffect } from 'react'
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
import { useChibaskoGame } from '../games/sdk/client/index.ts'

test('client registry loads Pong on demand and contains only component loaders', async () => {
  assert.deepEqual(Object.keys(clientGameRegistry), ['chibasko-pong'])
  assert.equal(Object.hasOwn(clientGameRegistry,'unknown'),false)
  assert.equal(typeof clientGameRegistry['chibasko-pong'],'function')
  const loaded = await clientGameRegistry['chibasko-pong']()
  assert.deepEqual(Object.keys(loaded).sort(), ['default','gameId'])
  assert.equal(loaded.gameId,'chibasko-pong'); assert.equal(typeof loaded.default,'function')
})

test('real lazy Pong module renders public state, sends its own input and observes revisions', async () => {
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:3000/lobby-playground'})
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
  const noop=()=>{};dom.window.HTMLCanvasElement.prototype.getContext=()=>({fillRect:noop,setLineDash:noop,beginPath:noop,moveTo:noop,lineTo:noop,stroke:noop,arc:noop,fill:noop,fillText:noop})
  const state={phase:'PLAYING',remainingMs:0,width:1000,height:600,paddleWidth:16,paddleHeight:100,inset:30,radius:10,leftPaddleY:250,rightPaddleY:250,ballX:500,ballY:300,leftScore:0,rightScore:0,players:new Map([['local',{username:'Alice',side:'LEFT'}],['remote',{username:'Bob',side:'RIGHT'}]])}
  const sent=[];const owned=createGameClientConnection({localPlayerId:'local',getState:()=>state,send:(...args)=>sent.push(args)})
  const Runtime=createGameRuntime(clientGameRegistry),root=createRoot(document.getElementById('root'))
  try {
    await act(async()=>root.render(createElement(Runtime,{gameId:'chibasko-pong',connection:owned.connection})))
    const canvas=document.querySelector('canvas');assert.ok(canvas)
    await act(async()=>canvas.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true})))
    assert.deepEqual(sent[0],['set_input',{direction:-1}])
    await act(async()=>{state.leftScore=2;owned.changed()})
    assert.match(document.body.textContent,/Alice · 2/)
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
  assert.deepEqual(Object.keys(owned.connection).sort(),['getRevision','getState','localPlayerId','send','subscribe'])
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
    assert.deepEqual(Object.keys(observed).sort(),['localPlayerId','revision','send','state','subscribe'])
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
  for (const path of ['components/multiplayer/LobbyExperience.tsx','components/multiplayer/MultiplayerProvider.tsx','lib/multiplayer/productSession.ts','lib/lobbyGameSession.ts','components/multiplayer/GameRuntime.tsx','game-server/src/index.ts','game-server/src/rooms/LobbyRoom.ts','game-server/src/platform/multiplayer/GameSessionCoordinator.ts']) {
    const source=await readFile(new URL(`../${path}`,import.meta.url),'utf8')
    assert.doesNotMatch(source,/chibasko-pong|PongCanvas|PongRoom|pongView|set_input|direction/)
  }
  const registry=await readFile(new URL('../games/clientRegistry.ts',import.meta.url),'utf8')
  assert.match(registry,/\(\) => import\('\.\/chibasko-pong\/client\/PongGame'\)/)
  assert.doesNotMatch(registry,/roomType|SUPABASE|https?:\/\/|minPlayers|secret/)
  for(const path of ['games/sdk/client/index.ts','games/sdk/client/types.ts','game-server/src/games/sdk/index.ts','game-server/src/games/sdk/types.ts','game-server/src/platform/multiplayer/internalGameSdk.ts']) {
    assert.doesNotMatch(await readFile(new URL(`../${path}`,import.meta.url),'utf8'),/Pong|chibasko-pong|set_input|direction/)
  }
  for(const path of ['games/chibasko-pong/client/PongGame.tsx','game-server/src/games/chibasko-pong/PongRoom.ts','game-server/src/games/chibasko-pong/register.ts']) {
    const source=await readFile(new URL(`../${path}`,import.meta.url),'utf8')
    assert.match(source,/sdk\/|sdk\/client/)
    assert.doesNotMatch(source,/GameSessionCoordinator|GameAdmission|MultiplayerProvider|AuthProvider|expiresAt/)
  }
})

test('technical Pong renders responsive logical canvas; results expose only public names/scores', () => {
  const view = { phase:'COUNTDOWN', remainingMs:3000,width:1000,height:600,paddleWidth:16,paddleHeight:100,inset:30,radius:10,leftPaddleY:250,rightPaddleY:250,ballX:500,ballY:300,leftScore:0,rightScore:0,leftName:'Alice',rightName:'Bob',selfSide:'LEFT' }
  const canvas = renderToStaticMarkup(createElement(PongCanvas,{view,onInput(){}}))
  assert.match(canvas,/width="1000"/); assert.match(canvas,/height="600"/); assert.match(canvas,/w-full/); assert.match(canvas,/tabindex="0"/)
  assert.match(canvas,/Alice/); assert.match(canvas,/Bob/); assert.doesNotMatch(canvas,/userId|sessionId|JWT/)
  const result = renderToStaticMarkup(createElement(LobbyView,{title:'Test local',state:{error:'',lobby:{slug:'test',gameId:'chibasko-pong',code:'AB7KQ2',status:'RESULTS',minPlayers:2,maxPlayers:2,players:[{username:'Alice',avatarUrl:'',ready:true,self:true,host:true}],result:{winner:'Alice',reason:'forfeit',players:[{username:'Alice',score:3},{username:'Bob',score:1}]}},game:{connected:true,count:2,expected:2,status:'READY'}},onReady(){},onStart(){},onLeave(){},onReturn(){}}))
  assert.match(result,/Partie terminée/); assert.match(result,/Alice gagne/); assert.match(result,/3 – 1/); assert.match(result,/Victoire par abandon/); assert.match(result,/Retour à la salle d’attente/)
})

test('Pong keyboard sends direction changes only; blur and unmount clear input/listeners', async () => {
  const dom = new JSDOM('<div id="root"></div>', {url:'http://localhost:3000/lobby-playground'})
  globalThis.window=dom.window; globalThis.document=dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT=true
  const noop=()=>{}; const calls=[]
  dom.window.HTMLCanvasElement.prototype.getContext=()=>({fillRect:noop,setLineDash:noop,beginPath:noop,moveTo:noop,lineTo:noop,stroke:noop,arc:noop,fill:noop,fillText:noop})
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
  const b=await render('pong');assert.doesNotMatch(b,/<iframe/);assert.match(b,/2 joueurs/);assert.match(b,/Bêta/);assert.match(b,/Jouer en multijoueur/)
  for(const content of [a,b]){assert.match(content,/Favoris/);assert.match(content,/data-testid="reviews"/);assert.match(content,/👍/)}
  globalThis.__productRows=[{...multi,multiplayer_game_id:'unknown'}]
  assert.match(await render('pong'),/temporairement indisponible/)
})
test('entry invites guests before any network request; absent service disables authenticated actions',async()=>{
  let calls=0;const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw new Error('Network forbidden')}
  try {
    await mounted(MultiplayerEntry,{game:{slug:'pong',gameId:'chibasko-pong'}},async()=>{
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Jouer en multijoueur'))
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Créer une partie'))
      assert.ok(document.querySelector('a[href^="/login?next="]'));assert.ok(document.querySelector('a[href^="/register?next="]'))
      globalThis.__productAuth={user:{id:'verified'},session:{},loading:false}
      // Fresh mount below verifies the signed-in service-unavailable policy.
    })
    globalThis.__productMultiplayer={available:false,state:{busy:false,error:''},controller:{}}
    await mounted(MultiplayerEntry,{game:{slug:'pong',gameId:'chibasko-pong'}},async()=>{
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Jouer en multijoueur'))
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
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Jouer en multijoueur'))
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
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Jouer en multijoueur'))
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
