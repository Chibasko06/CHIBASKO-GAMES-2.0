import { sha256 } from '../game-distribution/build'
import type { UploadRepository } from '../game-distribution/uploads/contracts'
import type { OnlineLaunchAuthorizer } from '../game-distribution/gateway/launch'
import { safeContext } from '../game-runtime/contracts'
import { OnlineSessionError, type GameStartContext, type TicketClaims } from './contracts'

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const hash=(value:string)=>sha256(new TextEncoder().encode(value))
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')
/** Browser destination validation, not an SSRF filter for outbound server requests. */
export function gameplayEndpoint(value:string):string {
 let url:URL
 try{url=new URL(value)}catch{throw new OnlineSessionError('invalid_deployment',503)}
 const host=url.hostname.toLowerCase()
 // Public DNS names only. IP literals and local names cannot enter production bootstrap.
 if(!['https:','wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || value.length>2048
  || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)
  || /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host))throw new OnlineSessionError('invalid_deployment',503)
 return url.href
}
export function onlineSessionService(db:UploadRepository) {
 const authorize:OnlineLaunchAuthorizer=async(actor,request)=>{
  const context=await db.call('distribution_online_context',{p_actor:actor,p_reference:request.onlineSessionReference,
   p_game:request.gameId,p_version:request.gameVersionId,p_locale:request.locale})
  if(!safeContext(context) || context.execution!=='online' || context.session?.localParticipantIds.length!==1)throw new OnlineSessionError('online_session_unavailable',409)
  return context
 }
 return {
  authorize,
  /** Return the credential once to the trusted provisioning process, never a game. */
  async createCredential(deploymentId:string,expiresAt:string){
   if(!uuid.test(deploymentId) || !Number.isFinite(Date.parse(expiresAt)))throw new OnlineSessionError('invalid_credential',400)
   const credential=random()
   const id=await db.call<string>('distribution_create_server_credential',{p_deployment:deploymentId,p_hash:await hash(credential),p_expires:expiresAt})
   return {id,credential,expiresAt}
  },
  revokeCredential(id:string){if(!uuid.test(id))throw new OnlineSessionError('invalid_credential',400);return db.call('distribution_revoke_server_credential',{p_id:id})},
  closeSession(id:string){if(!/^s_[a-f0-9]{32}$/.test(id))throw new OnlineSessionError('invalid_online_session',400);return db.call('distribution_close_online_session',{p_id:id})},
  removeParticipant(sessionId:string,participantId:string){
   if(!/^s_[a-f0-9]{32}$/.test(sessionId) || !/^p_[a-f0-9]{32}$/.test(participantId))throw new OnlineSessionError('invalid_online_session',400)
   return db.call('distribution_remove_online_participant',{p_session:sessionId,p_participant:participantId})
  },
  /** Trusted lobby adapter supplies the authenticated roster and selected deployment. */
  prepare(versionId:string,deploymentId:string,participants:readonly {actorId:string;displayName:string}[]) {
   if(!uuid.test(versionId) || !uuid.test(deploymentId) || participants.length<1 || participants.length>4096
    || participants.some(p=>!uuid.test(p.actorId) || typeof p.displayName!=='string'))throw new OnlineSessionError('invalid_online_roster',400)
   return db.call<string>('distribution_prepare_online_session',{p_version:versionId,p_deployment:deploymentId,p_participants:participants})
  },
  async start(launchId:string,controlToken:string,generation:string):Promise<GameStartContext> {
   if(!uuid.test(launchId) || !uuid.test(generation) || !/^[a-f0-9]{64}$/.test(controlToken))throw new OnlineSessionError('launch_expired',403)
   const ticket=random()
   const context=await db.call<Extract<GameStartContext,{execution:'online'}>>('distribution_issue_connection_ticket',{
    p_launch:launchId,p_control_hash:await hash(controlToken),p_generation:generation,p_ticket_hash:await hash(ticket)})
   const server=context.online.server
   return {execution:'online',online:{onlineSessionId:context.online.onlineSessionId,participantId:context.online.participantId,
    server:{endpoint:gameplayEndpoint(server.endpoint),expiresAt:server.expiresAt,ticket}}}
  },
  async exchange(credential:string,ticket:string,requestId:string):Promise<TicketClaims> {
   if(!/^[a-f0-9]{64}$/.test(credential))throw new OnlineSessionError('invalid_credential',401)
   if(!/^[a-f0-9]{64}$/.test(ticket) || !uuid.test(requestId))throw new OnlineSessionError('invalid_ticket',400)
   const result=await db.call<{data?:TicketClaims;error?:{code:string}}>('distribution_exchange_connection_ticket',{
    p_credential_hash:await hash(credential),p_ticket_hash:await hash(ticket),p_request:requestId})
   if(result.error){const code=result.error.code;throw new OnlineSessionError(code,code==='rate_limited'?429:code==='invalid_credential'?401:409)}
   if(!result.data)throw new OnlineSessionError('exchange_unavailable',503)
   return result.data
  },
 }
}
