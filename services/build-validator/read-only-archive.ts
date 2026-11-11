import {mkdir,open,rename,chmod,unlink,mkdtemp,rm,readFile,lstat,statfs} from 'node:fs/promises'
import {createReadStream,createWriteStream} from 'node:fs'
import {pipeline} from 'node:stream/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {createHash} from 'node:crypto'
import {DistributionR2,r2EnvironmentReport,R2ConfigurationError} from '../../lib/game-distribution/uploads/r2'
import {assertUploadId,UPLOAD_POLICY} from '../../lib/game-distribution/uploads/policy'
import type {UploadPolicy} from '../../lib/game-distribution/uploads/policy'
import {isolatedExtract} from './job'
import {ExtractionFailure} from './extraction-diagnostics'
import {isBuildVersion} from '../../lib/game-distribution/version'

type ReadStorage=Pick<DistributionR2,'head'|'read'>
export {r2EnvironmentReport}
export {UPLOAD_POLICY}
export function readOnlyArchiveStorage(env:Record<string,string|undefined>,fetcher:typeof fetch=fetch):ReadStorage{
  const report=r2EnvironmentReport(env,'STAGING')
  if(report.missing.length||report.invalid.length)throw new R2ConfigurationError(report)
  const r2=new DistributionR2({accountId:env.GAME_BUILDS_R2_ACCOUNT_ID!,accessKeyId:env.GAME_BUILDS_R2_ACCESS_KEY_ID!,secretAccessKey:env.GAME_BUILDS_R2_SECRET_ACCESS_KEY!,bucket:env.GAME_BUILDS_STAGING_BUCKET!},async(input,init)=>{
    const request=input as Request
    if(!['HEAD','GET'].includes(request.method)||new URL(request.url).search)throw new Error('read_only_storage_required')
    return fetcher(request,init)
  })
  return Object.freeze({head:(key:string)=>r2.head(key),read:(key:string,etag:string,signal:AbortSignal)=>r2.read(key,etag,signal)})
}
export async function downloadReviewArchive(storage:ReadStorage,id:string,expectedSize:number,expectedEtag:string,directory:string,signal:AbortSignal){
  assertUploadId(id)
  if(!Number.isSafeInteger(expectedSize)||expectedSize<=0||expectedSize>UPLOAD_POLICY.maxArchiveBytes)throw new Error('invalid_archive_size')
  if(typeof expectedEtag!=='string'||!expectedEtag||expectedEtag.length>200||/[\r\n\0]/.test(expectedEtag))throw new Error('invalid_archive_etag')
  const key=`staging/uploads/${id}/source.zip`,metadata=await storage.head(key)
  if(!metadata)throw new Error('original_archive_not_found')
  if(metadata.size!==expectedSize||metadata.etag!==expectedEtag)throw new Error('original_archive_metadata_mismatch')
  signal.throwIfAborted()
  // Le dossier doit être nouveau : aucun ZIP existant ne peut être écrasé.
  await mkdir(directory,{mode:0o700})
  const partial=join(directory,'archive.zip.partial'),destination=join(directory,'archive.zip')
  const file=await open(partial,'wx',0o600);let bytes=0,complete=false
  try{
    const stream=await storage.read(key,metadata.etag,signal),reader=stream.getReader(),hash=createHash('sha256')
    try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break
      bytes+=value.byteLength;if(bytes>expectedSize)throw new Error('original_archive_size_mismatch')
      hash.update(value);let offset=0;while(offset<value.byteLength){const {bytesWritten}=await file.write(value,offset,value.byteLength-offset);offset+=bytesWritten}
    }}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
    if(bytes!==expectedSize)throw new Error('original_archive_size_mismatch')
    await file.close();await rename(partial,destination);await chmod(destination,0o400);complete=true
    return {uploadId:id,bytes,sha256:hash.digest('hex'),etag:metadata.etag}
  }finally{await file.close().catch(()=>{});if(!complete)await unlink(partial).catch(()=>{})}
}
async function inspectSource(source:string,size:number,signal:AbortSignal,destination?:string){
  const hash=createHash('sha256')
  let bytes=0
  const input=createReadStream(source,{signal})
  async function* checked(chunks:AsyncIterable<Buffer>){
    for await(const chunk of chunks){
      bytes+=chunk.length
      if(bytes>size)throw new Error('local_archive_changed_during_inspection')
      hash.update(chunk)
      yield chunk
    }
    if(bytes!==size)throw new Error('local_archive_changed_during_inspection')
  }
  if(destination)await pipeline(input,checked,createWriteStream(destination,{flags:'wx',mode:0o600}),{signal})
  else for await(const chunk of checked(input))void chunk
  return hash.digest('hex')
}

export async function inspectReviewArchive(archive:string,target:{gameId:string;version:string}|null,policy:UploadPolicy,signal:AbortSignal,childModule?:string){
  if(target){assertUploadId(target.gameId);if(!isBuildVersion(target.version))throw new Error('invalid_archive_command')}
  if(policy?.revision!==1)throw new Error('invalid_inspection_policy')
  for(const name of ['maxArchiveBytes','maxFileBytes','maxTotalBytes','maxFiles','maxManifestBytes','maxPathDepth','maxCompressionRatio','validationMs'] as const){
    if(!Number.isSafeInteger(policy[name])||policy[name]<=0||policy[name]>UPLOAD_POLICY[name])throw new Error('invalid_inspection_policy')
  }
  const source=resolve(archive),info=await lstat(source)
  if(!info.isFile()||info.isSymbolicLink()||info.size>policy.maxArchiveBytes)throw new Error('invalid_local_archive')
  const space=await statfs(tmpdir())
  if(space.bavail*space.bsize<info.size+3*1024**2+1024**3)throw new Error('inspection_disk_space_insufficient')
  const directory=await mkdtemp(join(tmpdir(),'chibasko-readonly-inspection-'))
  let before:string|undefined
  try{
    before=await inspectSource(source,info.size,signal,join(directory,'archive.zip'))
    const request=await open(join(directory,'request.json'),'wx',0o600)
    try{await request.writeFile(JSON.stringify({target,policy,spoolAssets:false}))}finally{await request.close()}
    try{
      await isolatedExtract(directory,policy.validationMs,signal,childModule)
      const {checkpoint}=JSON.parse(await readFile(join(directory,'result.json'),'utf8'))
      return {status:'valid',sourceSha256:before,checkpoint}
    }catch(error){if(error instanceof ExtractionFailure)return {status:'invalid_or_incomplete',sourceSha256:before,diagnostic:error.diagnostic};throw error}
  }finally{
    await rm(directory,{recursive:true,force:true,maxRetries:3})
    if(before&&!signal.aborted&&await inspectSource(source,info.size,signal)!==before)throw new Error('local_archive_changed_during_inspection')
  }
}
