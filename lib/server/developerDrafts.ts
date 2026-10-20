import 'server-only'
import {authenticateDeveloper} from './developerIdentity'
import {adminOriginAllowed} from './adminRequest'
import {readJsonObject,InputError} from './inputValidation'
import {uploadRepository} from '../game-distribution/uploads/repository'
import {UPLOAD_POLICY,UploadError,assertUploadId} from '../game-distribution/uploads/policy'
import type {UploadRepository} from '../game-distribution/uploads/contracts'
import type {DraftMetadata} from '../game-distribution/submission-drafts'
export function draftMetadata(value:unknown):DraftMetadata{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new UploadError('invalid_request')
 const data=value as Record<string,unknown>
 if(Object.keys(data).some(k=>!['title','studio','releaseDate','description','categories','mobile','technology'].includes(k)))throw new UploadError('invalid_request')
 for(const [key,max] of [['title',160],['studio',160],['releaseDate',10],['description',10000],['technology',120]] as const){
   if(typeof data[key]!=='string'||data[key].length>max)throw new UploadError('invalid_request')
 }
 if(data.releaseDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(data.releaseDate as string)||!Number.isFinite(Date.parse(data.releaseDate as string))||new Date(data.releaseDate as string).toISOString().slice(0,10)!==data.releaseDate))throw new UploadError('invalid_request')
 if(data.mobile!==null&&typeof data.mobile!=='boolean'||!Array.isArray(data.categories)||data.categories.length>8||new Set(data.categories).size!==data.categories.length)throw new UploadError('invalid_request')
 data.categories.forEach(id=>assertUploadId(String(id)))
 return data as DraftMetadata
}
type Dependencies={authenticate:(request:Request)=>Promise<string>;db:(requestId:string)=>UploadRepository;log?:(value:Record<string,unknown>)=>void}
const defaults:Dependencies={authenticate:authenticateDeveloper,db:requestId=>uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'',fetch,{requestId})}
export async function developerDraftRequest(request:Request,deps=defaults){
 const requestId=crypto.randomUUID(),headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Request-Id':requestId}
 try{
  const actor=await deps.authenticate(request)
  if(request.method!=='GET'&&!adminOriginAllowed(request))throw new UploadError('forbidden',403)
  const db=deps.db(requestId)
  if(request.method==='GET'){
   const query=new URL(request.url).searchParams,game=query.get('gameId'),offset=Number(query.get('offset')??0)
   if(game)assertUploadId(game)
   if(!Number.isInteger(offset)||offset<0||offset>100000)throw new UploadError('invalid_request')
   return Response.json({data:await db.call('distribution_developer_drafts',{p_actor:actor,p_game:game,p_offset:offset}),maxArchiveBytes:UPLOAD_POLICY.maxArchiveBytes},{headers})
  }
  const body=await readJsonObject(request,65536);assertUploadId(String(body.gameId))
  let result:unknown
  if(body.action==='save'){
   if(Object.keys(body).some(k=>!['action','gameId','revision','metadata','version'].includes(k))||!Number.isSafeInteger(body.revision)||Number(body.revision)<0||typeof body.version!=='string'||body.version.length>64)throw new UploadError('invalid_request')
   result=await db.call('distribution_save_draft',{p_actor:actor,p_game:body.gameId,p_revision:body.revision,p_metadata:draftMetadata(body.metadata),p_version:body.version})
  }else if(body.action==='upload-state'){
   if(Object.keys(body).some(k=>!['action','gameId','requestId','file','hashes'].includes(k)))throw new UploadError('invalid_request')
   assertUploadId(String(body.requestId))
   const file=body.file as Record<string,unknown>,hashes=body.hashes
   if(!file||Object.keys(file).some(k=>!['name','size','lastModified'].includes(k))||typeof file.name!=='string'||file.name.length<1||file.name.length>255||!Number.isSafeInteger(file.size)||Number(file.size)<1||Number(file.size)>UPLOAD_POLICY.maxArchiveBytes||!Number.isSafeInteger(file.lastModified)||Number(file.lastModified)<0||!hashes||typeof hashes!=='object'||Array.isArray(hashes)||Object.entries(hashes).some(([part,hash])=>!/^[1-9][0-9]{0,3}$/.test(part)||typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash)))throw new UploadError('invalid_request')
   result=await db.call('distribution_save_draft_upload',{p_actor:actor,p_game:body.gameId,p_request:body.requestId,p_file:file,p_hashes:hashes})
  }else if(body.action==='restart-upload'){
   if(Object.keys(body).some(k=>!['action','gameId'].includes(k)))throw new UploadError('invalid_request')
   result=await db.call('distribution_restart_draft_upload',{p_actor:actor,p_game:body.gameId})
  }else throw new UploadError('invalid_request')
  return Response.json({data:result},{headers})
 }catch(error){
  const safe=error instanceof UploadError?error:error instanceof InputError?new UploadError('invalid_request',error.status):new UploadError('service_unavailable',503)
  if(safe.status>=500)try{(deps.log??(value=>console.error(JSON.stringify(value))))({event:'developer_draft_failed',requestId,status:safe.status,code:safe.code})}catch{}
  return Response.json({error:{code:safe.code}},{status:safe.status,headers})
 }
}
