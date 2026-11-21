import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {build} from 'esbuild'
import {adminEmailMessage,submissionEmailMessage} from '../lib/emailMessages.ts'
import {brandedEmail} from '../lib/brandedEmail.ts'
import {diagnosticOptions,diagnosticMessage,runDiagnostic} from '../scripts/email-diagnostic-core.mjs'

const builders={adminEmailMessage,submissionEmailMessage}
const env={RESEND_FROM_EMAIL:'noreply@chibaskogames.fr',RESEND_API_KEY:'fixture-secret-only'}
const options=(type='submission',extra=[])=>diagnosticOptions(['--type',type,
 ...(type==='admin'?['--sender','developers']:['--mode','classic']),'--to','recipient@example.test',...extra])

test('one explicit recipient and one type are required; unknown, duplicate and list options fail',()=>{
 for(const args of [
  [],['--type','admin'],['--type','submission','--mode','classic','--to','a@example.test,b@example.test'],
  ['--type','submission','--mode','classic','--to','a@example.test\r\nBcc:b@example.test'],
  ['--type','submission','--mode','classic','--to','a@example.test','--to','b@example.test'],
  ['--type','admin','--sender','other','--to','a@example.test'],
  ['--type','submission','--mode','bad','--to','a@example.test'],
  ['--type','submission','--mode','classic','--to','a@example.test','--send','--send'],
 ])assert.throws(()=>diagnosticOptions(args))
})

test('diagnostics use production builders and identical fictitious editorial text',()=>{
 const admin=diagnosticMessage(options('admin'),builders,env)
 const automatic=diagnosticMessage(options(),builders,env)
 assert.deepEqual(admin,adminEmailMessage('developers','recipient@example.test',automatic.subject,automatic.text))
 assert.equal(automatic.from,'Chibasko Games <noreply@chibaskogames.fr>')
 assert.equal(automatic.reply_to,'createur@example.com')
 assert.match(automatic.html,/Ouvrir la revue/)
 for(const mode of ['classic','sdk','external']){
  const configuration=diagnosticOptions(['--type','submission','--mode',mode,'--to','recipient@example.test'])
  const message=diagnosticMessage(configuration,builders,env)
  assert.match(message.text,mode==='external'?/Révision URL : /:/Version : 1\.0\.0/)
 }
 assert.deepEqual(diagnosticMessage({...options(),mode:'classic'},builders,env),
  diagnosticMessage({...options(),mode:'sdk'},builders,env))
 assert.match(admin.html,/Relations Développeurs/)
 assert.equal(admin.html,brandedEmail({identity:'developers',subject:automatic.subject,text:automatic.text}).html)
})

test('production builder bundle has no DB, network, route or outbox dependency',async()=>{
 const result=await build({entryPoints:['lib/emailMessages.ts'],bundle:true,write:false,metafile:true,platform:'node',format:'esm'})
 assert.deepEqual(Object.keys(result.metafile.inputs).sort(),[
  'lib/adminMail.ts','lib/brandedEmail.ts','lib/emailMessages.ts','lib/siteContacts.ts',
 ])
 assert.doesNotMatch(result.outputFiles[0].text,/supabase|distribution_claim|distribution_prepare|process\.env|fetch\(/i)
})

test('preview, absent confirmation and refusal never access the transport',async()=>{
 const outputRoot=await mkdtemp(join(tmpdir(),'chibasko-email-diagnostic-'))
 try{
  let calls=0,questions=0
  const deps={outputRoot,env,log:()=>{},fetcher:async()=>{calls++;throw Error('transport forbidden')},
   confirm:async()=>{questions++;return 'non'}}
  assert.equal((await runDiagnostic(options(),builders,deps)).outcome,'preview')
  assert.equal(questions,0)
  assert.equal((await runDiagnostic(options('admin',['--send']),builders,deps)).outcome,'cancelled')
  assert.equal(calls,0)
  assert.equal(questions,1)
  for(const directory of await readdir(outputRoot)){
   for(const file of await readdir(join(outputRoot,directory))){
    assert.doesNotMatch(await readFile(join(outputRoot,directory,file),'utf8'),/fixture-secret-only/)
   }
  }
 }finally{await rm(outputRoot,{recursive:true,force:true})}
})

test('one confirmed call uses the exact saved payload, safe provider ID and isolated idempotency key',async()=>{
 const outputRoot=await mkdtemp(join(tmpdir(),'chibasko-email-diagnostic-'))
 try{
  for(const type of ['admin','submission']){
   let calls=0
   const summary=await runDiagnostic(options(type,['--send']),builders,{
    outputRoot,env,log:()=>{},confirm:async()=> 'ENVOYER recipient@example.test',
    fetcher:async(url,init)=>{
     calls++
     assert.equal(url,'https://api.resend.com/emails')
     const saved=await readFile(join(outputRoot,(await readdir(outputRoot)).find(name=>init.headers['Idempotency-Key'].endsWith(name)),'message.json'),'utf8')
     assert.deepEqual(JSON.parse(init.body),JSON.parse(saved))
     assert.equal(init.headers.Authorization,'Bearer '+env.RESEND_API_KEY)
     assert.match(init.headers['Idempotency-Key'],/^(admin-mail|submission-review)\/diagnostic-/)
     return Response.json({id:'provider-fixture'})
    },
   })
   assert.equal(summary.outcome,'accepted')
   assert.equal(summary.resendId,'provider-fixture')
   assert.equal(calls,1)
  }
 }finally{await rm(outputRoot,{recursive:true,force:true})}
})

test('provider failure makes one call, keeps a safe result and never retries',async()=>{
 const outputRoot=await mkdtemp(join(tmpdir(),'chibasko-email-diagnostic-'))
 try{
  let calls=0
  const result=await runDiagnostic(options('admin',['--send']),builders,{env,outputRoot,log:()=>{},
   confirm:async()=> 'ENVOYER recipient@example.test',fetcher:async()=>{calls++;throw Error(env.RESEND_API_KEY)}})
  assert.equal(calls,1)
  assert.equal(result.outcome,'unconfirmed')
  assert.doesNotMatch(await readFile(join(outputRoot,result.diagnosticId,'result.json'),'utf8'),/fixture-secret-only/)
 }finally{await rm(outputRoot,{recursive:true,force:true})}
})

test('missing key and incorrect confirmation cannot send; provider rejection remains an error',async()=>{
 const outputRoot=await mkdtemp(join(tmpdir(),'chibasko-email-diagnostic-'))
 try{
  let calls=0
  const deps={outputRoot,env:{...env,RESEND_API_KEY:undefined},log:()=>{},confirm:async()=> 'ENVOYER recipient@example.test',
   fetcher:async()=>{calls++;return Response.json({message:'private-provider-detail'},{status:429})}}
  await assert.rejects(runDiagnostic(options('admin',['--send']),builders,deps),/RESEND_API_KEY/)
  assert.equal(calls,0)
  const cancelled=await runDiagnostic(options('admin',['--send']),builders,{...deps,env,confirm:async()=> 'ENVOYER autre@example.test'})
  assert.equal(cancelled.outcome,'cancelled')
  assert.equal(calls,0)
  const rejected=await runDiagnostic(options('admin',['--send']),builders,{...deps,env})
  assert.equal(rejected.outcome,'provider_error')
  assert.equal(rejected.httpStatus,429)
  assert.equal(calls,1)
  assert.doesNotMatch(await readFile(join(outputRoot,rejected.diagnosticId,'result.json'),'utf8'),/private-provider-detail/)
 }finally{await rm(outputRoot,{recursive:true,force:true})}
})
