import 'server-only'
import { createUserAuthClient } from './adminAuthorization'
import { adminOriginAllowed } from './adminRequest'
import { InputError, readJsonObject } from './inputValidation'
import { uploadRepository } from '../game-distribution/uploads/repository'
import { UploadError } from '../game-distribution/uploads/policy'
import { previewService } from '../game-distribution/gateway/preview'
import { GatewayError, type Execution } from '../game-distribution/gateway/contracts'

type Dependencies={authenticate(request:Request):Promise<string>;service():ReturnType<typeof previewService>}
const dependencies:Dependencies={
  async authenticate(request) {
    const header=request.headers.get('authorization')
    if(!header?.startsWith('Bearer ') || header.length>8192)throw new GatewayError('unauthorized',401)
    const token=header.slice(7),{data,error}=await createUserAuthClient(token).auth.getUser(token)
    if(error || !data.user)throw new GatewayError('unauthorized',401)
    return data.user.id
  },
  service() {
    if(process.env.GAME_ARTIFACT_PREVIEWS_ENABLED!=='1')throw new GatewayError('service_unavailable',503)
    return previewService(uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''),{
      publicBase:process.env.GAME_CONTENT_PUBLIC_BASE ?? '',previewBase:process.env.GAME_CONTENT_PREVIEW_BASE ?? '',
      portalOrigins:(process.env.GAME_PORTAL_ORIGINS ?? '').split(',').map(s=>s.trim()).filter(Boolean)})
  },
}
export async function developerPreviewRequest(request:Request,versionId:string,deps=dependencies) {
  const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}
  try {
    const actor=await deps.authenticate(request)
    if(!adminOriginAllowed(request))throw new GatewayError('preview_forbidden',403)
    const body=await readJsonObject(request,1024)
    if(Object.keys(body).length!==1 || !['local','online'].includes(String(body.execution)))throw new GatewayError('invalid_preview_request',400)
    return Response.json({data:await deps.service().issue(actor,versionId,body.execution as Execution)},{status:201,headers})
  }catch(error) {
    const safe=error instanceof GatewayError || error instanceof UploadError?error:error instanceof InputError?new GatewayError('invalid_preview_request',error.status):new GatewayError('service_unavailable',503)
    return Response.json({error:{code:safe.code}},{status:safe.status,headers})
  }
}
