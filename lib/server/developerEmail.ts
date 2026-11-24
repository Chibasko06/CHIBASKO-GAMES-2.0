import 'server-only'
import {after} from 'next/server'
import {authenticateDeveloper} from './developerIdentity'
import {adminOriginAllowed} from './adminRequest'
import {readJsonObject,InputError} from './inputValidation'
import {uploadRepository} from '../game-distribution/uploads/repository'
import {assertUploadId,UploadError} from '../game-distribution/uploads/policy'
import type {UploadRepository} from '../game-distribution/uploads/contracts'
import {developerCodeHash,developerDestinationHash,generateDeveloperCode,developerVerificationMessage,encryptDeveloperEmail} from '../game-distribution/developer-email-code'
import {deliverSubmissionNotifications} from '../game-distribution/submission-notifications'
import type {DeveloperContact} from '../game-distribution/developer-profile'

export type DeveloperEmailStatus={verified:boolean;verifiedAt?:string|null;revision?:string;profileRequired:boolean;retryAfter?:number;challenge?:{id:string;expiresAt:string;attemptsRemaining:number;acceptedByProvider:boolean}|null}
type Dependencies={authenticate:(r:Request)=>Promise<string>;db:()=>UploadRepository;secret:()=>string|undefined;enabled:()=>boolean;from:()=>string|undefined;notify:(actor:string)=>void}
const defaults:Dependencies={authenticate:authenticateDeveloper,db:()=>uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??''),secret:()=>process.env.DEVELOPER_EMAIL_CODE_SECRET,enabled:()=>process.env.DEVELOPER_EMAIL_VERIFICATION_ENABLED==='1',from:()=>process.env.RESEND_FROM_EMAIL,
 notify:actor=>after(async()=>{try{await deliverSubmissionNotifications(defaults.db(),{DEVELOPER_EMAIL_CODE_SECRET:process.env.DEVELOPER_EMAIL_CODE_SECRET,DEVELOPER_EMAIL_VERIFICATION_ENABLED:process.env.DEVELOPER_EMAIL_VERIFICATION_ENABLED,RESEND_API_KEY:process.env.RESEND_API_KEY,RESEND_FROM_EMAIL:process.env.RESEND_FROM_EMAIL},{kind:'verification',actorId:actor,limit:1})}catch{console.error(JSON.stringify({event:'developer_email_verification',outcome:'deferred'}))}})}
export async function developerEmailRequest(request:Request,deps=defaults){
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}
 try{
  const actor=await deps.authenticate(request),db=deps.db()
  if(request.method==='GET')return Response.json({data:await db.call('distribution_developer_email_status',{p_actor:actor}),enabled:deps.enabled()},{headers})
  if(request.method!=='POST')return Response.json({error:{code:'invalid_request'}},{status:405,headers})
  if(!adminOriginAllowed(request))throw new UploadError('forbidden',403)
  if(!deps.enabled())throw new UploadError('verification_unavailable',503)
  const body=await readJsonObject(request,2048)
  if(body.action==='send'){
   if(Object.keys(body).some(k=>!['action','requestId'].includes(k))||typeof body.requestId!=='string')throw new UploadError('invalid_request')
   assertUploadId(body.requestId)
   const [profile,status]=await Promise.all([db.call<DeveloperContact|null>('distribution_developer_profile',{p_actor:actor,p_profile:null}),db.call<DeveloperEmailStatus>('distribution_developer_email_status',{p_actor:actor})])
   if(!profile||!status.revision)throw new UploadError('developer_profile_required',409)
   if(status.verified)return Response.json({data:status},{headers})
   const code=generateDeveloperCode(),binding={actor,revision:status.revision,challenge:body.requestId},secret=deps.secret(),from=deps.from()
   if(!from)throw new UploadError('verification_unavailable',503)
   const [hash,destinationHash,message]=await Promise.all([developerCodeHash(secret,binding,code),developerDestinationHash(secret,profile.contactEmail),encryptDeveloperEmail(secret,binding,developerVerificationMessage(profile.contactEmail,code,from))])
   const data=await db.call('distribution_reserve_developer_email',{p_actor:actor,p_id:body.requestId,p_revision:status.revision,p_destination_hash:destinationHash,p_code_hash:hash,p_message:message})
   try{deps.notify(actor)}catch{/* La file durable reste la référence. */}
   return Response.json({data},{status:202,headers})
  }
  if(body.action!=='confirm'||Object.keys(body).some(k=>!['action','challengeId','code'].includes(k))||typeof body.challengeId!=='string'||typeof body.code!=='string'||!/^\d{6}$/.test(body.code))throw new UploadError('invalid_request')
  assertUploadId(body.challengeId)
  const status=await db.call<DeveloperEmailStatus>('distribution_developer_email_status',{p_actor:actor})
  if(!status.revision)throw new UploadError('developer_profile_required',409)
  const hash=await developerCodeHash(deps.secret(),{actor,revision:status.revision,challenge:body.challengeId},body.code)
  const data=await db.call<DeveloperEmailStatus&{code?:string}>('distribution_confirm_developer_email',{p_actor:actor,p_id:body.challengeId,p_code_hash:hash})
  return Response.json(data.verified?{data}:{data,error:{code:data.code??'verification_invalid'}},{status:data.verified?200:400,headers})
 }catch(error){const safe=error instanceof UploadError?error:error instanceof InputError?new UploadError('invalid_request',error.status):new UploadError('verification_unavailable',503);return Response.json({error:{code:safe.code}},{status:safe.status,headers})}
}
