import test from 'node:test'
import assert from 'node:assert/strict'
import {POST} from '../app/api/reports/route.ts'
import {deliverModeration} from '../lib/moderationDelivery.ts'
import {runMaintenance} from '../cloudflare/session-maintenance.ts'

test('signalements désactivés : aucune opération privilégiée ni émission',async t=>{
 t.mock.method(globalThis,'fetch',()=>assert.fail('Appel externe'))
 const before=process.env.MODERATION_ENABLED;process.env.MODERATION_ENABLED='0'
 try{const response=await POST(new Request('https://portal.test/api/reports',{method:'POST',headers:{Origin:'https://portal.test','Content-Type':'application/json'},body:'{}'}));assert.equal(response.status,503);assert.match(response.headers.get('cache-control'),/private.*no-store/)}finally{if(before===undefined)delete process.env.MODERATION_ENABLED;else process.env.MODERATION_ENABLED=before}
 assert.equal(await deliverModeration({call:()=>assert.fail('DB')},{MODERATION_MAINTENANCE_ENABLED:'0'}),0)
})
test('validation invitée et origine avant tout appel privilégié',async t=>{
 t.mock.method(globalThis,'fetch',()=>assert.fail('Appel externe'))
 const before=process.env.MODERATION_ENABLED;process.env.MODERATION_ENABLED='1'
 try{
  for(const body of ['{','{}',JSON.stringify({kind:'player',target:'@abc',category:'spam',description:'x'.repeat(5001)})]){
   const response=await POST(new Request('https://portal.test/api/reports',{method:'POST',headers:{Origin:'https://portal.test','Content-Type':'application/json'},body}));assert.equal(response.status,400)
  }
  assert.equal((await POST(new Request('https://portal.test/api/reports',{method:'POST',headers:{Origin:'https://other.test'},body:'{}'}))).status,403)
 }finally{if(before===undefined)delete process.env.MODERATION_ENABLED;else process.env.MODERATION_ENABLED=before}
})
test('une politique de conservation absente interdit la réception avant toute écriture',async t=>{
 const keys=['MODERATION_ENABLED','MODERATION_CLOSED_RETENTION_DAYS','CONTACT_HASH_SECRET','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY'],previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]))
 Object.assign(process.env,{MODERATION_ENABLED:'1',MODERATION_CLOSED_RETENTION_DAYS:'',CONTACT_HASH_SECRET:'fixture-policy-'.repeat(4),NEXT_PUBLIC_SUPABASE_URL:'https://moderation.test',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-public'})
 t.mock.method(globalThis,'fetch',async input=>{assert.equal(new URL(String(input)).pathname,'/auth/v1/user');return Response.json({id:'fa600000-0000-4000-8000-000000000001'})})
 try{
  const response=await POST(new Request('https://portal.test/api/reports',{method:'POST',headers:{Origin:'https://portal.test',Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({operationId:'fa600000-0000-4000-8000-000000000003',kind:'player',target:'fa600000-0000-4000-8000-000000000002',category:'spam',description:'Description factuelle suffisamment precise.',contactName:'',contactEmail:'',goodFaith:false,sensitiveException:false,website:'',botToken:''})}))
  assert.equal(response.status,503);assert.match((await response.json()).error,/conservation/)
 }finally{for(const key of keys)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key]}
})
function fixture(){
 const calls=[],logs=[],job={id:'fa600000-0000-4000-8000-000000000001',lease:'fa600000-0000-4000-8000-000000000002',kind:'admin',message:null,case:{id:'fa600000-0000-4000-8000-000000000003',number:42,target_kind:'player',category:'spam',contact_email:'private@example.test'},decision:null}
 let claim=true,sender=async()=>Response.json({id:'mail-fixture'}),state='pending'
 const db={async call(name,args){calls.push({name,args});if(name==='distribution_moderation_claim_mail'){if(!claim)return null;claim=false;return structuredClone(job)}if(name==='distribution_moderation_prepare_mail'){job.message??=args.p_message;return job.message}if(name==='distribution_moderation_finish_mail'){state=args.p_success?'sent':args.p_permanent?'attention_required':'pending';return null}throw Error('unexpected') }}
 const env={MODERATION_MAINTENANCE_ENABLED:'1',RESEND_API_KEY:'fixture-key',RESEND_FROM_EMAIL:'noreply@example.test',GAME_SUBMISSION_NOTIFY_EMAIL:'admin@example.test',MODERATION_APPEAL_EMAIL:'appeal@example.test',NEXT_PUBLIC_SITE_URL:'https://portal.test'}
 const sent=[],options={log:event=>logs.push(event),fetcher:async(url,init)=>{assert.equal(url,'https://api.resend.com/emails');sent.push(init);return sender(url,init)}}
 return {db,env,options,job,calls,logs,sent,state:()=>state,retry(){claim=true},sender(value){sender=value}}
}
test('Resend indisponible : dossier et message inchangés, reprise avec la même clé',async()=>{
 const x=fixture();x.sender(async()=>{throw Error('private credentials')})
 assert.equal(await deliverModeration(x.db,x.env,x.options),0);assert.equal(x.state(),'pending')
 x.retry();x.sender(async()=>Response.json({id:'fixture'}));assert.equal(await deliverModeration(x.db,x.env,x.options),1)
 assert.equal(x.state(),'sent');assert.equal(x.sent[0].headers['Idempotency-Key'],x.sent[1].headers['Idempotency-Key']);assert.equal(x.sent[0].body,x.sent[1].body)
 assert.doesNotMatch(JSON.stringify(x.logs),/private|credentials|example.test/)
 assert.doesNotMatch(x.sent[0].body,/private@example/)
})
test('erreur permanente : attention requise ; coordonnées manquantes : aucun envoi',async()=>{
 const x=fixture();x.sender(async()=>Response.json({name:'invalid_api_key'},{status:401}));await deliverModeration(x.db,x.env,x.options);assert.equal(x.state(),'attention_required')
 const y=fixture();y.job.kind='decision';y.job.case.contact_email=null;assert.equal(await deliverModeration(y.db,y.env,y.options),0);assert.equal(y.sent.length,0)
})
test('maintenance de modération désactivée puis activée avec configuration invalide',async()=>{
 const calls=[]
 await runMaintenance({CONTACT_RECEIPTS_MAINTENANCE_ENABLED:'1'},{db:{async call(name){calls.push(name);return 0}},log(){}})
 assert.equal(calls.some(name=>name.startsWith('distribution_moderation_')),false)
 await assert.rejects(runMaintenance({MODERATION_MAINTENANCE_ENABLED:'1'},{db:{async call(name){calls.push(name);return 0}},log(){}}),/maintenance_cycle_failed/)
 assert.ok(calls.includes('distribution_moderation_cleanup'))
})


