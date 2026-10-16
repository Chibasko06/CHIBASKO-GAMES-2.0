import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { spawn } from 'node:child_process'
import type { UploadRepository, Upload, Checkpoint } from '../../lib/game-distribution/uploads/contracts'
import { gameArtifactKeys } from '../../lib/game-distribution/keys'
import { artifactMedia } from '../../lib/game-distribution/paths'
import { UploadError } from '../../lib/game-distribution/uploads/policy'
import type { DistributionR2 } from '../../lib/game-distribution/uploads/r2'
import { hashFile } from './extract'

type Storage = Pick<DistributionR2,'read'|'bucket'|'metadata'>
export async function isolatedExtract(directory: string, milliseconds: number, signal: AbortSignal, childModule=join(import.meta.dirname,'child.mjs')) {
  await new Promise<void>((accept,reject)=>{
    const child=spawn(process.execPath,['--max-old-space-size=384','--permission','--allow-fs-read='+childModule,
      '--allow-fs-read='+directory,'--allow-fs-write='+directory,childModule,directory],
      {env:{NODE_ENV:'production',PATH:process.env.PATH ?? '',SYSTEMROOT:process.env.SYSTEMROOT ?? '',TEMP:directory,TMP:directory},windowsHide:true,stdio:'ignore',signal})
    let timedOut=false
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL')},milliseconds)
    child.once('error',error=>{clearTimeout(timer);reject(error)})
    child.once('exit',code=>{clearTimeout(timer);if(code===0)accept();else reject(new UploadError(timedOut?'validation_timeout':'validation_failed',422))})
  })
}
/** One fenced job; all heavy work is asynchronous outside any portal request. */
export async function processUpload(id: string, db: UploadRepository, staging: Storage, artifacts: Storage,
  extract=isolatedExtract) {
  const upload=await db.call<Upload|null>('distribution_claim',{p_id:id})
  if(!upload?.id)return
  const root=resolve(tmpdir()), directory=await mkdtemp(join(root,'chibasko-build-'))
  const signal=AbortSignal.timeout(upload.policy.jobSeconds*1000)
  try {
    const stream=await staging.read(upload.staging_key,(upload as Upload & {staging_etag:string}).staging_etag,signal)
    const archive=await import('node:fs/promises').then(fs=>fs.open(join(directory,'archive.zip'),'wx',0o600))
    let total=0
    try {
      for await(const bytes of Readable.fromWeb(stream as import('node:stream/web').ReadableStream<Uint8Array>)) {
        signal.throwIfAborted();total+=bytes.length
        if(total>upload.expected_size || total>upload.policy.maxArchiveBytes)throw new UploadError('validation_failed',422)
        let offset=0
        while(offset<bytes.length){const {bytesWritten}=await archive.write(bytes,offset,bytes.length-offset);offset+=bytesWritten}
      }
    } catch(error) {if(error instanceof UploadError)throw error;throw new UploadError('storage_error',503)}
    finally {await archive.close()}
    if(total!==upload.expected_size)throw new UploadError('validation_failed',422)
    await writeFile(join(directory,'request.json'),JSON.stringify({target:{gameId:upload.game_id,version:upload.version},policy:upload.policy}),{mode:0o600})
    await extract(directory,upload.policy.validationMs,signal)
    const {checkpoint,spools}: {checkpoint:Checkpoint;spools:{path:string;spool:string}[]}=JSON.parse(await readFile(join(directory,'result.json'),'utf8'))
    const summary={manifest:checkpoint.manifest,artifactSha256:checkpoint.artifactSha256,artifactSize:checkpoint.artifactSize,
      archiveSha256:checkpoint.archiveSha256,archiveSize:checkpoint.archiveSize,fileCount:checkpoint.files.length}
    await db.call('distribution_checkpoint',{p_id:id,p_lease:upload.lease_token,p_checkpoint:summary})
    const keys=gameArtifactKeys(upload.game_id,upload.version_id,checkpoint.artifactSha256), bucket=artifacts.bucket(signal)
    async function put(key: string,size: number,sha256: string,makeBody: ()=>Uint8Array | ReadableStream<Uint8Array>, media={contentType:'application/octet-stream'} as {contentType:string;contentEncoding?:'gzip'|'br'}) {
      signal.throwIfAborted()
      const old=await artifacts.metadata(key)
      if(old){if(old.size!==size || old.sha256!==sha256)throw new UploadError('artifact_conflict',409);return}
      const body=makeBody()
      try {
        const stored=await bucket.put(key,body,{onlyIf:new Headers({'If-None-Match':'*'}),httpMetadata:{...media,cacheControl:'no-store'},customMetadata:{sha256,size:String(size)}})
        if(stored===null){const existing=await artifacts.metadata(key);if(existing?.sha256!==sha256 || existing.size!==size)throw new UploadError('artifact_conflict',409)}
      } finally {if(body instanceof ReadableStream && !body.locked)await body.cancel().catch(()=>{})}
    }
    for(const file of checkpoint.files) {
      const spool=spools.find(s=>s.path===file.path)?.spool
      if(!spool || !/^\d+\.bin$/.test(spool))throw new UploadError('validation_failed',422)
      const path=join(directory,spool)
      if(await hashFile(path)!==file.sha256)throw new UploadError('validation_failed',422)
      await put(keys.file(file.path),file.size,file.sha256,()=>Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>,artifactMedia(file.path))
    }
    await put(keys.archive(checkpoint.archiveSha256),checkpoint.archiveSize,checkpoint.archiveSha256,
      ()=>Readable.toWeb(createReadStream(join(directory,'archive.zip'))) as ReadableStream<Uint8Array>,{contentType:'application/zip'})
    const inventory=new TextEncoder().encode(JSON.stringify(checkpoint))
    const hash=(await import('node:crypto')).createHash('sha256').update(inventory).digest('hex')
    // Inventory is written last; DB completion is possible only after every object.
    await put(keys.inventoryKey,inventory.length,hash,()=>inventory,{contentType:'application/json'})
    return await db.call<Upload>('distribution_complete',{p_id:id,p_lease:upload.lease_token})
  } catch(error) {
    const code=signal.aborted?'validation_timeout':error instanceof UploadError?error.code:'validation_failed'
    await db.call('distribution_fail',{p_id:id,p_lease:upload.lease_token,p_code:code,
      p_retry:['storage_error','database_error','service_unavailable','validation_timeout'].includes(code)})
  } finally {
    const target=resolve(directory)
    if(!target.startsWith(root+sep) || !target.slice(root.length+1).startsWith('chibasko-build-'))throw new Error('Unsafe scratch cleanup')
    await rm(target,{recursive:true,force:true,maxRetries:3,retryDelay:100})
  }
}
