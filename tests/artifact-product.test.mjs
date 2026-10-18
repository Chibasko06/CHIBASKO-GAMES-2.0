import test from 'node:test'
import assert from 'node:assert/strict'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import ArtifactOnlineLinks from '../components/multiplayer/ArtifactOnlineLinks.tsx'
import {getGamesCatalog} from '../lib/queries/games.ts'

test('catalogue exposes modes only for the exact published active version',async()=>{
 const id='00000000-0000-4000-8000-000000000001',version='11111111-1111-4111-8111-111111111111'
 globalThis.__productRows=[{id,slug:'arena',title:'Arena',active_version_id:version,is_published:true,game_type:'multiplayer_chibasko'}]
 globalThis.__productRuntimes=[{game_id:id,version_id:version,capabilities:{online:{access:['private'],players:{min:4,max:12}}}}]
 let [game]=await getGamesCatalog()
 let html=renderToStaticMarkup(createElement(ArtifactOnlineLinks,{slug:game.slug,capabilities:game.runtime_capabilities}))
 assert.match(html,/\/games\/arena\/private/);assert.doesNotMatch(html,/\/arena\/(?:online|local)/)
 globalThis.__productRuntimes[0].version_id='22222222-2222-4222-8222-222222222222'
 ;[game]=await getGamesCatalog()
 html=renderToStaticMarkup(createElement(ArtifactOnlineLinks,{slug:game.slug,capabilities:game.runtime_capabilities}))
 assert.match(html,/indisponible/);assert.doesNotMatch(html,/<a /)
 globalThis.__productRuntimes=[];globalThis.__productRows=[]
})

test('a solo artifact exposes local without lobby, account or online modes',()=>{
 const html=renderToStaticMarkup(createElement(ArtifactOnlineLinks,{slug:'solo',capabilities:{local:{players:{min:1,max:1}}}}))
 assert.match(html,/\/games\/solo\/local/);assert.doesNotMatch(html,/private|\/online|login/)
})