test('e-mail HTML de marque : motif français, lien privé et échappement du contenu',async()=>{
 const x=fixture();await deliverModeration(x.db,x.env,x.options);const message=JSON.parse(x.sent[0].body)
 assert.match(message.html,/Chibasko/);assert.match(message.html,/chibaskogames-logo.png/);assert.match(message.html,/Examiner le dossier/);assert.match(message.text,/Type : Joueur/);assert.match(message.text,/Motif : Spam/)
 const y=fixture();y.job.kind='decision';y.job.case.contact_email='guest@example.test';y.job.decision='<img src=x onerror=alert(1)> & motif';await deliverModeration(y.db,y.env,y.options)
 const decision=JSON.parse(y.sent[0].body);assert.match(decision.html,/&lt;img/);assert.doesNotMatch(decision.html,/<img src=x/);assert.match(decision.text,/<img src=x/)
})
test('envoi accepté mais confirmation SQL indisponible : reprise identique sans nouvel événement',async()=>{
 const x=fixture(),original=x.db.call;let unavailable=true
 x.db.call=async(name,args)=>{if(name==='distribution_moderation_finish_mail'&&unavailable)throw Error('fixture-ack-unavailable');return original(name,args)}
 assert.equal(await deliverModeration(x.db,x.env,x.options),0);assert.equal(x.state(),'pending')
 unavailable=false;x.retry();assert.equal(await deliverModeration(x.db,x.env,x.options),1);assert.equal(x.state(),'sent')
 assert.equal(x.sent[0].body,x.sent[1].body);assert.equal(x.sent[0].headers['Idempotency-Key'],x.sent[1].headers['Idempotency-Key'])
})
