import { UploadError } from './policy'
import type { UploadRepository } from './contracts'

const statuses: Record<string,number> = {lobby_not_found:404,lobby_expired:410,lobby_full:409,not_ready:409,request_conflict:409,version_unavailable:409,deployment_unavailable:409,game_not_available:404,unsupported_access:400,rate_limited:429,invalid_request:400,unauthorized:401,forbidden:403,game_not_found:404,upload_not_found:404,
  upload_expired:410,invalid_state:409,version_conflict:409,idempotency_conflict:409,quota_exceeded:429,lease_lost:409,validation_failed:422,
  version_not_found:404,version_not_previewable:409,preview_forbidden:403,preview_expired:403,preview_replayed:409,unsupported_execution:400,
  launch_expired:403,invalid_launch_request:400,online_session_required:409,online_session_unavailable:409,invalid_online_roster:400,invalid_deployment:409,ticket_replayed:409,invalid_credential:401}
/** Backend-only capability. Never returned to a game/client. */
export function uploadRepository(url: string, serviceKey: string, fetcher: typeof fetch = fetch): UploadRepository {
  if (!url || !serviceKey || serviceKey.startsWith('sb_publishable_')) throw new UploadError('service_unavailable',503)
  return {async call<T>(name: string, args: Record<string,unknown>): Promise<T> {
    if (!/^distribution_[a-z_]+$/.test(name)) throw new UploadError('invalid_operation',500)
    try {
    const response = await fetcher(new URL('/rest/v1/rpc/'+name,url),{method:'POST',cache:'no-store',
      headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'},
      body:JSON.stringify(args),signal:AbortSignal.timeout(15_000)})
    if (!response.ok) {
      const data = await response.json().catch(()=>null)
      const code = data && typeof data.message==='string' && Object.hasOwn(statuses,data.message) ? data.message : 'database_error'
      throw new UploadError(code,statuses[code] ?? 503)
    }
    return response.status===204 ? undefined as T : await response.json() as T
    } catch(error) {if(error instanceof UploadError)throw error;throw new UploadError('database_error',503)}
  }}
}
