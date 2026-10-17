import 'server-only'
import { createUserAuthClient } from './adminAuthorization'
import { adminOriginAllowed } from './adminRequest'
import { readJsonObject, InputError } from './inputValidation'
import { uploadRepository } from '../game-distribution/uploads/repository'
import { UploadError } from '../game-distribution/uploads/policy'
import { launchService } from '../game-distribution/gateway/launch'
import { GatewayError } from '../game-distribution/gateway/contracts'
import type { LaunchRequest } from '../game-runtime/contracts'

type Dependencies={actor(request:Request):Promise<string|null>;service():ReturnType<typeof launchService>}
const dependencies:Dependencies={
  async actor(request) {
    const header=request.headers.get('authorization')
    if(!header)return null
    if(!header.startsWith('Bearer ') || header.length>8192)throw new GatewayError('unauthorized',401)
    const token=header.slice(7),{data,error}=await createUserAuthClient(token).auth.getUser(token)
    if(error || !data.user)throw new GatewayError('unauthorized',401)
    return data.user.id
  },
  service() {
    if(process.env.GAME_RUNTIME_LAUNCHES_ENABLED!=='1')throw new GatewayError('service_unavailable',503)
    return launchService(uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''),{
      publicBase:process.env.GAME_CONTENT_PUBLIC_BASE ?? '',previewBase:process.env.GAME_CONTENT_PREVIEW_BASE ?? '',contentBase:process.env.GAME_CONTENT_BASE_DOMAIN ?? '',
      portalOrigins:(process.env.GAME_PORTAL_ORIGINS ?? '').split(',').map(s=>s.trim()).filter(Boolean)})
  },
}
export async function gameLaunchRequest(request:Request,id?:string,deps=dependencies) {
  const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}
  try {
    if(!adminOriginAllowed(request))throw new GatewayError('forbidden',403)
    const body=await readJsonObject(request,2048),service=deps.service()
    if(id) {
      if(Object.keys(body).length!==1 || typeof body.controlToken!=='string')throw new GatewayError('invalid_launch_request',400)
      if(request.method==='PATCH')return Response.json({data:await service.renew(id,body.controlToken)},{headers})
      await service.release(id,body.controlToken)
      return new Response(null,{status:204,headers})
    }
    const keys=['gameId','gameVersionId','execution','audience','locale','onlineSessionReference']
    if(Object.keys(body).some(k=>!keys.includes(k)) || !['gameId','gameVersionId','execution','audience','locale'].every(k=>typeof body[k]==='string')
      || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(String(body.locale))
      || (body.onlineSessionReference!==undefined && (typeof body.onlineSessionReference!=='string' || !/^[A-Za-z0-9_-]{8,128}$/.test(body.onlineSessionReference))))throw new GatewayError('invalid_launch_request',400)
    return Response.json({data:await service.create(await deps.actor(request),body as LaunchRequest)},{status:201,headers})
  }catch(error) {
    const safe=error instanceof GatewayError || error instanceof UploadError?error:error instanceof InputError?new GatewayError('invalid_launch_request',error.status):new GatewayError('service_unavailable',503)
    return Response.json({error:{code:safe.code}},{status:safe.status,headers})
  }
}
