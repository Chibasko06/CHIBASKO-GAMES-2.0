import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
import {randomUUID} from 'node:crypto'
import {validateManifest} from '../lib/game-distribution/manifest.ts'
import {integrationLabel,effectiveIntegration} from '../lib/game-distribution/integration.ts'
import {integrationScanner} from '../services/build-validator/integration-scan.ts'
import {runtimeHarness} from './helpers/runtime-harness.mjs'
import {mountGameRuntime} from '../lib/game-runtime/controller.ts'
import {createGameBridge} from '../lib/game-runtime/bridge.ts'
const original=JSON.parse(await readFile(new URL('./fixtures/game-builds/solo/chibasko.json',import.meta.url),'utf8'))
const target={gameId:original.gameId,version:original.version}

test('manifeste classique sans SDK, SDK explicite et anciens contrats restent distincts',()=>{
 assert.equal(effectiveIntegration(validateManifest(original,target)),'sdk')
 assert.equal(effectiveIntegration(validateManifest({...original,integration:{mode:'classic'}},target)),'classic')
 assert.equal(effectiveIntegration(validateManifest({...original,integration:{mode:'sdk',sdkVersion:'0.4.2'}},target)),'sdk')
 for(const integration of [{mode:'arbitrary'},{mode:'classic',sdkVersion:'0.4.2'}])assert.throws(()=>validateManifest({...original,integration},target))
 assert.throws(()=>validateManifest({...original,integration:{mode:'classic'},capabilities:{...original.capabilities,online:{access:['public'],players:{min:1,max:2}}},client:{entrypoints:{...original.client.entrypoints,online:'online.html'}}},target))
 assert.throws(()=>validateManifest({gameId:original.gameId},target),error=>error.diagnosticLocation.field==='/schemaVersion')
})

test('les indices textuels ne sont ni une initialisation ni une preuve d’absence ou de version',()=>{
 const scan=integrationScanner(),feed=scan.file('game.js');feed(new TextEncoder().encode('// @chibaskogames/'));feed(new TextEncoder().encode('sdk 0.4.2'))
 assert.equal(scan.result().signals,true)
 assert.match(integrationLabel({declaredMode:'sdk',declaredVersion:'0.4.2',scan:scan.result(),observation:null}),/Indéterminée/)
 assert.match(integrationLabel({observation:{mode:'sdk',protocol:2}}),/version indéterminée/)
 const hidden=integrationScanner();hidden.file('game.wasm')(new Uint8Array([1,2,3]));assert.equal(hidden.result().signals,false)
 const large=integrationScanner();large.file('large.js')(new Uint8Array(2*1024**2));assert.equal(large.result().complete,false)
})

test('le lecteur classique ne demande aucun message SDK et conserve sandbox, durée et sortie',async t=>{
 const h=await runtimeHarness(),handle=await h.client.create(h.request)
 handle.descriptor.integrationMode='classic'
 const dom=new JSDOM('<div id="game"></div>',{url:'https://portal.test',pretendToBeVisual:true}),states=[],observed=[]
 const runtime=mountGameRuntime({container:dom.window.document.getElementById('game'),request:h.request,client:{...h.client,create:async()=>handle},onState:s=>states.push(s),onIntegration:o=>observed.push(o),onLeave(){}})
 t.after(()=>{runtime.dispose();dom.window.close()})
 for(let i=0;i<50&&!dom.window.document.querySelector('iframe');i++)await new Promise(r=>setImmediate(r))
 const frame=dom.window.document.querySelector('iframe');assert.ok(frame);assert.match(frame.getAttribute('sandbox'),/allow-scripts/)
 frame.dispatchEvent(new dom.window.Event('load'))
 assert.equal(states.at(-1).phase,'running');assert.equal(observed.length,1);assert.equal(observed[0].mode,'classic');assert.equal(observed[0].protocol,null)
 frame.dispatchEvent(new dom.window.Event('load'));assert.equal(states.at(-1).error,'unexpected_navigation')
})

test('seul le dialogue lié à la bonne iframe, origine et génération produit une observation SDK',async t=>{
 const h=await runtimeHarness(),{descriptor}=await h.client.create(h.request),dom=new JSDOM('',{url:'https://portal.test',pretendToBeVisual:true}),observed=[]
 const source={postMessage(){}},doc=randomUUID(),bridge=createGameBridge({host:dom.window,source:()=>source,descriptor,onPhase(){},onFailure(){},onLeave(){},onReady:p=>observed.push(p)})
 t.after(()=>{bridge.dispose();dom.window.close()})
 const message=type=>({channel:'chibasko.game',protocolVersion:2,launchId:descriptor.launchId,generation:descriptor.generation,type,payload:{documentId:doc}})
 const emit=(data,origin=descriptor.contentOrigin,src=source)=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data,origin,source:src}))
 emit(message('GAME_READY'));emit(message('GAME_HELLO'),'https://attacker.test');emit(message('GAME_HELLO'),descriptor.contentOrigin,{});emit({...message('GAME_HELLO'),generation:randomUUID()})
 assert.deepEqual(observed,[])
 emit(message('GAME_HELLO'));assert.deepEqual(observed,[],'Un SDK présent mais pas prêt n’est pas confirmé')
 emit(message('GAME_READY'));emit(message('GAME_READY'));assert.deepEqual(observed,[2])
})
