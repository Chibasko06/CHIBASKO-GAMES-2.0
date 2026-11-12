import {test} from 'node:test'
import assert from 'node:assert/strict'
import {catalogueGameLabels,catalogueRuntime} from '../lib/admin-game-catalogue.ts'

const build={active_version_id:'fixture',game_url:null,game_type:'multiplayer_chibasko'}
const manifest=mode=>({integration:{mode},capabilities:{local:{players:{min:1,max:1}}}})

test('les builds classique et SDK solo gardent la même source sans déduire de multijoueur',()=>{
 for(const mode of ['classic','sdk']){
  const labels=catalogueGameLabels({...build,runtime:catalogueRuntime('1.0.0',manifest(mode))})
  assert.equal(labels.hosting,'Chibasko Games (R2)')
  assert.equal(labels.integration,mode==='sdk'?'SDK Chibasko Games':'HTML5 classique')
  assert.equal(labels.multiplayer,'Aucun multijoueur Chibasko Games déclaré')
 }
 assert.equal(catalogueGameLabels(build).integration,'Intégration inconnue')
})

test('le multijoueur déclaré et la disponibilité vérifiée sont distincts',()=>{
 const runtime=catalogueRuntime('1.0.0',{integration:{mode:'sdk'},capabilities:{online:{access:['public','private']}}})
 assert.equal(catalogueGameLabels({...build,runtime}).multiplayer,'Multijoueur déclaré, indisponible')
 runtime.availableOnline.push('private')
 assert.match(catalogueGameLabels({...build,runtime}).multiplayer,/disponible \(privé\)/)
})

test('révision externe et GameMonetize historique restent des intégrations classiques',()=>{
 for(const game of [
  {external_revision_id:'revision',game_url:'https://play.example.com/game'},
  {game_url:'https://html5.gamemonetize.com/game/'},
 ]){
  const labels=catalogueGameLabels(game)
  assert.match(labels.hosting,game.external_revision_id?/révision examinée/:/historique/)
  assert.equal(labels.integration,'HTML5 classique')
  assert.equal(labels.multiplayer,'Sans services multijoueurs Chibasko Games')
 }
})
