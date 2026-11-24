import test from 'node:test'
import assert from 'node:assert/strict'
import {developerEmailRequest} from '../lib/server/developerEmail.ts'
import {generateDeveloperCode,developerCodeHash,developerDestinationHash,developerVerificationMessage,encryptDeveloperEmail,decryptDeveloperEmail} from '../lib/game-distribution/developer-email-code.ts'
import {deliverSubmissionNotifications} from '../lib/game-distribution/submission-notifications.ts'
import {UploadError} from '../lib/game-distribution/uploads/policy.ts'
const actor='ea240000-0000-4000-8000-000000000001',revision='ea240000-0000-4000-8000-000000000002',challenge='ea240000-0000-4000-8000-000000000003',lease='ea240000-0000-4000-8000-000000000004',secret='fixture-only-professional-email-secret-32-bytes'
const binding={actor,revision,challenge},profile={firstName:'Fixture',lastName:'Developer',contactEmail:'professional@example.test',publicName:'Fixture',website:null,otherContact:null},state={verified:false,profileRequired:false,revision,retryAfter:0,challenge:null}
const req=(body,origin='https://portal.test')=>new Request('https://portal.test/api/developer/profile/email',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)})
test('codes are uniform six-digit strings; HMACs are bound to owner, revision and challenge',async()=>{
 for(let i=0;i<100;i++)assert.match(generateDeveloperCode(),/^\d{6}$/)
 const hash=await developerCodeHash(secret,binding,'000001');assert.match(hash,/^[a-f0-9]{64}$/)
 assert.notEqual(hash,await developerCodeHash(secret,{...binding,revision:challenge},'000001'))
 assert.notEqual(hash,await developerCodeHash(secret,{...binding,actor:challenge},'000001'))
 assert.equal(await developerDestinationHash(secret,'Professional@Example.Test'),await developerDestinationHash(secret,'professional@example.test'))
 await assert.rejects(developerCodeHash(undefined,binding,'000001'))
})
test('durable verification payload is authenticated ciphertext, never a plaintext code or email',async()=>{
 const message=developerVerificationMessage(profile.contactEmail,'000001','noreply@chibaskogames.fr'),encrypted=await encryptDeveloperEmail(secret,binding,message)
 assert.deepEqual(Object.keys(encrypted).sort(),['ciphertext','iv','tag','version']);assert.doesNotMatch(JSON.stringify(encrypted),/000001|professional@example|"html"|"text"/)
 assert.deepEqual(await decryptDeveloperEmail(secret,binding,encrypted),message)
 await assert.rejects(decryptDeveloperEmail(secret,{...binding,actor:challenge},encrypted))
 await assert.rejects(decryptDeveloperEmail(secret+'rotated',binding,encrypted))
 await assert.rejects(decryptDeveloperEmail(secret,binding,{...encrypted,tag:'a'.repeat(24)}))
 assert.ok(message.html.includes('000001'));assert.ok(message.text.includes('10 minutes'));assert.deepEqual(message.to,[profile.contactEmail])
})
test('API authenticates, rejects cross-origin/forged fields and queues exactly one owned request',async()=>{
 const calls=[];let notified=0,reserved
 const deps={authenticate:async()=>actor,enabled:()=>true,secret:()=>secret,from:()=> 'noreply@chibaskogames.fr',notify:id=>{assert.equal(id,actor);notified++},db:()=>({call:async(name,args)=>{calls.push([name,args]);assert.equal(args.p_actor,actor);if(name==='distribution_developer_profile')return profile;if(name==='distribution_developer_email_status')return state;if(name==='distribution_reserve_developer_email'){reserved=args;return {...state,challenge:{id:challenge,expiresAt:new Date(Date.now()+600000).toISOString(),attemptsRemaining:5,acceptedByProvider:false}}}throw Error('unexpected_rpc')}})}
 const denied=await developerEmailRequest(req({action:'send',requestId:challenge}),{...deps,authenticate:async()=>{throw new UploadError('unauthorized',401)}});assert.equal(denied.status,401);assert.equal(calls.length,0)
 assert.equal((await developerEmailRequest(req({action:'send',requestId:challenge},'https://other.test'),deps)).status,403)
 for(const body of [{action:'send',requestId:'bad'},{action:'send',requestId:challenge,actor:revision},{action:'confirm',challengeId:challenge,code:'12345'},{action:'confirm',challengeId:challenge,code:'123456',email:'attacker@example.test'}])assert.equal((await developerEmailRequest(req(body),deps)).status,400)
 const response=await developerEmailRequest(req({action:'send',requestId:challenge}),deps);assert.equal(response.status,202);assert.equal(notified,1);assert.match(response.headers.get('Cache-Control'),/no-store/)
 const plain=await decryptDeveloperEmail(secret,binding,reserved.p_message);assert.deepEqual(plain.to,[profile.contactEmail]);assert.doesNotMatch(JSON.stringify(await response.json()),/ciphertext|code_hash|fixture-only/)
 assert.match(reserved.p_code_hash,/^[a-f0-9]{64}$/)
 assert.equal((await developerEmailRequest(req({action:'send',requestId:challenge}),{...deps,enabled:()=>false})).status,503)
})
test('invalid confirmation returns committed attempt outcome and never leaks the hash',async()=>{
 const deps={authenticate:async()=>actor,enabled:()=>true,secret:()=>secret,from:()=> 'noreply@chibaskogames.fr',notify:()=>assert.fail('No send during confirmation'),db:()=>({call:async(name,args)=>{if(name==='distribution_developer_email_status')return state;assert.equal(name,'distribution_confirm_developer_email');assert.equal(args.p_id,challenge);assert.match(args.p_code_hash,/^[a-f0-9]{64}$/);return {verified:false,code:'verification_locked',attemptsRemaining:0}}})}
 const response=await developerEmailRequest(req({action:'confirm',challengeId:challenge,code:'000001'}),deps);assert.equal(response.status,400);assert.equal((await response.json()).error.code,'verification_locked')
})
test('verification uses the same durable lease, prepare, provider key and retry transport even with lifecycle flag off',async()=>{
 const message=developerVerificationMessage(profile.contactEmail,'000001','noreply@chibaskogames.fr'),encrypted=await encryptDeveloperEmail(secret,binding,message),bodies=[],keys=[],calls=[];let done=false,failAck=true
 const db={async call(name,args){calls.push(name);if(name==='distribution_claim_developer_verification')return done?null:{id:challenge,lease,message:encrypted,verification:binding};if(name==='distribution_prepare_submission_email'){assert.deepEqual(args.p_message,encrypted);assert.doesNotMatch(JSON.stringify(args),/000001|professional@example/);return encrypted}if(name==='distribution_finish_submission_email'){if(failAck){failAck=false;throw Error('lost_ack')}done=true;return null}throw Error('unexpected_rpc')}}
 const env={DEVELOPER_EMAIL_VERIFICATION_ENABLED:'1',DEVELOPER_EMAIL_CODE_SECRET:secret,GAME_DEVELOPER_NOTIFICATIONS_ENABLED:'0',GAME_SUBMISSION_NOTIFICATIONS_ENABLED:'0',RESEND_API_KEY:'fixture-only',RESEND_FROM_EMAIL:'noreply@chibaskogames.fr'}
 const options={kind:'verification',actorId:actor,limit:1,log:()=>{},fetcher:async(_u,init)=>{keys.push(init.headers['Idempotency-Key']);bodies.push(JSON.parse(init.body));return Response.json({id:'fixture-accepted'})}}
 await deliverSubmissionNotifications(db,env,options);done=false;await deliverSubmissionNotifications(db,env,options)
 assert.deepEqual(keys,['submission-review/'+challenge,'submission-review/'+challenge]);assert.deepEqual(bodies[0],message);assert.deepEqual(bodies[1],message)
 const before=calls.length;await deliverSubmissionNotifications(db,{...env,DEVELOPER_EMAIL_VERIFICATION_ENABLED:'0'},options);assert.equal(calls.length,before)
})
