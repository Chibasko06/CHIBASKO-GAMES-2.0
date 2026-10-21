import {after} from 'next/server'
import {deliverSubmissionNotifications} from '../game-distribution/submission-notifications'
import 'server-only'
import {authenticateDeveloper} from './developerIdentity'
import {adminOriginAllowed} from './adminRequest'
import {readJsonObject,InputError} from './inputValidation'
import {uploadRepository} from '../game-distribution/uploads/repository'
import {UPLOAD_POLICY,UploadError,assertUploadId} from '../game-distribution/uploads/policy'
import type {UploadRepository} from '../game-distribution/uploads/contracts'
import {catalogueInput,readCatalogueForm} from './submissionCatalogue'
import {validateGameThumbnail} from './gameThumbnailValidation'
import {uploadGameThumbnail} from './gameMediaStorage'

export function editorialInput(body:Record<string,unknown>) {
  if(Object.keys(body).some(k=>!['uploadId','title','description','categories','website','ownership'].includes(k))||body.ownership!==true)throw new UploadError('invalid_request')
  assertUploadId(String(body.uploadId))
  if(typeof body.title!=='string'||!body.title.trim()||body.title.length>160||typeof body.description!=='string'||!body.description.trim()||body.description.length>10000)throw new UploadError('invalid_request')
  if(!Array.isArray(body.categories)||body.categories.length>8||new Set(body.categories).size!==body.categories.length)throw new UploadError('invalid_request')
  body.categories.forEach(v=>assertUploadId(String(v)))
  if(typeof body.website!=='string'||body.website.length>2048)throw new UploadError('invalid_request')
  if(body.website){try{const u=new URL(body.website);if(u.protocol!=='https:'||u.username||u.password)throw Error()}catch{throw new UploadError('invalid_request')}}
  return {p_upload:body.uploadId,p_title:body.title.trim(),p_description:body.description.trim(),p_categories:body.categories,p_website:body.website||null}
}
export type SubmissionDiagnostic={event:'developer_submission_failed';requestId:string;operation:string;phase:string;status:number;code:string;reason?:'uploads_disabled'}
type Dependencies={notify?:(id:string)=>void;authenticate(request:Request):Promise<string>;db(requestId:string):UploadRepository;enabled():boolean;cover?:(file:File)=>Promise<string>;log?:(event:SubmissionDiagnostic)=>void}
const defaults:Dependencies={
  // OpenNext forwards Next after() to the Cloudflare execution context's waitUntil.
  notify:id=>after(async()=>{try{const db=uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'');await deliverSubmissionNotifications(db,{RESEND_API_KEY:process.env.RESEND_API_KEY,RESEND_FROM_EMAIL:process.env.RESEND_FROM_EMAIL,GAME_SUBMISSION_NOTIFY_EMAIL:process.env.GAME_SUBMISSION_NOTIFY_EMAIL,NEXT_PUBLIC_SITE_URL:process.env.NEXT_PUBLIC_SITE_URL},{submissionId:id})}catch{console.error(JSON.stringify({event:'submission_email_delivery',outcome:'failed',phase:'configuration'}))}}),
  authenticate:authenticateDeveloper,
  db:requestId=>uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'',fetch,{requestId}),
  enabled:()=>process.env.GAME_DISTRIBUTION_UPLOADS_ENABLED==='1',cover:uploadGameThumbnail
}
export async function developerSubmissionRequest(request:Request,operation:'games'|'submissions',deps=defaults) {
  const requestId=crypto.randomUUID()
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Request-Id':requestId}
  function submitted(id:string){try{deps.notify?.(id)}catch{/* The committed submission and outbox remain authoritative. */}return Response.json({data:{submissionId:id}},{status:201,headers})}
  let phase='authentication',reason:SubmissionDiagnostic['reason']
  try {
    const actor=await deps.authenticate(request)
    phase='authorization'
    if(request.method!=='GET'&&!adminOriginAllowed(request))throw new UploadError('forbidden',403)
    phase='repository_configuration'
    const db=deps.db(requestId)
    if(request.method==='GET'){
      phase='rpc'
      const uploadId=new URL(request.url).searchParams.get('uploadId')
      if(operation==='submissions'&&uploadId){assertUploadId(uploadId);return Response.json({data:await db.call('distribution_editorial_context',{p_actor:actor,p_upload:uploadId})},{headers})}
      const offset=Number(new URL(request.url).searchParams.get('offset')??0);if(!Number.isInteger(offset)||offset<0||offset>100000)throw new UploadError('invalid_request')
      return Response.json({data:await db.call(operation==='games'?'distribution_managed_catalog':'distribution_developer_builds',{p_actor:actor,p_offset:offset}),maxArchiveBytes:UPLOAD_POLICY.maxArchiveBytes},{headers})
    }
    phase='upload_configuration'
    if(!deps.enabled()){reason='uploads_disabled';throw new UploadError('service_unavailable',503)}
    phase='request_validation'
    if(operation==='submissions' && request.headers.get('content-type')?.startsWith('multipart/form-data')){
      const {body,cover}=await readCatalogueForm(request),input=catalogueInput(body)
      phase='rpc'
      const context=await db.call<{submissionId:string|null}>('distribution_editorial_context',{p_actor:actor,p_upload:input.p_upload})
      if(context.submissionId)return submitted(context.submissionId)
      if(input.p_kind==='new'&&!cover || input.p_kind==='update'&&cover)throw new UploadError('invalid_request')
      let url:string|null=null
      if(cover){phase='cover_validation';try{await validateGameThumbnail(cover)}catch{throw new UploadError('invalid_cover')}
        if(!deps.cover)throw new UploadError('service_unavailable',503)
        phase='cover_storage'
        url=await deps.cover(cover)
      }
      phase='rpc'
      return submitted(await db.call<string>('distribution_submit_catalogue',{p_actor:actor,...input,p_cover:url}))
    }
    const body=await readJsonObject(request,20000)
    if(operation==='games') {
      const key=request.headers.get('Idempotency-Key')??'';assertUploadId(key)
      if(Object.keys(body).length!==1||typeof body.title!=='string'||!body.title.trim()||body.title.length>160)throw new UploadError('invalid_request')
      phase='rpc'
      return Response.json({data:{gameId:await db.call('distribution_register_game',{p_actor:actor,p_request:key,p_title:body.title.trim()})}},{status:201,headers})
    }
    const input=catalogueInput(body)
    if(input.p_kind!=='update')throw new UploadError('invalid_request')
    phase='rpc'
    return submitted(await db.call<string>('distribution_submit_catalogue',{p_actor:actor,...input,p_cover:null}))
  }catch(error){const safe=error instanceof UploadError?error:error instanceof InputError?new UploadError('invalid_request',error.status):new UploadError('service_unavailable',503)
    if(safe.status>=500){
      const entry:SubmissionDiagnostic={event:'developer_submission_failed',requestId,
        operation:operation==='games'?(request.method==='GET'?'list_managed_games':'register_game'):'submissions',phase,status:safe.status,code:safe.code,...(reason?{reason}:{})}
      try{(deps.log??(event=>console.error(JSON.stringify(event))))(entry)}catch{/* Diagnostics cannot alter the public response. */}
    }
    return Response.json({error:{code:safe.code}},{status:safe.status,headers})}
}
