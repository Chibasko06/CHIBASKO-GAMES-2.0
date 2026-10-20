import type { UploadRepository, Upload } from '../../lib/game-distribution/uploads/contracts'
import type { DistributionR2 } from '../../lib/game-distribution/uploads/r2'
import { gameArtifactKeys } from '../../lib/game-distribution/keys'
import { assertUploadId, UploadError } from '../../lib/game-distribution/uploads/policy'

/** Durable outbox -> Queue. Duplicate delivery is expected and fenced by DB claim. */
export const DISPATCH_POLICY=Object.freeze({maxJobs:100,batchSize:20,concurrency:5,cycleMs:50_000,operationMs:10_000})
export async function dispatchUploads(db: UploadRepository, send: (id:string)=>Promise<unknown>,
  policy:Pick<typeof DISPATCH_POLICY,'cycleMs'|'operationMs'>=DISPATCH_POLICY) {
  if(!Number.isInteger(policy.cycleMs) || policy.cycleMs<1 || policy.cycleMs>DISPATCH_POLICY.cycleMs
    || !Number.isInteger(policy.operationMs) || policy.operationMs<1 || policy.operationMs>DISPATCH_POLICY.operationMs)throw new UploadError('dispatch_policy_invalid',503)
  const deadline=Date.now()+policy.cycleMs
  async function bounded<T>(operation:()=>Promise<T>):Promise<T> {
    let timer:ReturnType<typeof setTimeout>|undefined
    try {return await Promise.race([Promise.resolve().then(operation),new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>reject(new UploadError('dispatch_timeout',503)),policy.operationMs)
    })])}finally{clearTimeout(timer)}
  }
  let rows:unknown
  try {rows=await bounded(()=>db.call<unknown>('distribution_pending',{}))}
  catch {throw new UploadError('dispatch_pending_failed',503)}
  if(!Array.isArray(rows) || rows.length>DISPATCH_POLICY.maxJobs)throw new UploadError('dispatch_pending_invalid',503)
  const ids:string[]=[]
  try {for(const row of rows){if(typeof row?.id!=='string')throw new Error();assertUploadId(row.id);ids.push(row.id)}}
  catch {throw new UploadError('dispatch_pending_invalid',503)}
  const jobs=[...new Set(ids)],result={pending:jobs.length,dispatched:0,failed:0,deferred:0};let cursor=0
  await Promise.all(Array.from({length:Math.min(DISPATCH_POLICY.concurrency,jobs.length)},async()=>{
    while(cursor<Math.min(jobs.length,DISPATCH_POLICY.batchSize) && Date.now()<deadline) {
      const id=jobs[cursor++]
      try {
        // A late/ambiguous send never leads to a mark in this invocation. Retry may duplicate.
        await bounded(()=>send(id))
        await bounded(()=>db.call('distribution_dispatched',{p_id:id}))
        result.dispatched++
      }catch {result.failed++}
    }
  }))
  result.deferred=jobs.length-cursor
  return result
}
export async function cleanupUploads(db: UploadRepository, staging: Pick<DistributionR2,'abort'|'delete'>,
  artifacts: Pick<DistributionR2,'keys'|'delete'>,signal?:AbortSignal) {
  for(const upload of await db.call<Upload[]>('distribution_cleanup_candidates',{})) {
    signal?.throwIfAborted()
    // Failed jobs have no version row (completion is atomic). Successful files stay.
    if(upload.status!=='completed' && upload.checkpoint) {
      const prefix=gameArtifactKeys(upload.game_id,upload.version_id,upload.checkpoint.artifactSha256).prefix
      for await(const key of artifacts.keys(prefix)){signal?.throwIfAborted();await artifacts.delete(key)}
    }
    if(upload.multipart_id)await staging.abort(upload.staging_key,upload.multipart_id)
    signal?.throwIfAborted();await staging.delete(upload.staging_key)
    await db.call('distribution_cleaned',{p_id:upload.id})
  }
}
export class CloudflarePullQueue {
  private base: string
  constructor(account: string,queue: string,private token: string,private fetcher: typeof fetch=fetch) {
    if(!/^[a-f0-9]{32}$/.test(account) || !/^[a-f0-9]{32}$/.test(queue) || !token)throw new UploadError('service_unavailable',503)
    this.base=`https://api.cloudflare.com/client/v4/accounts/${account}/queues/${queue}/messages`
  }
  private async call(path: string,body: unknown,signal?:AbortSignal) {
    try {
    const response=await this.fetcher(this.base+path,{method:'POST',headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},
      body:JSON.stringify(body),redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30_000)]):AbortSignal.timeout(30_000)})
    const value=await response.json()
    if(!response.ok || value?.success!==true)throw new UploadError('queue_error',503)
    return value.result
    }catch {throw new UploadError('queue_error',503)}
  }
  async pull(signal?:AbortSignal) {
    const result=await this.call('/pull',{batch_size:1,visibility_timeout_ms:7_200_000},signal)
    if(!Array.isArray(result?.messages) || result.messages.length>1
      || result.messages.some((m:unknown)=>!m || typeof m!=='object' || !('lease_id' in m) || typeof m.lease_id!=='string' || !m.lease_id || !('body' in m)))throw new UploadError('queue_error',503)
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
