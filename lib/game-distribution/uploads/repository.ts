import { UploadError } from './policy'
import type { UploadRepository } from './contracts'

const statuses: Record<string,number> = {unauthorized:401,forbidden:403,game_not_found:404,upload_not_found:404,
  upload_expired:410,invalid_state:409,version_conflict:409,idempotency_conflict:409,quota_exceeded:429,lease_lost:409,validation_failed:422}
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
