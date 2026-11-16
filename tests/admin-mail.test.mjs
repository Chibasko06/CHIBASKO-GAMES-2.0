import test from 'node:test'
import assert from 'node:assert/strict'
import {adminMailRequest} from '../lib/server/adminMailRequest.ts'
import {AdminAccessError} from '../lib/server/adminAuthorization.ts'
import {brandedEmail,emailLogo} from '../lib/brandedEmail.ts'

const url='https://portal.example/api/admin/mail'
const input={id:'142d83d5-6e31-4b58-bcc9-9096708e4284',sender:'contact',recipient:'player@example.test',subject:'Bonjour',text:'Bonjour\n\n<script>exemple</script>'}
const post=(body=input,headers={})=>new Request(url,{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json',...headers},body:JSON.stringify(body)})
function fixture(response=()=>Response.json({id:'fixture-provider'})){
 const messages=[],calls=[]
 let status
 const deps={
  actor:async token=>{if(token!=='fixture')throw new AdminAccessError(403);return 'admin'},
  db:()=>({call:async(name,args)=>{
   calls.push({name,args})
   if(name.endsWith('_history'))return [{status}]
   if(name.endsWith('_reserve')){
    if(status)return {reserved:false,status}
    status='pending';return {reserved:true,status}
   }
   status=args.p_status
  }}),
  apiKey:()=> 'fixture-key',
  send:async(_url,options)=>{messages.push(options);return response()},
 }
 return {deps,messages,calls}
}
test('authorization and origin precede privileged reads and writes',async()=>{
 const f=fixture()
 assert.equal((await adminMailRequest(new Request(url),f.deps)).status,401)
 assert.equal((await adminMailRequest(new Request(url,{headers:{Authorization:'Bearer outsider'}}),f.deps)).status,403)
 assert.equal((await adminMailRequest(post(input,{Origin:'https://other.example'}),f.deps)).status,403)
 assert.equal((await adminMailRequest(post(input,{Authorization:'Bearer outsider'}),f.deps)).status,403)
 assert.equal(f.calls.length,0)
 const history=await adminMailRequest(new Request(url,{headers:{Authorization:'Bearer fixture'}}),f.deps)
 assert.match(history.headers.get('cache-control'),/no-store/)
 assert.equal(f.calls[0].args.p_actor,'admin')
})
test('invalid sender, recipients, headers and empty fields do not reserve or send',async()=>{
 const f=fixture()
 for(const invalid of [{sender:'noreply@example.test'},{sender:'constructor'},{recipient:'a@example.test,b@example.test'},{subject:'Hi\r\nBcc: a@example.test'},{subject:''},{text:''},{text:'a\u0000b'}]){
  assert.equal((await adminMailRequest(post({...input,...invalid}),f.deps)).status,400)
 }
 assert.equal(f.calls.length,0)
})
for(const [sender,label] of [['contact','Contact'],['developers','Developers']])test('acceptance, professional reply and duplicate prevention: '+sender,async()=>{
 const f=fixture(),body={...input,sender}
 const results=await Promise.all([adminMailRequest(post(body),f.deps),adminMailRequest(post(body),f.deps)])
 assert.ok((await Promise.all(results.map(result=>result.json()))).some(x=>x.status==='accepted'))
 assert.equal(f.messages.length,1)
 const {body:raw,headers}=f.messages[0],mail=JSON.parse(raw)
 assert.equal(mail.from,'Chibasko Games — '+label+' <'+sender+'@chibaskogames.fr>')
 assert.equal(mail.reply_to,sender+'@chibaskogames.fr')
 assert.deepEqual(mail.to,[input.recipient])
 const preview=brandedEmail({identity:sender,subject:input.subject,text:input.text})
 assert.equal(mail.text,preview.text)
 assert.equal(mail.html,preview.html)
 assert.match(mail.html,/&lt;script&gt;/)
 assert.doesNotMatch(mail.html,/<script>/)
 assert.equal(headers['Idempotency-Key'],'admin-mail/'+input.id)
 assert.equal(JSON.stringify(f.calls).includes(input.text),false)
})
test('shared template preserves French text, line breaks and the three identities',()=>{
 for(const [identity,signature] of [
  ['contact','Équipe Chibasko Games — Contact & Assistance'],
  ['developers','Équipe Chibasko Games — Relations Développeurs'],
  ['noreply','Équipe Chibasko Games'],
 ]){
  const message=brandedEmail({identity,subject:'Réponse <test>',text:'Élodie\nSuite\n\nAutre paragraphe',automatic:identity==='noreply'?'no-reply':undefined})
  assert.ok(message.text.includes(signature))
  assert.ok(message.html.includes(emailLogo))
  assert.match(message.html,/width="48" height="48" alt="Logo Chibasko Games"/)
  assert.match(message.html,/Élodie<br>Suite<\/p><p[^>]+>Autre paragraphe/)
  assert.match(message.html,/Réponse &lt;test&gt;/)
  assert.equal(message.html.includes('Aucune réponse n’est attendue.'),identity==='noreply')
 }
})
for(const [status,response] of [['rejected',()=>Response.json({message:'private'},{status:429})],['unconfirmed',()=>{throw Error('private')}],['unconfirmed',()=>Response.json({}, {status:200})]])test('provider failure recorded as '+status,async()=>{
 const f=fixture(response)
 assert.deepEqual(await (await adminMailRequest(post(),f.deps)).json(),{status})
 assert.deepEqual(await (await adminMailRequest(post(),f.deps)).json(),{status})
 assert.equal(f.messages.length,1)
})
