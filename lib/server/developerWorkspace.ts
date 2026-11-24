import 'server-only'
import {authenticateDeveloper} from './developerIdentity'
import {uploadRepository} from '../game-distribution/uploads/repository'
import {assertUploadId,UploadError} from '../game-distribution/uploads/policy'
import type {UploadRepository} from '../game-distribution/uploads/contracts'
type Dependencies={authenticate:(request:Request)=>Promise<string>;db:()=>UploadRepository}
const defaults:Dependencies={authenticate:authenticateDeveloper,db:()=>uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'')}
export async function developerWorkspaceRequest(request:Request,deps=defaults){
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}
 try{
  const actor=await deps.authenticate(request),query=new URL(request.url).searchParams,game=query.get('gameId'),offset=Number(query.get('offset')??0)
  if(game)assertUploadId(game)
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new UploadError('invalid_request')
  return Response.json({data:await deps.db().call('distribution_developer_workspace',{p_actor:actor,p_game:game,p_offset:offset})},{headers})
 }catch(error){const safe=error instanceof UploadError?error:new UploadError('service_unavailable',503);return Response.json({error:{code:safe.code}},{status:safe.status,headers})}
}
