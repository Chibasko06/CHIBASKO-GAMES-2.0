import 'server-only'
import { createUserAuthClient } from './adminAuthorization'
import { adminOriginAllowed } from './adminRequest'
import { readJsonObject, InputError } from './inputValidation'
import { uploadRepository } from '../game-distribution/uploads/repository'
import { R2ConfigurationError,R2RequestError,type R2EnvironmentReport,type R2Failure } from '../game-distribution/uploads/r2'
import {uploadStagingStorage} from './uploadStagingStorage'
import { createUploadService } from '../game-distribution/uploads/service'
import { UploadError } from '../game-distribution/uploads/policy'

export const UPLOAD_CONTRACT_REVISION='semver-schema-v2'
export type UploadDiagnostic={event:'developer_upload_failed';requestId:string;operation:string;phase:string;code:string;status:number;contractRevision:string;input?:{versionType:string;version?:string;versionLength?:number;versionHasWhitespace?:boolean;versionHasNonAscii?:boolean;archiveSize?:number;archiveSizeType:string};r2Configuration?:R2EnvironmentReport;r2?:R2Failure}
type Dependencies = {
  authenticate(request: Request): Promise<string>
  service(requestId:string,onPhase?:(phase:string)=>void): ReturnType<typeof createUploadService>
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
  service(requestId,onPhase) {
    // Fail closed until migrations, private buckets, queue/consumer and CORS are configured.
    if(process.env.GAME_DISTRIBUTION_UPLOADS_ENABLED!=='1')throw new UploadError('service_unavailable',503)
    return createUploadService(uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',fetch,{requestId}),uploadStagingStorage(),onPhase)
  },
}
export async function developerUploadRequest(request: Request, operation: 'create' | 'status' | 'parts' | 'finalize' | 'review', id: string, deps=dependencies) {
  const requestId=crypto.randomUUID()
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Request-Id':requestId,'X-Upload-Contract':UPLOAD_CONTRACT_REVISION}
  let phase='authentication'
  let input:UploadDiagnostic['input']
  try {
    const actor=await deps.authenticate(request)
    phase='authorization'
    if(!['GET','HEAD'].includes(request.method) && !adminOriginAllowed(request))throw new UploadError('forbidden',403)
    phase='service_configuration'
    const service=deps.service(requestId,value=>{phase=value})
    phase=operation
    let body:Record<string,unknown>|undefined
    if(operation==='create'){
      phase='body_parsing';body=await readJsonObject(request)
      const version=body.version
      input={versionType:typeof version,...(typeof version==='string'?{versionLength:version.length,versionHasWhitespace:/\s/.test(version),versionHasNonAscii:/[^\x20-\x7e]/.test(version),...(/^[0-9A-Za-z.+-]{1,64}$/.test(version)?{version}:{})}:{}),archiveSizeType:typeof body.archiveSize,...(typeof body.archiveSize==='number'&&Number.isFinite(body.archiveSize)?{archiveSize:body.archiveSize}:{})}
      phase='upload_service_create'
    }
    const result=operation==='create' ? await service.create(actor,id,body!,request.headers.get('Idempotency-Key') ?? '')
      :operation==='status' ? await service.status(actor,id)
      :operation==='review' ? await service.review(actor,id)
      :operation==='finalize' ? await service.finalize(actor,id)
      :await service.parts(actor,id,request.method==='POST'?(await readJsonObject(request)).partNumbers:undefined)
    return Response.json({data:result},{status:operation==='create'?201:operation==='finalize'?202:200,headers})
  } catch(error) {
    const safe=error instanceof UploadError?error:error instanceof InputError?new UploadError('invalid_request',error.status):new UploadError('service_unavailable',503)
    if(safe.status>=500||operation==='create'){
      const entry:UploadDiagnostic={event:'developer_upload_failed',requestId,operation,phase,code:safe.code,status:safe.status,contractRevision:UPLOAD_CONTRACT_REVISION,...(input?{input}:{}),
        ...(error instanceof R2ConfigurationError?{r2Configuration:error.configuration}:{}),
        ...(error instanceof R2RequestError?{r2:error.diagnostic}:{})}
      try{(deps.log??(event=>console.error(JSON.stringify(event))))(entry)}catch{/* Diagnostics cannot change upload state or responses. */}
    }
    return Response.json({error:{code:safe.code}},{status:safe.status,headers})
  }
}
