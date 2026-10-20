import { sha256 } from '../build'
import { UUID } from '../uploads/policy'
import type { UploadRepository } from '../uploads/contracts'
import { resolveGameVersion, launchDescriptor, validateGatewayConfiguration } from './resolver'
import { GatewayError, type GatewayConfiguration } from './contracts'
import { RUNTIME_POLICY, safeContext, type LaunchHandle, type LaunchLease, type LaunchRequest, type SafeLaunchContext } from '../../game-runtime/contracts'
import { parse } from 'tldts'

type Configuration=GatewayConfiguration & {contentBase:string}
export type LaunchPhase='version_authorization'|'version_resolution'|'online_authorization'|'launch_session_creation'|'artifact_gateway_resolution'|'launch_session_control'
export type LaunchObserver=(phase:LaunchPhase)=>void
type LaunchRecord={id:string;version_id:string;generation:string;expires_at:string;safe_context:SafeLaunchContext}
/** Deployment supplies an authenticated prepared-session projection, never client data. */
export type OnlineLaunchAuthorizer=(actor:string,request:LaunchRequest)=>Promise<SafeLaunchContext>
function randomHex(bytes:number){return [...crypto.getRandomValues(new Uint8Array(bytes))].map(b=>b.toString(16).padStart(2,'0')).join('')}
export async function launchHash(value:string){return sha256(new TextEncoder().encode(value))}
export function validateLaunchConfiguration(config:Configuration) {
  // Launch authorization uses a random host capability, never same-site cookies.
  const suffix=parse(config.contentBase,{allowPrivateDomains:true})
  if(suffix.domain!==config.contentBase && !(suffix.isPrivate && suffix.publicSuffix===config.contentBase))throw new GatewayError('invalid_gateway_configuration',503)
  validateGatewayConfiguration({...config,publicBase:'l-'+ 'a'.repeat(48)+'.'+config.contentBase,previewBase:'l-'+ 'a'.repeat(48)+'.'+config.contentBase})
  // l- + 48 hex characters + base must fit a DNS hostname (253 characters).
  if(config.contentBase.length>202)throw new GatewayError('invalid_gateway_configuration',503)
  return config
}
export function launchService(db:UploadRepository,configuration:Configuration,authorizeOnline?:OnlineLaunchAuthorizer,observe?:LaunchObserver) {
  const config=validateLaunchConfiguration(configuration)
  const phase=(value:LaunchPhase)=>{try{observe?.(value)}catch{/* Diagnostics cannot change authorization or lifecycle. */}}
  return {
    async create(actor:string|null,request:LaunchRequest):Promise<LaunchHandle> {
      if(!UUID.test(request.gameId) || !UUID.test(request.gameVersionId))throw new GatewayError('version_not_found',404)
      if(!['published','preview'].includes(request.audience) || !['local','online'].includes(request.execution))throw new GatewayError('invalid_launch_request',400)
      if((request.audience==='preview' || request.execution==='online') && !actor)throw new GatewayError('unauthorized',401)
      // Authorization before resolving private manifest/metadata.
      phase('version_authorization')
      await db.call('distribution_authorize_launch',{p_actor:actor,p_game:request.gameId,p_version:request.gameVersionId,p_audience:request.audience,p_execution:request.execution})
      phase('version_resolution')
      const version=await resolveGameVersion(request.gameVersionId,db)
      if(version.gameId!==request.gameId)throw new GatewayError('version_not_found',404)
      let context:SafeLaunchContext
      if(request.execution==='online') {
        phase('online_authorization')
        if(!authorizeOnline || !request.onlineSessionReference)throw new GatewayError('online_session_required',409)
        context=await authorizeOnline(actor!,request)
      } else context={gameId:request.gameId,gameVersionId:request.gameVersionId,execution:'local',locale:request.locale,participants:[]}
      if(!safeContext(context) || context.gameId!==request.gameId || context.gameVersionId!==request.gameVersionId || context.execution!==request.execution)throw new GatewayError('invalid_launch_context',503)
      const capacity=version.manifest.capabilities.online?.players
      if(request.execution==='online' && (!capacity || context.participants.length<capacity.min || context.participants.length>capacity.max))throw new GatewayError('invalid_launch_context',503)
      const capability=randomHex(24),control=randomHex(32)
      phase('launch_session_creation')
      const session=await db.call<LaunchRecord>('distribution_create_launch',{p_actor:actor,p_game:request.gameId,p_version:request.gameVersionId,
        p_audience:request.audience,p_execution:request.execution,p_capability_hash:await launchHash(capability),p_control_hash:await launchHash(control),
        p_context:context,p_seconds:RUNTIME_POLICY.sessionSeconds,p_actor_limit:RUNTIME_POLICY.maxIssuePerMinute,p_anonymous_limit:RUNTIME_POLICY.maxAnonymousPerMinute})
      if(!session || !UUID.test(session.id) || !UUID.test(session.generation) || session.version_id!==request.gameVersionId
        || !Number.isFinite(Date.parse(session.expires_at)))throw new GatewayError('invalid_launch_session',503)
      phase('artifact_gateway_resolution')
      const origin=`https://l-${capability}.${config.contentBase}`
      return {descriptor:{...launchDescriptor(version,request.execution,origin),launchId:session.id,generation:session.generation,
        expiresAt:session.expires_at,bridgeVersion:2,iframeProfile:version.policy.profile,context},controlToken:control}
    },
    async authorize(capability:string) {
      if(!/^[a-f0-9]{48}$/.test(capability))throw new GatewayError('launch_expired',403)
      return db.call<LaunchRecord>('distribution_check_launch',{p_capability_hash:await launchHash(capability)})
    },
    async release(id:string,control:string) {
      if(!UUID.test(id) || !/^[a-f0-9]{64}$/.test(control))throw new GatewayError('launch_expired',403)
      phase('launch_session_control')
      await db.call('distribution_revoke_launch',{p_id:id,p_control_hash:await launchHash(control)})
    },
    async renew(id:string,control:string):Promise<LaunchLease> {
      if(!UUID.test(id) || !/^[a-f0-9]{64}$/.test(control))throw new GatewayError('launch_expired',403)
      phase('launch_session_control')
      const session=await db.call<LaunchRecord>('distribution_renew_launch',{p_id:id,p_control_hash:await launchHash(control),p_seconds:RUNTIME_POLICY.sessionSeconds})
      return {launchId:session.id,generation:session.generation,expiresAt:session.expires_at}
    },
  }
}
