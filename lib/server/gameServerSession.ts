import 'server-only'
import { sha256 } from '../game-distribution/build'
import { uploadRepository } from '../game-distribution/uploads/repository'
import type { UploadRepository } from '../game-distribution/uploads/contracts'
export async function gameServerSession(request:Request,id:string,db?:UploadRepository) {
 const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}
 const credential=request.headers.get('authorization')??''
 if(!/^Bearer [a-f0-9]{64}$/.test(credential))return Response.json({error:{code:'invalid_credential'}},{status:401,headers})
 if(!/^s_[a-f0-9]{32}$/.test(id))return Response.json({error:{code:'invalid_request'}},{status:400,headers})
 try {
  const repository=db??uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'')
  const result=await repository.call<{data?:unknown;error?:{code:string}}>('distribution_server_session',{
   p_credential_hash:await sha256(new TextEncoder().encode(credential.slice(7))),p_session:id})
  return Response.json(result,{status:result.error?(result.error.code==='invalid_credential'?401:result.error.code==='rate_limited'?429:409):200,headers})
 }catch{return Response.json({error:{code:'service_unavailable'}},{status:503,headers})}
}
