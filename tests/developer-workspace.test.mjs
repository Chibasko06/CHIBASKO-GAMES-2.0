import test from 'node:test'
import assert from 'node:assert/strict'
import {developerWorkspaceRequest} from '../lib/server/developerWorkspace.ts'
import {UploadError} from '../lib/game-distribution/uploads/policy.ts'
import {submissionEmailMessage} from '../lib/emailMessages.ts'
import {deliverSubmissionNotifications} from '../lib/game-distribution/submission-notifications.ts'
import {reviewLabel} from '../lib/game-distribution/review.ts'
const actor='a1111111-1111-4111-8111-111111111111',game='b1111111-1111-4111-8111-111111111111'
test('incomplete uploads are not labelled as received or accepted',()=>{
 for(const [technicalStatus,label]of [['created','Envoi créé'],['uploading','Téléversement en cours'],['finalizing','Finalisation de l’envoi'],['unexpected','État indéterminé']])assert.equal(reviewLabel({technicalStatus,decision:'pending',versionStatus:null,reason:null}),label)
})
test('workspace authenticates before reads and forwards only the verified actor',async()=>{
 let called=0
 const deps={authenticate:async()=>actor,db:()=>({call:async(name,args)=>{called++;assert.equal(name,'distribution_developer_workspace');assert.deepEqual(args,{p_actor:actor,p_game:game,p_offset:0});return {games:[]}}})}
 const request=new Request('https://portal.test/api/developer/workspace?gameId='+game+'&actor=forged')
 const ok=await developerWorkspaceRequest(request,deps);assert.equal(ok.status,200);assert.match(ok.headers.get('Cache-Control'),/no-store/);assert.equal(called,1)
 const denied=await developerWorkspaceRequest(request,{...deps,authenticate:async()=>{throw new UploadError('unauthorized',401)}});assert.equal(denied.status,401);assert.equal(called,1)
 const other=await developerWorkspaceRequest(request,{...deps,db:()=>({call:async()=>{throw new UploadError('forbidden',403)}})});assert.equal(other.status,403)
 for(const query of ['gameId=invalid','offset=-1','offset=1.5','offset=100001'])assert.equal((await developerWorkspaceRequest(new Request('https://portal.test/?'+query),deps)).status,400)
 const failure=await developerWorkspaceRequest(request,{...deps,db:()=>{throw Error('private database credentials')}});assert.equal(failure.status,503);assert.doesNotMatch(await failure.text(),/credentials/)
})
const job={id:actor,lease:game,contact:{firstName:'Fixture',lastName:'Test',contactEmail:'creator@example.test'},title:'Jeu <privé>',kind:'update',version:'1.1.0',studio:'Studio',uploadId:game,message:null}
test('developer links reject credential-bearing origins and malformed identifiers',()=>{
 const data={...job,notification:{event:'received',gameId:game,recipient:'creator@example.test',reason:null}}
 for(const site of ['https://username:password@chibaskogames.fr','https://foreign.example.test'])assert.throws(()=>submissionEmailMessage(data,'noreply@chibaskogames.fr','developers@chibaskogames.fr',site),/invalid_site_configuration/)
 for(const gameId of ['-'.repeat(36),[game]])assert.throws(()=>submissionEmailMessage({...data,notification:{...data.notification,gameId}},'noreply@chibaskogames.fr','developers@chibaskogames.fr'),/invalid_notification/)
})
for(const event of ['received','correction','accepted','rejected','published'])test('developer event '+event+' uses a private authenticated link, safe HTML and a human reply address',()=>{
 const message=submissionEmailMessage({...job,notification:{event,gameId:game,recipient:'creator@example.test',reason:'Corriger <script>alert(1)</script>'}},'noreply@chibaskogames.fr','developers@chibaskogames.fr')
 assert.deepEqual(message.to,['creator@example.test']);assert.equal(message.reply_to,'developers@chibaskogames.fr')
 assert.match(message.html,/https:\/\/chibaskogames.fr\/developer\/games\//);assert.doesNotMatch(message.html,/<script>/);assert.match(message.text,/Mise à jour/)
 assert.doesNotMatch(message.html,/access_token|service_role|ticket=/)
 if(event==='accepted')assert.match(message.text,/visibilité publique reste une étape distincte/)
})
test('event stream is opt-in and a lost acknowledgement preserves recipient, payload and key',async()=>{
 const frozen={from:'noreply@chibaskogames.fr',to:['creator@example.test'],subject:'Déjà préparé',text:'Ancien contenu',html:'<p>Conservé</p>'}
 let current={...job,message:frozen},failAck=true;const requests=[]
 const db={call:async(name,args)=>{
  if(name==='distribution_claim_submission_email_events'){const next=current;current=null;return next}
  if(name==='distribution_prepare_submission_email'){assert.deepEqual(args.p_message,frozen);return frozen}
  if(name==='distribution_finish_submission_email'){if(failAck){failAck=false;throw Error('lost ack')}return null}
  assert.fail(name)
 }}
 const options={limit:1,log(){},fetcher:async(url,init)=>{requests.push({body:init.body,key:init.headers['Idempotency-Key']});return Response.json({id:'same-receipt'})}}
 const env={GAME_DEVELOPER_NOTIFICATIONS_ENABLED:'1',RESEND_API_KEY:'fixture-only',RESEND_FROM_EMAIL:'noreply@chibaskogames.fr',GAME_SUBMISSION_NOTIFY_EMAIL:'developers@chibaskogames.fr'}
 assert.equal(await deliverSubmissionNotifications(db,env,options),0)
 current={...job,message:frozen};assert.equal(await deliverSubmissionNotifications(db,env,options),1)
 assert.deepEqual(requests[0],requests[1]);assert.equal(requests.length,2)
 let called=false;await deliverSubmissionNotifications({call:async name=>{assert.equal(name,'distribution_claim_submission_email');called=true;return null}},{...env,GAME_DEVELOPER_NOTIFICATIONS_ENABLED:'0'},options);assert.equal(called,true)
})
