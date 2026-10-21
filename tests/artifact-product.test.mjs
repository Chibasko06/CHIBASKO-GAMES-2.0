import test from 'node:test'
import assert from 'node:assert/strict'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import ArtifactGamePlayer from '../components/game-runtime/ArtifactGamePlayer.tsx'
import {getGamesCatalog} from '../lib/queries/games.ts'
import {playerModes} from '../lib/game-runtime/modes.ts'
const render=(capabilities,availableAccess=[])=>renderToStaticMarkup(createElement(ArtifactGamePlayer,{gameId:'00000000-0000-4000-8000-000000000001',versionId:'11111111-1111-4111-8111-111111111111',slug:'arena',capabilities,availableAccess,initialLikes:0,initialDislikes:0}))
test('catalogue exposes modes only for the exact published active version',async()=>{
 const id='00000000-0000-4000-8000-000000000001',version='11111111-1111-4111-8111-111111111111'
 globalThis.__productRows=[{id,slug:'arena',title:'Arena',active_version_id:version,is_published:true,game_type:'multiplayer_chibasko'}]
 globalThis.__productRuntimes=[{game_id:id,version_id:version,capabilities:{online:{access:['private'],players:{min:4,max:12}}}}]
 let [game]=await getGamesCatalog()
 assert.equal(playerModes(game.runtime_capabilities,['private'])[0].available,true)
 globalThis.__productRuntimes[0].version_id='22222222-2222-4222-8222-222222222222'
 ;[game]=await getGamesCatalog()
 assert.equal(game.runtime_capabilities,undefined)
 assert.match(render(game.runtime_capabilities),/Jeu temporairement indisponible/)
 globalThis.__productRuntimes=[];globalThis.__productRows=[]
})
test('single local mode renders the launcher without loading a runtime or account gate',()=>{
 const html=render({local:{players:{min:1,max:1}}})
 assert.match(html,/Écran de lancement/);assert.match(html,/Commandes du lecteur/)
 assert.doesNotMatch(html,/Chargement du jeu|Se connecter|href="[^\"]*\/local/)
})
test('multiple modes are integrated into one player with unavailable modes disabled',()=>{
 const html=render({local:{players:{min:2,max:2}},online:{access:['public','private'],players:{min:2,max:2}}},['public'])
 assert.match(html,/Écran de lancement/)
 assert.equal((html.match(/aria-label="Jeu Chibasko Games"/g)??[]).length,1)
 assert.match(html,/Serveur indisponible/)
 assert.doesNotMatch(html,/href="[^\"]*\/(online|private|local)"/)
})
