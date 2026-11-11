import { open, readFile, writeFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { Reader, ZipReader } from '@zip.js/zip.js'
import { inspectZipEntries } from '../../lib/game-distribution/zip'
import { validateManifest, BuildValidationError } from '../../lib/game-distribution/manifest'
import { artifactMedia } from '../../lib/game-distribution/paths'
import type { UploadPolicy } from '../../lib/game-distribution/uploads/policy'
import type { UploadTarget, ArtifactFile } from '../../lib/game-distribution/types'
import {integrationScanner} from './integration-scan'

class DiskReader extends Reader<string> {
  constructor(private path: string, size: number) { super(path); this.size=size }
  async readUint8Array(index: number,length: number) {
    if(index<0 || length<0 || !Number.isSafeInteger(index+length))throw new BuildValidationError('INVALID_OR_UNSAFE_ARCHIVE')
    const file=await open(this.path,'r')
    try { const buffer=new Uint8Array(Math.min(length,this.size-index));const {bytesRead}=await file.read(buffer,0,buffer.length,index);return buffer.subarray(0,bytesRead) }
    finally {await file.close()}
  }
}
export async function hashFile(path: string) {
  const hash=createHash('sha256');for await(const bytes of createReadStream(path))hash.update(bytes)
  return hash.digest('hex')
}
/** Untrusted filenames never become filesystem paths: spool files use ordinal IDs. */
export async function extractBuild(archive: string, directory: string, target: UploadTarget|null, policy: UploadPolicy,spoolAssets=true) {
  const archiveSize=(await stat(archive)).size
  if(archiveSize>policy.maxArchiveBytes)throw new BuildValidationError('ARCHIVE_SIZE_LIMIT')
  const reader=new ZipReader(new DiskReader(archive,archiveSize),{strictness:'strict',useWebWorkers:false,
    checkCrc32:true,checkOverlappingEntry:true,checkLocalFilename:true})
  try {
    const entries=await inspectZipEntries(reader,policy,policy.maxPathDepth)
    const manifestEntry=entries.find(entry=>entry.filename==='chibasko.json')
    if(!manifestEntry || manifestEntry.uncompressedSize>policy.maxManifestBytes)throw new BuildValidationError('ROOT_MANIFEST_REQUIRED')
    const manifestChunks:Uint8Array[]=[];let manifestSize=0
    await manifestEntry.getData(new WritableStream<Uint8Array>({write(bytes){manifestSize+=bytes.length;if(manifestSize>policy.maxManifestBytes)throw new BuildValidationError('ROOT_MANIFEST_REQUIRED');manifestChunks.push(bytes)}}))
    let json:unknown
    try{json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(manifestChunks)))}catch{throw new BuildValidationError('INVALID_MANIFEST_JSON',{path:'chibasko.json'})}
    const declared=json&&typeof json==='object'&&!Array.isArray(json)?json as Record<string,unknown>:{}
    const manifest=validateManifest(json,target??{gameId:declared.gameId as string,version:declared.version as string})
    const kept=new Set(['chibasko.json',...Object.values(manifest.client.entrypoints)])
    const files: (ArtifactFile & {spool:string})[]=[],scan=integrationScanner();let total=0
    for(const [index,entry] of entries.entries()) {
      const scanBytes=scan.file(entry.filename)
      const spool=String(index)+'.bin', file=spoolAssets||kept.has(entry.filename)?await open(join(directory,spool),'wx',0o600):null, hash=createHash('sha256');let size=0
      try {
        await entry.getData(new WritableStream<Uint8Array>({async write(bytes) {
          size+=bytes.length;total+=bytes.length
          if(size>entry.uncompressedSize || size>policy.maxFileBytes || total>policy.maxTotalBytes)throw new BuildValidationError('ARCHIVE_EXPANSION_LIMIT',{path:entry.filename})
          hash.update(bytes)
          scanBytes(bytes)
          let offset=0
          while(file&&offset<bytes.length) {const written=await file.write(bytes,offset,bytes.length-offset);offset+=written.bytesWritten}
        }}))
      } finally {await file?.close()}
      if(size!==entry.uncompressedSize)throw new BuildValidationError('ARCHIVE_SIZE_MISMATCH',{path:entry.filename})
      files.push({path:entry.filename,size,sha256:hash.digest('hex'),...artifactMedia(entry.filename),spool})
    }
    for(const path of Object.values(manifest.client.entrypoints)) {
      const entry=files.find(f=>f.path===path)
      if(!entry || !entry.size || entry.size>1024*1024)throw new BuildValidationError('ENTRYPOINT_MISSING',{path})
      try{new TextDecoder('utf-8',{fatal:true}).decode(await readFile(join(directory,entry.spool)))}catch{throw new BuildValidationError('ENTRYPOINT_INVALID_UTF8',{path})}
    }
    files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)
    const inventory=files.map(({path,size,sha256,contentType,contentEncoding})=>({path,size,sha256,contentType,...(contentEncoding?{contentEncoding}:{})}))
    const artifactSha256=createHash('sha256').update(JSON.stringify(inventory.map(({path,size,sha256})=>({path,size,sha256})))).digest('hex')
    return {checkpoint:{manifest,files:inventory,artifactSha256,artifactSize:total,archiveSize,archiveSha256:await hashFile(archive),integrationScan:scan.result()},spools:files.filter(file=>spoolAssets||kept.has(file.path)).map(({path,spool})=>({path,spool}))}
  } finally {await reader.close()}
}
// This module is bundled separately; importing it in tests never starts a process.
export async function extractCommand(directory: string) {
  const {target,policy,spoolAssets}=JSON.parse(await readFile(join(directory,'request.json'),'utf8'))
  if(!target&&spoolAssets!==false)throw new Error('invalid_extractor_request')
  const result=await extractBuild(join(directory,'archive.zip'),directory,target??null,policy,spoolAssets!==false)
  await writeFile(join(directory,'result.json'),JSON.stringify(result),{flag:'wx',mode:0o600})
}
