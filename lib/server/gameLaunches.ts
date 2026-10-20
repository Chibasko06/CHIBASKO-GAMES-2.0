import 'server-only'
import {onlineSessionService} from '../online-session/service'
import {OnlineSessionError} from '../online-session/contracts'
import {createUserAuthClient} from './adminAuthorization'
import {adminOriginAllowed} from './adminRequest'
import {readJsonObject,InputError} from './inputValidation'
import {uploadRepository,type RpcDiagnostic} from '../game-distribution/uploads/repository'
import {UploadError} from '../game-distribution/uploads/policy'
import {launchService,type LaunchPhase,type LaunchObserver} from '../game-distribution/gateway/launch'
import {GatewayError} from '../game-distribution/gateway/contracts'
import type {LaunchRequest} from '../game-runtime/contracts'
import {launchConfiguration,requireLaunchAuthenticationConfiguration,LaunchConfigurationError,type LaunchEnvironmentReport} from './gameLaunchConfiguration'

type Phase=LaunchPhase|'configuration'|'authentication'|'request_validation'|'database'|'unexpected'
type ServiceContext={requestId:string;phase:LaunchObserver;rpcFailure:(event:RpcDiagnostic)=>void}
export type LaunchDiagnostic={event:'game_launch_failed';requestId:string;operation:'create'|'renew'|'release';phase:Phase;stage:Phase;code:string;status:number;audience?:'preview'|'published';execution?:'local'|'online';reason?:string;configuration?:LaunchEnvironmentReport;rpc?:Pick<RpcDiagnostic,'operation'|'kind'|'upstreamStatus'|'upstreamCode'|'permissionDenied'>}
type Dependencies={actor(request:Request):Promise<string|null>;service(context:ServiceContext):ReturnType<typeof launchService>;log?:(entry:LaunchDiagnostic)=>void}
export function createLaunchService(context:ServiceContext,env:Record<string,string|undefined>=process.env,fetcher:typeof fetch=fetch){
 const config=launchConfiguration(env)
 const db=uploadRepository(env.NEXT_PUBLIC_SUPABASE_URL??'',env.SUPABASE_SERVICE_ROLE_KEY??'',fetcher,{requestId:context.requestId,log:context.rpcFailure})
 return launchService(db,config,onlineSessionService(db).authorize,context.phase)
}
const dependencies:Dependencies={
 async actor(request){
  const header=request.headers.get('authorization');if(!header)return null
  if(!header.startsWith('Bearer ')||header.length>8192)throw new GatewayError('unauthorized',401)
  requireLaunchAuthenticationConfiguration(process.env)
  const token=header.slice(7),{data,error}=await createUserAuthClient(token).auth.getUser(token)
  if(error||!data.user)throw new GatewayError('unauthorized',401)
  return data.user.id
 },
 service:createLaunchService
}
const publicCodes=new Set(['unauthorized','forbidden','invalid_launch_request','service_unavailable','invalid_gateway_configuration','version_not_found','version_not_previewable','preview_forbidden','unsupported_execution','invalid_launch_context','invalid_launch_session','invalid_version_record','invalid_delivery_policy','unsupported_delivery_policy','online_session_required','online_session_unavailable','database_error','quota_exceeded','launch_expired','invalid_request','game_not_found','invalid_operation','invalid_launch'])
export async function gameLaunchRequest(request:Request,id?:string,deps=dependencies){
 const requestId=crypto.randomUUID(),headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Request-Id':requestId}
 let phase:Phase='request_validation',rpc:RpcDiagnostic|undefined,audience:LaunchDiagnostic['audience'],execution:LaunchDiagnostic['execution']
 const operation=id?(request.method==='PATCH'?'renew':'release'):'create'
 try{
  if(!adminOriginAllowed(request))throw new GatewayError('forbidden',403)
  const body=await readJsonObject(request,2048)
  phase='configuration'
  const service=deps.service({requestId,phase:value=>{phase=value},rpcFailure:event=>{rpc=event}})
  if(id){
   if(Object.keys(body).length!==1||typeof body.controlToken!=='string')throw new GatewayError('invalid_launch_request',400)
   phase='launch_session_control'
   if(request.method==='PATCH')return Response.json({data:await service.renew(id,body.controlToken)},{headers})
   await service.release(id,body.controlToken);return new Response(null,{status:204,headers})
  }
  phase='request_validation'
  const keys=['gameId','gameVersionId','execution','audience','locale','onlineSessionReference']
  if(Object.keys(body).some(k=>!keys.includes(k))||!['gameId','gameVersionId','execution','audience','locale'].every(k=>typeof body[k]==='string')
   ||!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(String(body.locale))
   ||(body.onlineSessionReference!==undefined&&(typeof body.onlineSessionReference!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(body.onlineSessionReference))))throw new GatewayError('invalid_launch_request',400)
  if(body.audience==='preview'||body.audience==='published')audience=body.audience
  if(body.execution==='local'||body.execution==='online')execution=body.execution
  phase='authentication'
  const actor=await deps.actor(request)
  phase='version_authorization'
  return Response.json({data:await service.create(actor,body as LaunchRequest)},{status:201,headers})
 }catch(error){
  const known=error instanceof GatewayError||error instanceof UploadError||error instanceof OnlineSessionError||error instanceof InputError
  const candidate=error instanceof InputError?new GatewayError('invalid_launch_request',error.status):known?error as GatewayError:new GatewayError('service_unavailable',503)
  const safe=publicCodes.has(candidate.code)?candidate:new GatewayError('service_unavailable',503)
  const entry:LaunchDiagnostic={event:'game_launch_failed',requestId,operation,phase:error instanceof LaunchConfigurationError?'configuration':!known?'unexpected':safe.code==='database_error'?'database':phase,stage:phase,code:safe.code,status:safe.status,...(audience?{audience}:{}),...(execution?{execution}:{}),
   ...(error instanceof LaunchConfigurationError?{reason:error.reason,configuration:error.configuration}:{}),
   ...(rpc?{rpc:{operation:rpc.operation,kind:rpc.kind,upstreamStatus:rpc.upstreamStatus,upstreamCode:rpc.upstreamCode,permissionDenied:rpc.permissionDenied}}:{})}
  try{(deps.log??(value=>console.error(JSON.stringify(value))))(entry)}catch{/* Logging must not change responses or session state. */}
  return Response.json({error:{code:safe.code}},{status:safe.status,headers})
 }
}
