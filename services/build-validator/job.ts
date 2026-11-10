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
import {R2RequestError,type R2Failure} from '../../lib/game-distribution/uploads/r2'
import { hashFile } from './extract'
import {ExtractionFailure,extractionDiagnostic} from './extraction-diagnostics'
import {parseValidationDiagnostic,type ValidationDiagnostic} from '../../lib/game-distribution/validation-diagnostics'

type Storage = Pick<DistributionR2,'read'|'bucket'|'metadata'>
export type JobFailure={phase:'scratch'|'download'|'extract'|'checkpoint'|'artifacts'|'complete';code:string;r2?:R2Failure;reason?:'scratch_space_insufficient';diagnostic?:ValidationDiagnostic}
export async function isolatedExtract(directory: string, milliseconds: number, signal: AbortSignal, childModule=join(import.meta.dirname,'child.mjs')) {
  signal.throwIfAborted()
  await new Promise<void>((accept,reject)=>{
    const child=spawn(process.execPath,['--max-old-space-size=384','--permission','--allow-fs-read='+childModule,
      '--allow-fs-read='+directory,'--allow-fs-write='+directory,childModule,directory],
      {env:{NODE_ENV:'production',PATH:process.env.PATH ?? '',SYSTEMROOT:process.env.SYSTEMROOT ?? '',TEMP:directory,TMP:directory},windowsHide:true,stdio:'ignore'})
    let timedOut=false,spawnFailed=false
    const abort=()=>{child.kill('SIGKILL')}
    signal.addEventListener('abort',abort,{once:true})
    if(signal.aborted)abort()
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL')},milliseconds)
    child.once('error',()=>{spawnFailed=true})
    // Wait for process/stdio closure before deleting scratch, including cancellation.
    child.once('close',async code=>{clearTimeout(timer);signal.removeEventListener('abort',abort)
      if(code===0 && !signal.aborted && !spawnFailed){accept();return}
      const timeout=timedOut||signal.aborted
      let diagnostic:ValidationDiagnostic={version:1,kind:timeout?'unknown':'internal',reason:timeout?'EXTRACTOR_TIMEOUT':spawnFailed?'EXTRACTOR_START_FAILED':'EXTRACTOR_EXITED'}
      if(!timeout&&!spawnFailed){
        try{
          const path=join(directory,'failure.json'),info=await import('node:fs/promises').then(fs=>fs.lstat(path))
          if(info.isFile()&&!info.isSymbolicLink()&&info.size<=4096)diagnostic=parseValidationDiagnostic(JSON.parse(await readFile(path,'utf8')))??diagnostic
        }catch{/* Un arrêt avant le gestionnaire d'erreur peut ne laisser aucun diagnostic. */}
      }
      reject(new ExtractionFailure(diagnostic,timeout))})
  })
}
/** One fenced job; all heavy work is asynchronous outside any portal request. */
export async function processUpload(id: string, db: UploadRepository, staging: Storage, artifacts: Storage,
  extract=isolatedExtract,options:{signal?:AbortSignal;scratchRoot?:string;retryTransient?:boolean;onFailure?:(failure:JobFailure)=>void}={}) {
  options.signal?.throwIfAborted()
  const upload=await db.call<Upload|null>('distribution_claim',{p_id:id})
  if(!upload?.id)return
  const root=resolve(options.scratchRoot ?? tmpdir());let directory=''
  const timeout=AbortSignal.timeout(upload.policy.jobSeconds*1000)
  const signal=options.signal?AbortSignal.any([timeout,options.signal]):timeout
  let phase:JobFailure['phase']='scratch',reason:JobFailure['reason']
  try {
    signal.throwIfAborted()
    await db.call('distribution_validation_start',{p_id:id,p_lease:upload.lease_token})
    if(upload.id!==id || upload.staging_key!==`staging/uploads/${id}/source.zip` || !upload.staging_etag)throw new UploadError('validation_failed',422)
    if(options.scratchRoot) {
      const space=await import('node:fs/promises').then(fs=>fs.statfs(root))
      if(space.bavail*space.bsize<upload.expected_size+upload.policy.maxTotalBytes+1024**3){reason='scratch_space_insufficient';throw new UploadError('storage_error',503)}
    }
    directory=await mkdtemp(join(root,'chibasko-build-'))
    phase='download'
    const stream=await staging.read(upload.staging_key,(upload as Upload & {staging_etag:string}).staging_etag,signal)
    const archive=await import('node:fs/promises').then(fs=>fs.open(join(directory,'archive.zip'),'wx',0o600))
    let total=0
    try {
      for await(const bytes of Readable.fromWeb(stream as import('node:stream/web').ReadableStream<Uint8Array>,{signal})) {
        signal.throwIfAborted();total+=bytes.length
        if(total>upload.expected_size || total>upload.policy.maxArchiveBytes)throw new UploadError('validation_failed',422)
        let offset=0
        while(offset<bytes.length){const {bytesWritten}=await archive.write(bytes,offset,bytes.length-offset);offset+=bytesWritten}
      }
    } catch(error) {if(error instanceof UploadError)throw error;throw new UploadError('storage_error',503)}
    finally {await archive.close()}
    if(total!==upload.expected_size)throw new UploadError('validation_failed',422)
    await writeFile(join(directory,'request.json'),JSON.stringify({target:{gameId:upload.game_id,version:upload.version},policy:upload.policy}),{mode:0o600})
    phase='extract'
    await extract(directory,upload.policy.validationMs,signal)
    let result:{checkpoint:Checkpoint;spools:{path:string;spool:string}[]}
    try{result=JSON.parse(await readFile(join(directory,'result.json'),'utf8'))
      if(!result?.checkpoint||!Array.isArray(result.spools))throw new Error('invalid_result')
    }catch{throw new ExtractionFailure({version:1,kind:'internal',reason:'EXTRACTOR_RESULT_INVALID'})}
    const {checkpoint,spools}=result
    const summary={manifest:checkpoint.manifest,artifactSha256:checkpoint.artifactSha256,artifactSize:checkpoint.artifactSize,
      archiveSha256:checkpoint.archiveSha256,archiveSize:checkpoint.archiveSize,fileCount:checkpoint.files.length}
    signal.throwIfAborted()
    phase='checkpoint'
    await db.call('distribution_checkpoint',{p_id:id,p_lease:upload.lease_token,p_checkpoint:summary})
    phase='artifacts'
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
    signal.throwIfAborted()
    phase='complete'
    return await db.call<Upload>('distribution_validation_complete',{p_id:id,p_lease:upload.lease_token})
  } catch(error) {
    const code=signal.aborted?'validation_timeout':error instanceof UploadError?error.code:'validation_failed'
    const base=error instanceof ExtractionFailure?error.diagnostic:error instanceof R2RequestError||code==='storage_error'?{version:1 as const,kind:'infrastructure' as const,reason:reason==='scratch_space_insufficient'?'SCRATCH_SPACE_INSUFFICIENT' as const:'STORAGE_UNAVAILABLE' as const}:
      code==='database_error'?{version:1 as const,kind:'infrastructure' as const,reason:'DATABASE_UNAVAILABLE' as const}:code==='artifact_conflict'?{version:1 as const,kind:'internal' as const,reason:'ARTIFACT_CONFLICT' as const}:
      phase==='extract'?extractionDiagnostic(error):{version:1 as const,kind:'unknown' as const,reason:'VALIDATOR_ERROR' as const}
    const diagnostic:ValidationDiagnostic={...base,phase}
    try{options.onFailure?.({phase,code,...(reason?{reason}:{}),...(error instanceof R2RequestError?{r2:error.diagnostic}:{}),...(diagnostic?{diagnostic}:{})})}catch{/* Diagnostics must not affect the persisted failure or retries. */}
    if(code==='lease_lost')throw error
    await db.call('distribution_validation_fail',{p_id:id,p_lease:upload.lease_token,p_code:code,p_phase:phase,p_diagnostic:diagnostic,
      p_retry:options.retryTransient!==false&&['storage_error','database_error','service_unavailable','validation_timeout'].includes(code)})
    if(options.signal?.aborted)throw new UploadError('validator_stopping',503)
  } finally {
    if(directory) {
    const target=resolve(directory)
    if(!target.startsWith(root+sep) || !target.slice(root.length+1).startsWith('chibasko-build-'))throw new Error('Unsafe scratch cleanup')
    await rm(target,{recursive:true,force:true,maxRetries:3,retryDelay:100})
    }
  }
}
