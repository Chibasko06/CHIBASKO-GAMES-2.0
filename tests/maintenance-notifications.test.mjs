import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {deliverSubmissionNotifications} from '../lib/game-distribution/submission-notifications.ts'
import {accountCleanup} from '../lib/game-distribution/account-cleanup.ts'
import {uploadRepository} from '../lib/game-distribution/uploads/repository.ts'
import {contactRequest} from '../lib/server/contactRequest.ts'
import dispatcher from '../cloudflare/build-dispatcher.ts'
const env={RESEND_API_KEY:'fixture-only',RESEND_FROM_EMAIL:'from@example.test',GAME_SUBMISSION_NOTIFY_EMAIL:'admin@example.test'}
function jobs(){const queue=[0,1].map(()=>({id:randomUUID(),lease:randomUUID(),message:{text:'private fixture',from:env.RESEND_FROM_EMAIL,to:[env.GAME_SUBMISSION_NOTIFY_EMAIL]}})),acks=[];return {queue,acks,db:{async call(name,args){if(name==='distribution_claim_submission_email')return queue.shift()??null;if(name==='distribution_prepare_submission_email')return args.p_message;acks.push({name,args});return null}}}}
test('un échec transitoire ne bloque pas la notification suivante du lot',async()=>{
 const h=jobs();let attempts=0
 assert.equal(await deliverSubmissionNotifications(h.db,env,{limit:2,log(){},fetcher:async()=>++attempts===1?Response.json({}, {status:503}):Response.json({id:'receipt'})}),1)
 assert.equal(attempts,2);assert.deepEqual(h.acks.map(e=>e.args.p_success),[false,true])
})
test('une erreur permanente est mise en attention, un conflit concurrent reste réessayable',async()=>{
 const h=jobs(),logs=[];let count=0
 await deliverSubmissionNotifications(h.db,env,{limit:2,log:e=>logs.push(e),fetcher:async()=>++count===1?Response.json({name:'invalid_idempotent_request',message:'private'},{status:409}):Response.json({name:'concurrent_idempotent_requests'},{status:409})})
 assert.equal(h.acks[0].name,'distribution_reject_submission_email');assert.equal(h.acks[1].args.p_success,false)
 assert.ok(logs.some(e=>e.outcome==='attention_required'));assert.ok(!JSON.stringify(logs).includes('private'))
})
test('un corps de réponse bloqué expire et une réponse tardive ne confirme pas le mail',async()=>{
 const h=jobs();let resolve
 const result=await deliverSubmissionNotifications(h.db,env,{limit:1,operationMs:5,log(){},fetcher:async()=>({ok:true,status:200,json:()=>new Promise(done=>resolve=done)})})
 assert.equal(result,0);resolve({id:'late'});await new Promise(done=>setImmediate(done))
 assert.equal(h.acks.length,1);assert.equal(h.acks[0].args.p_success,false)
})
test('un arrêt de budget interdit un envoi après la préparation tardive',async()=>{
 const h=jobs(),controller=new AbortController();let sends=0
 const db={async call(name,args){const value=await h.db.call(name,args);if(name==='distribution_prepare_submission_email')controller.abort();return value}}
 assert.equal(await deliverSubmissionNotifications(db,env,{limit:2,signal:controller.signal,log(){},fetcher:async()=>{sends++;return Response.json({id:'receipt'})}}),0)
 assert.equal(sends,0);assert.equal(h.acks.length,0)
})
test('le nettoyage R2 interrompu ne supprime pas le prochain objet',async()=>{
 const controller=new AbortController(),owner=randomUUID(),a=`avatars/${owner}/${randomUUID()}.png`,b=`avatars/${owner}/${randomUUID()}.png`,deleted=[]
 const clean=accountCleanup({async call(){return true}},{CHIBASKO_ASSETS:{async list(){return {objects:[{key:a},{key:b}],truncated:false}},async head(){return {customMetadata:{application:'chibasko-games',kind:'avatars',userId:owner}}},async delete(key){deleted.push(key);controller.abort()}}},controller.signal)
 await assert.rejects(clean({id:randomUUID(),lease:randomUUID(),kind:'avatars',key:`avatars/${owner}/`,owner,multipart:null,cursor:null}))
 assert.deepEqual(deleted,[a])
})
test('les RPC contact traversent le vrai wrapper REST sans autoriser des noms arbitraires',async()=>{
 const calls=[],id=randomUUID(),lease=randomUUID(),now=Date.now()
 const db=uploadRepository('https://db.example.test','fixture-key',async(url)=>{const name=new URL(url).pathname.split('/').at(-1);calls.push(name);return Response.json(name==='contact_reserve'?{state:'send',id,lease}:true)})
 const request=new Request('https://portal.test/api/contact',{method:'POST',headers:{Origin:'https://portal.test','Content-Type':'application/json'},body:JSON.stringify({firstName:'Fixture',lastName:'Test',email:'sender@example.test',message:'Message simulé',website:'',attempt:{id,createdAt:now}})})
 const response=await contactRequest(request,{env:{...env,CONTACT_FORM_ENABLED:'1',CONTACT_NOTIFY_EMAIL:'contact@example.test',CONTACT_HASH_SECRET:'x'.repeat(32)},db:()=>db,fetcher:async()=>Response.json({id:'receipt'})})
 assert.equal(response.status,200);assert.deepEqual(calls,['contact_reserve','contact_finish'])
 await assert.rejects(db.call('arbitrary_privileged_function',{}));assert.equal(calls.length,2)
})
test('les arrêts explicites des notifications et du dispatcher ne font aucun appel',async()=>{
 assert.equal(await deliverSubmissionNotifications({call(){assert.fail()}},{...env,GAME_SUBMISSION_NOTIFICATIONS_ENABLED:'0'}),0)
 await dispatcher.scheduled(null,{GAME_BUILD_DISPATCHER_ENABLED:'0'})
})
