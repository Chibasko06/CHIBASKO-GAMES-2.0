import { UploadError } from './policy'
import type { UploadRepository } from './contracts'

const statuses: Record<string,number> = {moderation_scope_disabled:503,moderation_target_not_allowed:403,account_restricted:403,account_deletion_pending:409,last_admin:409,account_not_found:404,asset_retired:409,developer_profile_required:409,draft_not_found:404,draft_conflict:409,draft_submitted:409,lobby_not_found:404,lobby_expired:410,lobby_full:409,not_ready:409,request_conflict:409,version_unavailable:409,deployment_unavailable:409,game_not_available:404,unsupported_access:400,rate_limited:429,invalid_request:400,unauthorized:401,forbidden:403,game_not_found:404,upload_not_found:404,
  upload_expired:410,invalid_state:409,version_conflict:409,idempotency_conflict:409,quota_exceeded:429,lease_lost:409,validation_failed:422,
  version_not_found:404,version_not_previewable:409,preview_forbidden:403,preview_expired:403,preview_replayed:409,unsupported_execution:400,
  launch_expired:403,invalid_launch_request:400,online_session_required:409,online_session_unavailable:409,invalid_online_roster:400,invalid_deployment:409,ticket_replayed:409,invalid_credential:401}
/** Backend-only capability. Never returned to a game/client. */
export type RpcDiagnostic = {
  event: 'distribution_rpc_failed'; requestId: string; operation: string; durationMs: number
  kind: 'http_error' | 'timeout' | 'network_error' | 'invalid_response'
  upstreamStatus?: number; upstreamCode?: string
  permissionDenied?: { kind: string; object: string }
}
type RepositoryOptions = {requestId?: string; log?: (event: RpcDiagnostic) => void}
function permissionDenied(message: unknown): RpcDiagnostic['permissionDenied'] {
  if (typeof message !== 'string') return undefined
  const match = /^permission denied for (schema|table|function|sequence) ([a-z_][a-z0-9_]*)$/.exec(message)
  const objects = ['auth','public','users','games','admin_users','game_developer_members','game_build_uploads','game_submissions','game_versions','game_build_reviews']
  return match && objects.includes(match[2]) ? {kind:match[1],object:match[2]} : undefined
}
export function uploadRepository(url: string, serviceKey: string, fetcher: typeof fetch = fetch, options: RepositoryOptions = {}): UploadRepository {
  if (!url || !serviceKey || serviceKey.startsWith('sb_publishable_')) throw new UploadError('service_unavailable',503)
  return {async call<T>(name: string, args: Record<string,unknown>): Promise<T> {
    if (!/^distribution_[a-z_]+$/.test(name) && !['contact_reserve','contact_finish','contact_cleanup'].includes(name)) throw new UploadError('invalid_operation',500)
    const started = Date.now(), signal = AbortSignal.timeout(15_000)
    let received = false
    const record = (details: Pick<RpcDiagnostic,'kind'|'upstreamStatus'|'upstreamCode'|'permissionDenied'>) => {
      // Upstream messages, request bodies and transport exceptions can contain private data.
      const event: RpcDiagnostic = {event:'distribution_rpc_failed',requestId:options.requestId ?? crypto.randomUUID(),operation:name,durationMs:Date.now()-started,...details}
      try {(options.log ?? (entry => console.error(JSON.stringify(entry))))(event)} catch {/* Diagnostics must not change RPC semantics. */}
    }
    try {
    const response = await fetcher(new URL('/rest/v1/rpc/'+name,url),{method:'POST',cache:'no-store',
      headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'},
      body:JSON.stringify(args),signal})
    received = true
    if (!response.ok) {
      const data = await response.json().catch(()=>null)
      const code = data && typeof data.message==='string' && Object.hasOwn(statuses,data.message) ? data.message : 'database_error'
      if (code === 'database_error') record({kind:'http_error',upstreamStatus:response.status,
        upstreamCode:typeof data?.code==='string' && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(data.code) ? data.code : undefined,
        permissionDenied:permissionDenied(data?.message)})
      throw new UploadError(code,statuses[code] ?? 503)
    }
    return response.status===204 ? undefined as T : await response.json() as T
    } catch(error) {
      if(error instanceof UploadError)throw error
      record({kind:signal.aborted ? 'timeout' : received ? 'invalid_response' : 'network_error'})
      throw new UploadError('database_error',503)
    }
  }}
}
