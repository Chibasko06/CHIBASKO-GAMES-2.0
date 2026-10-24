import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {contactRequest} from '../lib/server/contactRequest.ts'
import {readJsonObject} from '../lib/server/inputValidation.ts'
const env={CONTACT_FORM_ENABLED:'1',CONTACT_NOTIFY_EMAIL:'admin@example.test',CONTACT_HASH_SECRET:'fixture-secret-'.repeat(4),RESEND_API_KEY:'fixture-resend-only',RESEND_FROM_EMAIL:'contact@example.test',CHIBASKO_CLOUDFLARE:'1'}
const body=()=>({firstName:'Élodie',lastName:'Test',email:'sender@example.test',message:'Bonjour <script>fixture</script>',website:'',attempt:{id:randomUUID(),createdAt:Date.now()}})
const request=(value,headers={})=>new Request('https://portal.test/api/contact',{method:'POST',headers:{Origin:'https://portal.test','Content-Type':'application/json','cf-connecting-ip':'192.0.2.1',...headers},body:typeof value==='string'?value:JSON.stringify(value)})
function harness(){
 const records=new Map(),calls=[],logs=[],rpc=[];let sender=async()=>Response.json({id:'provider-fixture'}),finishFailure=false
 const db={async call(name,args){rpc.push({name,args});if(name==='contact_reserve'){
  let row=records.get(args.p_id);if(row&&row.hash!==args.p_fingerprint)return {state:'conflict'}
  row??=[...records.values()].find(row=>row.hash===args.p_fingerprint)
  if(row?.accepted)return {state:'accepted'}
  row??={id:args.p_id,hash:args.p_fingerprint};row.lease=randomUUID();records.set(row.id,row);return {state:'send',id:row.id,lease:row.lease}
 }if(finishFailure)throw Error('private SQL fixture');const row=records.get(args.p_id);if(row.lease!==args.p_lease)return false;row.accepted=args.p_accepted;return true}}
 const deps={env,db:()=>db,sendTimeoutMs:10,fetcher:async(url,init)=>{calls.push({url,init});return sender(url,init)},log:entry=>logs.push(entry)}
 return {deps,calls,logs,records,rpc,setSender:value=>sender=value,setFinishFailure:value=>finishFailure=value}
}
test('contact : validation stricte et refus avant tout appel privilégié',async()=>{
 const h=harness()
 for(const value of ['{',null,[],{}, {...body(),unknown:true},{...body(),website:'spam'},{...body(),attempt:null}])assert.equal((await contactRequest(request(value),h.deps)).status,400)
 for(const [field,value] of [['email','a@example.test\r\nBcc:secret'],['firstName','a'.repeat(81)],['lastName',5],['message','a'.repeat(5001)],['message','\0']]){
  const result=await contactRequest(request({...body(),[field]:value}),h.deps);assert.equal(result.status,400);assert.ok((await result.json()).error.fields[field])
 }
 assert.equal((await contactRequest(request('a'.repeat(25_000)),h.deps)).status,413)
 assert.equal((await contactRequest(request(body(),{Origin:'https://evil.test'}),h.deps)).status,403)
 assert.equal((await contactRequest(request(body()),{...h.deps,env:{}})).status,503)
 assert.equal(h.calls.length,0);assert.equal(h.rpc.length,0)
})
test('contact : envoi confirmé, double clic et retry HTTP ne renvoient pas un e-mail',async()=>{
 const h=harness(),value=body()
 assert.equal((await contactRequest(request(value),h.deps)).status,200)
 assert.equal((await contactRequest(request(value),h.deps)).status,200)
 assert.equal((await contactRequest(request({...value,attempt:{...value.attempt,id:randomUUID()}}),h.deps)).status,200)
 assert.equal(h.calls.length,1)
 const outgoing=JSON.parse(h.calls[0].init.body)
 assert.equal(outgoing.reply_to,value.email);assert.equal(outgoing.subject,'Contact Chibasko Games');assert.equal(outgoing.html,undefined)
 assert.ok(h.calls[0].init.headers['Idempotency-Key'].startsWith('contact/'))
 assert.ok(!JSON.stringify(h.rpc).includes(value.email));assert.ok(!JSON.stringify(h.rpc).includes(value.message))
})
test('contact : timeout, succès tardif et reprise utilisent la même clé et le même contenu',async()=>{
 const h=harness(),value=body();let resolve
 h.setSender(()=>new Promise(done=>resolve=done))
 assert.equal((await contactRequest(request(value),h.deps)).status,202)
 resolve(Response.json({id:'late-provider-success'}));await new Promise(done=>setTimeout(done,0))
 assert.equal([...h.records.values()][0].accepted,false)
 h.setSender(async()=>Response.json({id:'late-provider-success'}))
 assert.equal((await contactRequest(request(value),h.deps)).status,200)
 assert.equal(h.calls[0].init.headers['Idempotency-Key'],h.calls[1].init.headers['Idempotency-Key'])
 assert.equal(h.calls[0].init.body,h.calls[1].init.body)
})
test('contact : erreurs fournisseur et base restent privées, aucun faux succès',async()=>{
 const h=harness(),value=body()
 h.setSender(async()=>Response.json({error:'private provider details'},{status:500}))
 const result=await contactRequest(request(value),h.deps);assert.equal(result.status,202)
 assert.ok(!JSON.stringify(await result.json()).includes('private'))
 h.setFinishFailure(true);assert.equal((await contactRequest(request(value),h.deps)).status,503)
 assert.ok(!JSON.stringify(h.logs).includes(value.email));assert.ok(!JSON.stringify(h.logs).includes('private'))
})
test('contact : quota, fenêtre expirée et contenu changé n’appellent pas Resend',async()=>{
 const h=harness(),value=body()
 const quota={...h.deps,db:()=>({call:async()=>({state:'rate_limited'})})}
 const result=await contactRequest(request(value),quota);assert.equal(result.status,429);assert.equal(result.headers.get('Retry-After'),'3600')
 assert.equal((await contactRequest(request({...value,attempt:{...value.attempt,createdAt:Date.now()-24*3600000}}),h.deps)).status,409)
 await contactRequest(request(value),h.deps)
 assert.equal((await contactRequest(request({...value,message:'Autre message'}),h.deps)).status,409)
 assert.equal(h.calls.length,1)
})
test('la lecture d’un corps qui ne se termine jamais est annulée',async()=>{
 let cancelled=false
 const stream=new ReadableStream({cancel(){cancelled=true}})
 const req=new Request('https://portal.test',{method:'POST',headers:{'Content-Type':'application/json'},body:stream,duplex:'half'})
 await assert.rejects(readJsonObject(req,100,5),error=>error.status===408)
 assert.equal(cancelled,true)
})
