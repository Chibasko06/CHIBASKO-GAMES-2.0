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
    assert.ok(document.querySelector('a[href="/"] img[alt="Logo ChibaskoGames"]'))
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
  assert.match(await render('pong'),/momentanément indisponible/)
})
test('entry invites guests to authenticate and never creates or joins, including signed-in users',async()=>{
  let calls=0;const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw new Error('Network forbidden')}
  try {
    await mounted(MultiplayerEntry,{},async()=>{
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Jouer en multijoueur'))
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Créer une partie'))
      assert.ok(document.querySelector('a[href="/login"]'));assert.ok(document.querySelector('a[href="/register"]'))
      globalThis.__productAuth={user:{id:'verified'},session:{},loading:false}
      // Fresh mount below verifies the signed-in service-unavailable policy.
    })
    await mounted(MultiplayerEntry,{},async()=>{
      await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Jouer en multijoueur'))
      for(const label of ['Créer une partie','Rejoindre'])assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent===label).disabled)
    })
    assert.equal(calls,0)
  } finally {globalThis.fetch=originalFetch}
})
test('multiplayer route is included in sitemap source; game tracking does not mark preview as played',async()=>{
  assert.match(await readFile(new URL('../app/sitemap.ts',import.meta.url),'utf8'),/absoluteUrl\('\/multiplayer'\)/)
  assert.match(await readFile(new URL('../components/PlaySessionTracker.tsx',import.meta.url),'utf8'),/if \(!recordPlay \|\| !user/)
})
