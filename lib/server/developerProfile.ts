import 'server-only'
import {authenticateDeveloper} from './developerIdentity'
import {adminOriginAllowed} from './adminRequest'
import {readJsonObject,InputError} from './inputValidation'
import {uploadRepository} from '../game-distribution/uploads/repository'
import type {UploadRepository} from '../game-distribution/uploads/contracts'
import {developerContact} from '../game-distribution/developer-profile'
import {UploadError} from '../game-distribution/uploads/policy'
type Dependencies={authenticate(request:Request):Promise<string>;db():UploadRepository}
export async function developerProfileRequest(request:Request,deps:Dependencies={authenticate:authenticateDeveloper,db:()=>uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'')}){
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}
 try{
  const actor=await deps.authenticate(request)
  if(!['GET','PUT'].includes(request.method))return Response.json({error:{code:'invalid_request'}},{status:405,headers})
  if(request.method==='PUT'&&!adminOriginAllowed(request))throw new UploadError('forbidden',403)
  const profile=request.method==='PUT'?developerContact(await readJsonObject(request,8192)):null
  if(request.method==='PUT'&&!profile)throw new UploadError('invalid_request',400)
  const value=await deps.db().call('distribution_developer_profile',{p_actor:actor,p_profile:profile})
  const data=value===null?null:developerContact(value)
  if(value!==null&&!data)throw new UploadError('database_error',503)
  return Response.json({data},{headers})
 }catch(error){const safe=error instanceof UploadError?error:error instanceof InputError?new UploadError('invalid_request',error.status):new UploadError('service_unavailable',503);return Response.json({error:{code:safe.code}},{status:safe.status,headers})}
}
