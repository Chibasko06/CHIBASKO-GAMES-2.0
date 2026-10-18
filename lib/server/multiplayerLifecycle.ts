import 'server-only'
import { sha256 } from '../game-distribution/build'
import { uploadRepository } from '../game-distribution/uploads/repository'
import { readJsonObject } from './inputValidation'
import type { UploadRepository } from '../game-distribution/uploads/contracts'

export async function multiplayerLifecycle(request:Request,sessionId:string,db?:UploadRepository) {
 const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}
 try {
  const header=request.headers.get('authorization')??''
  if(!/^Bearer [a-f0-9]{64}$/.test(header))return Response.json({error:{code:'invalid_credential'}},{status:401,headers})
  if(!/^s_[a-f0-9]{32}$/.test(sessionId))return Response.json({error:{code:'invalid_request'}},{status:400,headers})
  const body=await readJsonObject(request,512)
  if(Object.keys(body).length!==1 || !['playing','results'].includes(String(body.event)))return Response.json({error:{code:'invalid_request'}},{status:400,headers})
  const repository=db??uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'')
  const result=await repository.call<{data?:{accepted:true};error?:{code:string}}>('distribution_multiplayer_server_event',{
   p_credential_hash:await sha256(new TextEncoder().encode(header.slice(7))),p_session:sessionId,p_event:body.event})
  return Response.json(result,{status:result.error?(result.error.code==='rate_limited'?429:result.error.code==='invalid_credential'?401:409):200,headers})
 }catch{return Response.json({error:{code:'service_unavailable'}},{status:503,headers})}
}
