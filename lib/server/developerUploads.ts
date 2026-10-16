import 'server-only'
import { createUserAuthClient } from './adminAuthorization'
import { adminOriginAllowed } from './adminRequest'
import { readJsonObject, InputError } from './inputValidation'
import { uploadRepository } from '../game-distribution/uploads/repository'
import { r2FromEnvironment } from '../game-distribution/uploads/r2'
import { createUploadService } from '../game-distribution/uploads/service'
import { UploadError } from '../game-distribution/uploads/policy'

type Dependencies = {
  authenticate(request: Request): Promise<string>
  service(): ReturnType<typeof createUploadService>
}
const dependencies: Dependencies = {
  async authenticate(request) {
    const header=request.headers.get('authorization')
    if(!header?.startsWith('Bearer ') || header.length>8192)throw new UploadError('unauthorized',401)
    const token=header.slice(7)
    const {data,error}=await createUserAuthClient(token).auth.getUser(token)
    if(error || !data.user)throw new UploadError('unauthorized',401)
    return data.user.id
  },
  service() {
    // Fail closed until migrations, private buckets, queue/consumer and CORS are configured.
    if(process.env.GAME_DISTRIBUTION_UPLOADS_ENABLED!=='1')throw new UploadError('service_unavailable',503)
    return createUploadService(uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''),r2FromEnvironment(process.env,'STAGING'))
  },
}
export async function developerUploadRequest(request: Request, operation: 'create' | 'status' | 'parts' | 'finalize', id: string, deps=dependencies) {
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}
  try {
    const actor=await deps.authenticate(request)
    if(!['GET','HEAD'].includes(request.method) && !adminOriginAllowed(request))throw new UploadError('forbidden',403)
    const service=deps.service()
    const result=operation==='create' ? await service.create(actor,id,await readJsonObject(request),request.headers.get('Idempotency-Key') ?? '')
      :operation==='status' ? await service.status(actor,id)
      :operation==='finalize' ? await service.finalize(actor,id)
      :await service.parts(actor,id,request.method==='POST'?(await readJsonObject(request)).partNumbers:undefined)
    return Response.json({data:result},{status:operation==='create'?201:operation==='finalize'?202:200,headers})
  } catch(error) {
    const safe=error instanceof UploadError?error:error instanceof InputError?new UploadError('invalid_request',error.status):new UploadError('service_unavailable',503)
    return Response.json({error:{code:safe.code}},{status:safe.status,headers})
  }
}
