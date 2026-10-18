import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Worker} from 'node:worker_threads'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
test('patched source-map-js bounds an indexed mapping far beyond the available source',async()=>{
 const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');
 const {SourceMapConsumer,SourceNode}=require(workerData);
 const map=line=>({version:3,sections:[{offset:{line,column:0},
 map:{version:3,sources:['fixture.js'],sourcesContent:['x'],names:[],mappings:'AAAA'}}]});
 let rejected=false;try{new SourceMapConsumer(map(1000000000))}catch(error){rejected=/Section offset line/.test(error.message)}
 const consumer=new SourceMapConsumer(map(1000000));
 parentPort.postMessage({rejected,length:SourceNode.fromStringWithSourceMap('x',consumer).toString().length});`,{eval:true,workerData:require.resolve('source-map-js')})
 try {
  const result=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('indexed_mapping_unbounded')),3000)
   worker.once('message',value=>{clearTimeout(timer);resolve(value)})
   worker.once('error',error=>{clearTimeout(timer);reject(error)})
  })
  assert.equal(result.rejected,true)
  assert.ok(Number.isSafeInteger(result.length)&&result.length<=2)
 } finally {await worker.terminate()}
})
