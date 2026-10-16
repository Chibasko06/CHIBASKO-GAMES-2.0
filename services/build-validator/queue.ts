import type { UploadRepository, Upload } from '../../lib/game-distribution/uploads/contracts'
import type { DistributionR2 } from '../../lib/game-distribution/uploads/r2'
import { gameArtifactKeys } from '../../lib/game-distribution/keys'
import { assertUploadId, UploadError } from '../../lib/game-distribution/uploads/policy'

/** Durable outbox -> Queue. Duplicate delivery is expected and fenced by DB claim. */
export async function dispatchUploads(db: UploadRepository, send: (id:string)=>Promise<void>) {
  for(const upload of await db.call<Upload[]>('distribution_pending',{})) {
    await send(upload.id)
    await db.call('distribution_dispatched',{p_id:upload.id})
  }
}
export async function cleanupUploads(db: UploadRepository, staging: Pick<DistributionR2,'abort'|'delete'>,
  artifacts: Pick<DistributionR2,'keys'|'delete'>) {
  for(const upload of await db.call<Upload[]>('distribution_cleanup_candidates',{})) {
    // Failed jobs have no version row (completion is atomic). Successful files stay.
    if(upload.status!=='completed' && upload.checkpoint) {
      const prefix=gameArtifactKeys(upload.game_id,upload.version_id,upload.checkpoint.artifactSha256).prefix
      for await(const key of artifacts.keys(prefix))await artifacts.delete(key)
    }
    if(upload.multipart_id)await staging.abort(upload.staging_key,upload.multipart_id)
    await staging.delete(upload.staging_key)
    await db.call('distribution_cleaned',{p_id:upload.id})
  }
}
export class CloudflarePullQueue {
  private base: string
  constructor(account: string,queue: string,private token: string,private fetcher: typeof fetch=fetch) {
    if(!/^[a-f0-9]{32}$/.test(account) || !/^[a-f0-9]{32}$/.test(queue) || !token)throw new UploadError('service_unavailable',503)
    this.base=`https://api.cloudflare.com/client/v4/accounts/${account}/queues/${queue}/messages`
  }
  private async call(path: string,body: unknown) {
    const response=await this.fetcher(this.base+path,{method:'POST',headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(30_000)})
    const value=await response.json()
    if(!response.ok || !value.success)throw new UploadError('queue_error',503)
    return value.result
  }
  async pull() {
    const result=await this.call('/pull',{batch_size:1,visibility_timeout_ms:7_200_000})
    return result.messages as {body:unknown;lease_id:string}[]
  }
  async acknowledge(lease: string,retry=false) {
    await this.call('/ack',{acks:retry?[]:[{lease_id:lease}],retries:retry?[{lease_id:lease,delay_seconds:60}]:[]})
  }
}
export function messageUploadId(body: unknown) {
  const data=typeof body==='string'?JSON.parse(body):body
  if(!data || typeof data!=='object' || Object.keys(data).length!==2 || data.type!=='validate_game_build' || typeof data.uploadId!=='string')throw new UploadError('invalid_queue_message')
  assertUploadId(data.uploadId);return data.uploadId as string
}
