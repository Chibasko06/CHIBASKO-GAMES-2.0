import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {developerProfileRequest} from '../lib/server/developerProfile.ts'
import {developerContact} from '../lib/game-distribution/developer-profile.ts'
import {developerSubmissionRequest} from '../lib/server/developerSubmissions.ts'
import {deliverSubmissionNotifications} from '../lib/game-distribution/submission-notifications.ts'
import {UploadError} from '../lib/game-distribution/uploads/policy.ts'
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const profile={firstName:'PrivateFirst',lastName:'PrivateLast',contactEmail:'private-contact@example.test',publicName:'Studio',website:null,otherContact:null}
const request=(method='GET',body)=>new Request('https://site.example/api/developer/profile',{method,headers:{Origin:'https://site.example','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
test('profile is account scoped, persisted, editable and whitelisted',async()=>{
 let stored=null;const calls=[];const deps={authenticate:async()=>id,db:()=>({call:async(name,args)=>{calls.push(args);assert.equal(name,'distribution_developer_profile');assert.equal(args.p_actor,id);if(args.p_profile)stored=args.p_profile;return stored}})}
 assert.deepEqual(await (await developerProfileRequest(request(),deps)).json(),{data:null})
 assert.equal((await developerProfileRequest(request('PUT',profile),deps)).status,200)
 assert.deepEqual((await (await developerProfileRequest(request(),deps)).json()).data,profile)
 const edited={...profile,firstName:'Edited'};await developerProfileRequest(request('PUT',edited),deps);assert.equal(stored.firstName,'Edited')
 assert.equal((await developerProfileRequest(request('PUT',{...profile,user_id:other}),deps)).status,400)
 assert.equal(developerContact({...profile,contactEmail:'bad'}),null)
 const denied={...deps,authenticate:async()=>{throw new UploadError('unauthorized',401)}};assert.equal((await developerProfileRequest(request(),denied)).status,401)
 assert.ok(calls.every(args=>args.p_actor===id));assert.doesNotMatch(JSON.stringify(await (await developerProfileRequest(request(),deps)).json()),/user_id|service_role|lease|staging/)
})
test('registration does not notify; committed submission survives notification scheduling failure',async()=>{
 let notices=0;const deps={authenticate:async()=>id,enabled:()=>true,db:()=>({call:async()=>id}),notify(){notices++;throw Error('fixture failure')}}
 const register=new Request('https://site.example/api/developer/games',{method:'POST',headers:{'Idempotency-Key':id,'Content-Type':'application/json'},body:JSON.stringify({title:'Draft'})})
 assert.equal((await developerSubmissionRequest(register,'games',deps)).status,201);assert.equal(notices,0)
 const submit=()=>new Request('https://site.example/api/developer/submissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uploadId:id,kind:'update',metadata:{},ownership:true})})
 assert.equal((await developerSubmissionRequest(submit(),'submissions',deps)).status,201);assert.equal(notices,1)
})
function outbox(){
 let sent=false,message=null,leased=false,ackFail=false;const job={id,lease:other,message:null,contact:profile,title:'Game',version:'1.0.0',kind:'new',uploadId:other,studio:'Studio'}
 return {ackFail(){ackFail=true},db:{async call(name,args){
  if(name==='distribution_claim_submission_email'){if(sent||leased)return null;leased=true;return {...job,message}}
  if(name==='distribution_prepare_submission_email'){message??=args.p_message;return message}
  if(name==='distribution_finish_submission_email'){if(args.p_success&&ackFail){ackFail=false;throw Error('fixture database error')}sent=args.p_success;leased=false;return}
  throw Error('Unexpected RPC')
 }}}
}
const env={RESEND_API_KEY:'fixture-resend',RESEND_FROM_EMAIL:'Chibasko Games <from@example.test>',GAME_SUBMISSION_NOTIFY_EMAIL:'admin@example.test'}

test('missing recipient leaves development submissions pending without claiming or exposing configuration',async()=>{
 const logs=[];let claims=0
 assert.equal(await deliverSubmissionNotifications({call:async()=>{claims++}}, {...env,GAME_SUBMISSION_NOTIFY_EMAIL:undefined},{log:e=>logs.push(e)}),0)
 assert.equal(claims,0);assert.equal(logs[0].outcome,'configuration_missing')
 assert.doesNotMatch(JSON.stringify(logs),/fixture-resend|admin@example/)
})

test('installed OpenNext and Next retain after callbacks through Cloudflare waitUntil',async()=>{
 const read=path=>readFile(new URL('../node_modules/'+path,import.meta.url),'utf8')
 const wrapper=await read('@opennextjs/aws/dist/overrides/wrappers/cloudflare-node.js')
 const context=await read('@opennextjs/aws/dist/utils/promise.js')
 const handler=await read('@opennextjs/aws/dist/core/requestHandler.js')
 const after=await read('next/dist/server/after/after-context.js')
 assert.match(wrapper,/waitUntil: ctx\.waitUntil\.bind\(ctx\)/)
 assert.match(handler,/waitUntil: options\?\.waitUntil/)
 assert.match(context,/@next\/request-context/);assert.match(context,/waitUntil: store\?\.waitUntil/)
 assert.match(after,/this\.waitUntil\(this\.runCallbacksOnClosePromise\)/)
})
test('Resend failure retains a durable pending item; retry and lost acknowledgement do not duplicate delivery',async()=>{
 const box=outbox(),logs=[],receipts=new Map();let requests=0,delivered=0,fail=true
 const fetcher=async(url,init)=>{requests++;assert.equal(url,'https://api.resend.com/emails');assert.equal(init.headers.Authorization,'Bearer '+env.RESEND_API_KEY);assert.equal(init.headers['Idempotency-Key'],'submission-review/'+id)
  if(fail){fail=false;return Response.json({error:'fixture secret details'},{status:500})}
  const key=init.headers['Idempotency-Key'];if(!receipts.has(key)){receipts.set(key,init.body);delivered++}else assert.equal(receipts.get(key),init.body)
  return Response.json({id:'fixture-email'})
 }
 const opts={fetcher,log:e=>logs.push(e)}
 assert.equal(await deliverSubmissionNotifications(box.db,env,opts),0);box.ackFail()
 assert.equal(await deliverSubmissionNotifications(box.db,env,opts),0)
 assert.equal(await deliverSubmissionNotifications(box.db,{...env,RESEND_FROM_EMAIL:'changed@example.test'},opts),1)
 assert.equal(await deliverSubmissionNotifications(box.db,env,opts),0);assert.equal(delivered,1);assert.equal(requests,3)
 assert.doesNotMatch(JSON.stringify(logs),/PrivateFirst|private-contact|fixture-resend|fixture secret/)
})
