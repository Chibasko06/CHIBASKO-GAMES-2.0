import { sha256 } from '../build'
import { UUID } from '../uploads/policy'
import type { UploadRepository } from '../uploads/contracts'
import { contentOrigin, launchDescriptor, resolveGameVersion, validateGatewayConfiguration } from './resolver'
import { GatewayError, PREVIEW_POLICY, type Execution, type GatewayConfiguration, type PreviewRecord } from './contracts'

export function opaquePreviewToken() {
  const bytes=crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')
}
export async function previewTokenHash(token:string) {
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new GatewayError('preview_expired',403)
  return sha256(new TextEncoder().encode(token))
}
export function previewService(db:UploadRepository,configuration:GatewayConfiguration) {
  const config=validateGatewayConfiguration(configuration)
  return {
    async issue(actor:string,versionId:string,execution:Execution) {
      if(!UUID.test(versionId))throw new GatewayError('version_not_found',404)
      if(!['local','online'].includes(execution))throw new GatewayError('unsupported_execution',400)
      const ticket=opaquePreviewToken(),ticketHash=await previewTokenHash(ticket)
      // Authorize before resolving manifest or exposing any private metadata.
      const session=await db.call<PreviewRecord>('distribution_issue_preview',{p_actor:actor,p_version:versionId,p_execution:execution,p_ticket_hash:ticketHash,
        p_ticket_seconds:PREVIEW_POLICY.ticketSeconds,p_session_seconds:PREVIEW_POLICY.sessionSeconds,p_limit:PREVIEW_POLICY.maxIssuePerMinute})
      const version=await resolveGameVersion(versionId,db),origin=contentOrigin(config,'preview',session.id)
      return {launch:launchDescriptor(version,execution,origin),preview:{method:'POST',action:origin+'/_preview/exchange',
        fields:{ticket},expiresAt:session.expires_at,ticketExpiresIn:PREVIEW_POLICY.ticketSeconds}}
    },
    async exchange(sessionId:string,ticket:string) {
      const cookie=opaquePreviewToken()
      const session=await db.call<PreviewRecord>('distribution_exchange_preview',{p_session:sessionId,p_ticket_hash:await previewTokenHash(ticket),p_cookie_hash:await previewTokenHash(cookie)})
      const version=await resolveGameVersion(session.version_id,db)
      return {cookie,session,launch:launchDescriptor(version,session.execution,contentOrigin(config,'preview',sessionId))}
    },
    async authorize(sessionId:string,cookie:string) {
      return db.call<PreviewRecord>('distribution_check_preview',{p_session:sessionId,p_cookie_hash:await previewTokenHash(cookie)})
    },
  }
}
