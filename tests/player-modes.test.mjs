import test from 'node:test'
import assert from 'node:assert/strict'
import {playerModes} from '../lib/game-runtime/modes.ts'
const capabilities={local:{players:{min:2,max:2}},online:{access:['public','private'],players:{min:2,max:2}}}
test('mode list never invents unsupported modes or a default selection',()=>{
 assert.deepEqual(playerModes(undefined,['public']),[])
 assert.deepEqual(playerModes({online:capabilities.online},['private']).map(({id,available})=>({id,available})),[{id:'public',available:false},{id:'private',available:true}])
})

test('declared capabilities and operational availability remain separate in the selector',()=>{
 const modes=playerModes(capabilities,[])
 assert.deepEqual(modes.map(({id,available})=>({id,available})),[{id:'local',available:true},{id:'public',available:false},{id:'private',available:false}])
 assert.ok(modes.filter(mode=>mode.id!=='local').every(mode=>mode.description==='Serveur indisponible'))
 assert.deepEqual(playerModes({local:capabilities.local},['public']).map(mode=>mode.id),['local'])
})
