import test from 'node:test'
import assert from 'node:assert/strict'
import {legacyFramePolicy,gameFramePermissions} from '../lib/game-runtime/iframePolicy.ts'
import {createGameBridge} from '../lib/game-runtime/bridge.ts'
import {runtimeHarness} from './helpers/runtime-harness.mjs'
import {JSDOM} from 'jsdom'
import {randomUUID} from 'node:crypto'

test('les jeux tiers conservent leur stockage mais pas les privilèges du portail',()=>{
 const policy=legacyFramePolicy('https://html5.gamemonetize.com/example/','https://chibaskogames.fr')
 assert.equal(policy.src,'https://html5.gamemonetize.com/example/')
 assert.equal(policy.sandbox,'allow-scripts allow-same-origin allow-pointer-lock')
 assert.equal(policy.referrerPolicy,'no-referrer')
 for(const token of ['allow-popups','allow-downloads','allow-top-navigation','allow-forms'])assert.ok(!policy.sandbox.includes(token))
 for(const name of ['fullscreen','camera','microphone','clipboard-write','geolocation'])assert.ok(policy.allow.includes(`${name} 'none'`))
 assert.equal(policy.allow,gameFramePermissions('https://html5.gamemonetize.com'))
 assert.ok(policy.allow.includes("cross-origin-isolated 'none'"))
 assert.ok(gameFramePermissions('https://isolated.test',true).includes('cross-origin-isolated https://isolated.test'))
})
test('un legacy officiel du même site utilise une origine opaque, y compris les sous-domaines',()=>{
 for(const host of ['chibaskogames.fr','www.chibaskogames.fr','games.chibaskogames.fr']){
  assert.equal(legacyFramePolicy(`https://${host}/game.html`,'https://chibaskogames.fr').sandbox,'allow-scripts allow-pointer-lock')
 }
 assert.ok(legacyFramePolicy('https://other.github.io/game','https://portal.github.io').sandbox.includes('allow-same-origin'))
})
test('les URL dangereuses ou locales ne déclenchent pas de lancement depuis un portail public',()=>{
 for(const url of ['',null,'javascript:alert(1)','data:text/html,hello','blob:https://chibaskogames.fr/id','/game.html','//external.test/game','http://external.test/game','https://user:password@external.test/game','https://127.0.0.1/game','https://[::1]/','https://localhost/','https://192.168.1.1/','https://example.test/\nfoo','https://example.test\\evil'])assert.throws(()=>legacyFramePolicy(url,'https://chibaskogames.fr'),String(url))
 assert.equal(legacyFramePolicy('http://localhost:4000/game','http://localhost:3000').src,'http://localhost:4000/game')
})
test('un message sans fenêtre source active ne peut pas établir un bridge SDK',async()=>{
 const h=await runtimeHarness('solo'),handle=await h.client.create(h.request)
 const dom=new JSDOM('',{url:'https://portal.test'}),phases=[]
 const bridge=createGameBridge({host:dom.window,source:()=>null,descriptor:handle.descriptor,onPhase:p=>phases.push(p),onFailure:()=>assert.fail('message accepté'),onLeave:()=>assert.fail('fermeture acceptée')})
 try{
  dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source:null,origin:handle.descriptor.contentOrigin,data:{channel:'chibasko.game',protocolVersion:2,launchId:handle.descriptor.launchId,generation:handle.descriptor.generation,type:'GAME_HELLO',payload:{documentId:randomUUID()}}}))
  assert.deepEqual(phases,[])
 }finally{bridge.dispose();dom.window.close()}
})
