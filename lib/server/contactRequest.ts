import 'server-only'
import {createHmac,randomUUID} from 'node:crypto'
import {isIP} from 'node:net'
import {CONTACT_LIMITS,CONTACT_WINDOW_MS,contactErrors,type ContactMessage} from '../contact'
import {readJsonObject,InputError,isEmail} from './inputValidation'
import {withTimeout} from '../asyncOperation'
import type {UploadRepository} from '../game-distribution/uploads/contracts'

type Environment={CONTACT_FORM_ENABLED?:string;CONTACT_NOTIFY_EMAIL?:string;CONTACT_HASH_SECRET?:string;RESEND_API_KEY?:string;RESEND_FROM_EMAIL?:string;CHIBASKO_CLOUDFLARE?:string}
type Dependencies={env:Environment;db:()=>UploadRepository;fetcher?:typeof fetch;now?:()=>number;sendTimeoutMs?:number;log?:(entry:{event:string;requestId:string;code:string})=>void}
const response=(status:number,body:object)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(status===429?{'Retry-After':'3600'}:status===202?{'Retry-After':'30'}:{})}})
export async function contactRequest(request:Request,deps:Dependencies){
 const requestId=randomUUID(),{env}=deps
 const log=(code:string)=>{try{deps.log?.({event:'contact_delivery',requestId,code})}catch{}}
 try{
  const origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site')
  if(origin!==new URL(request.url).origin||(site&&site!=='same-origin'))return response(403,{error:{code:'forbidden'}})
  if(env.CONTACT_FORM_ENABLED!=='1'||!env.CONTACT_HASH_SECRET||env.CONTACT_HASH_SECRET.length<32||!env.RESEND_API_KEY
   ||!env.RESEND_FROM_EMAIL||!isEmail(env.RESEND_FROM_EMAIL)||!env.CONTACT_NOTIFY_EMAIL||!isEmail(env.CONTACT_NOTIFY_EMAIL))return response(503,{error:{code:'contact_unavailable'}})
  const body=await readJsonObject(request,24_576,5000)
  if(Object.keys(body).some(key=>![...Object.keys(CONTACT_LIMITS),'attempt','website'].includes(key)))throw new InputError()
  const errors=contactErrors(body)
  if(Object.keys(errors).length)return response(400,{error:{code:'invalid_fields',fields:errors}})
  if(typeof body.website!=='string')throw new InputError()
  if(body.website)return response(400,{error:{code:'invalid_request'}})
  const attempt=body.attempt as {id?:unknown;createdAt?:unknown}|undefined,now=(deps.now??Date.now)()
  if(!attempt||typeof attempt!=='object'||Array.isArray(attempt)||Object.keys(attempt).sort().join(',')!=='createdAt,id'
   ||typeof attempt.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(attempt.id)
   ||typeof attempt.createdAt!=='number'||!Number.isSafeInteger(attempt.createdAt))throw new InputError()
  if(attempt.createdAt>now+60_000||now-attempt.createdAt>CONTACT_WINDOW_MS)return response(409,{error:{code:'attempt_expired'}})
  const data=Object.fromEntries(Object.keys(CONTACT_LIMITS).map(key=>[key,String(body[key]).trim()])) as ContactMessage
  data.email=data.email.toLowerCase()
  const hash=(value:string)=>createHmac('sha256',env.CONTACT_HASH_SECRET!).update(value).digest('hex')
  const client=env.CHIBASKO_CLOUDFLARE==='1'?request.headers.get('cf-connecting-ip')??'':''
  const db=deps.db(),fingerprint=hash(JSON.stringify([data,env.RESEND_FROM_EMAIL,env.CONTACT_NOTIFY_EMAIL]))
  const reservation=await db.call<{state:string;id?:string;lease?:string}>('contact_reserve',{p_id:attempt.id,p_fingerprint:fingerprint,p_client:hash('client:'+(isIP(client)?client:'shared-untrusted-ingress')),p_email:hash('email:'+data.email)})
  if(reservation.state==='accepted')return response(200,{status:'accepted'})
  if(reservation.state==='rate_limited')return response(429,{error:{code:'rate_limited'}})
  if(reservation.state==='conflict')return response(409,{error:{code:'attempt_conflict'}})
  if(reservation.state!=='send')return response(202,{status:'unconfirmed'})
  if(!reservation.id||!reservation.lease)throw Error('invalid_receipt')
  let accepted=false
  try{
   accepted=await withTimeout((async()=>{
   const result=await (deps.fetcher??fetch)('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'contact/'+reservation.id},signal:AbortSignal.timeout(deps.sendTimeoutMs??10_000),body:JSON.stringify({from:env.RESEND_FROM_EMAIL,to:[env.CONTACT_NOTIFY_EMAIL],reply_to:data.email,subject:'Contact Chibasko Games',text:`Prénom : ${data.firstName}\nNom : ${data.lastName}\nE-mail : ${data.email}\n\n${data.message}`})})
   const resultBody=await result.json().catch(()=>null)
   return result.ok&&typeof resultBody?.id==='string'&&resultBody.id.length>0
   })(),deps.sendTimeoutMs??10_000)
  }catch{}
  const confirmed=await db.call<boolean>('contact_finish',{p_id:reservation.id,p_lease:reservation.lease,p_accepted:accepted})
  if(!accepted||!confirmed){log('delivery_unconfirmed');return response(202,{status:'unconfirmed'})}
  return response(200,{status:'accepted'})
 }catch(error){
  if(error instanceof InputError)return response(error.status,{error:{code:'invalid_request'}})
  log('contact_unavailable')
  return response(503,{error:{code:'contact_unavailable'}})
 }
}
