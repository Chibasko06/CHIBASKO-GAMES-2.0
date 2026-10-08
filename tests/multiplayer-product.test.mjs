import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createElement, act } from 'react'
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
