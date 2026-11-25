import test from 'node:test'
import assert from 'node:assert/strict'
import {playerSizing,LEGACY_VIEWPORT} from '../lib/game-runtime/playerSizing.ts'
import {playerControlCorner} from '../lib/game-runtime/playerControls.ts'
test('sizing is explicit, preserves fixed compatibility and rejects invalid dimensions',()=>{
 assert.deepEqual(playerSizing(undefined),{mode:'responsive'})
 assert.deepEqual(playerSizing(undefined,LEGACY_VIEWPORT),{mode:'fixed',viewport:{width:1280,height:720}})
 assert.deepEqual(playerSizing({mode:'responsive'},LEGACY_VIEWPORT),{mode:'responsive'})
 assert.deepEqual(playerSizing({mode:'fixed',viewport:{width:405,height:720}}),{mode:'fixed',viewport:{width:405,height:720}})
 for(const value of [0,-1,NaN,Infinity])assert.deepEqual(playerSizing({mode:'fixed',viewport:{width:value,height:720}},LEGACY_VIEWPORT),{mode:'fixed',viewport:LEGACY_VIEWPORT})
})
test('controls prefer known letterbox margins without pretending to inspect the game HUD',()=>{
 const surface={left:0,top:0,right:800,bottom:400}
 assert.equal(playerControlCorner(surface,{left:200,top:0,right:600,bottom:400}),'top-left')
 assert.equal(playerControlCorner(surface,{left:0,top:0,right:600,bottom:400}),'top-right')
 assert.equal(playerControlCorner(surface,{left:0,top:0,right:800,bottom:250}),'bottom-left')
 assert.equal(playerControlCorner(surface,surface),'top-left')
})
