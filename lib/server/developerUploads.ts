import 'server-only'
import { createUserAuthClient } from './adminAuthorization'
import { adminOriginAllowed } from './adminRequest'
import { readJsonObject, InputError } from './inputValidation'
import { uploadRepository } from '../game-distribution/uploads/repository'
import { R2ConfigurationError,R2RequestError,type R2EnvironmentReport,type R2Failure } from '../game-distribution/uploads/r2'
import {uploadStagingStorage} from './uploadStagingStorage'
import { createUploadService } from '../game-distribution/uploads/service'
import { UploadError } from '../game-distribution/uploads/policy'

export type UploadDiagnostic={event:'developer_upload_failed';requestId:string;operation:string;phase:string;code:string;status:number;r2Configuration?:R2EnvironmentReport;r2?:R2Failure}
type Dependencies = {
  authenticate(request: Request): Promise<string>
  service(requestId:string): ReturnType<typeof createUploadService>
  log?:(event:UploadDiagnostic)=>void
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
  service(requestId) {
    // Fail closed until migrations, private buckets, queue/consumer and CORS are configured.
    if(process.env.GAME_DISTRIBUTION_UPLOADS_ENABLED!=='1')throw new UploadError('service_unavailable',503)
    return createUploadService(uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',fetch,{requestId}),uploadStagingStorage())
  },
}
export async function developerUploadRequest(request: Request, operation: 'create' | 'status' | 'parts' | 'finalize' | 'review', id: string, deps=dependencies) {
  const requestId=crypto.randomUUID()
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Request-Id':requestId}
  let phase='authentication'
  try {
    const actor=await deps.authenticate(request)
    phase='authorization'
    if(!['GET','HEAD'].includes(request.method) && !adminOriginAllowed(request))throw new UploadError('forbidden',403)
    phase='service_configuration'
    const service=deps.service(requestId)
    phase=operation
    const result=operation==='create' ? await service.create(actor,id,await readJsonObject(request),request.headers.get('Idempotency-Key') ?? '')
      :operation==='status' ? await service.status(actor,id)
      :operation==='review' ? await service.review(actor,id)
      :operation==='finalize' ? await service.finalize(actor,id)
      :await service.parts(actor,id,request.method==='POST'?(await readJsonObject(request)).partNumbers:undefined)
    return Response.json({data:result},{status:operation==='create'?201:operation==='finalize'?202:200,headers})
  } catch(error) {
    const safe=error instanceof UploadError?error:error instanceof InputError?new UploadError('invalid_request',error.status):new UploadError('service_unavailable',503)
    if(safe.status>=500){
      const entry:UploadDiagnostic={event:'developer_upload_failed',requestId,operation,phase,code:safe.code,status:safe.status,
        ...(error instanceof R2ConfigurationError?{r2Configuration:error.configuration}:{}),
        ...(error instanceof R2RequestError?{r2:error.diagnostic}:{})}
      try{(deps.log??(event=>console.error(JSON.stringify(event))))(entry)}catch{/* Diagnostics cannot change upload state or responses. */}
    }
    return Response.json({error:{code:safe.code}},{status:safe.status,headers})
  }
}
