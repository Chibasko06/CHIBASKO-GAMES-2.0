import {test} from 'node:test'
import assert from 'node:assert/strict'
import {hasAvailableMultiplayer} from '../lib/multiplayer/presentation.ts'

test('un SDK solo, un build classique et les URL historiques ne créent aucun badge',()=>{
  for(const game of [
    {game_type:'multiplayer_chibasko',active_version_id:'v',runtime_capabilities:{local:{players:{min:1,max:1}}}},
    {game_type:'classic',active_version_id:'v'},
    {game_type:'classic',game_url:'https://play.example.com/'},
    {game_type:'classic',game_url:'https://html5.gamemonetize.com/example/'},
  ])assert.equal(hasAvailableMultiplayer(game),false)
})

test('le badge exige une version active et une capacité déclarée réellement disponible',()=>{
  const game={active_version_id:'v',runtime_capabilities:{online:{access:['private'],players:{min:2,max:2}}}}
  assert.equal(hasAvailableMultiplayer(game),false)
  assert.equal(hasAvailableMultiplayer({...game,availableOnline:['public']}),false)
  assert.equal(hasAvailableMultiplayer({...game,availableOnline:['private']}),true)
  assert.equal(hasAvailableMultiplayer({...game,active_version_id:null,availableOnline:['private']}),false)
})
