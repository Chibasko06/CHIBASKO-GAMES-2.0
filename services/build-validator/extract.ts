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
export async function extractBuild(archive: string, directory: string, target: UploadTarget, policy: UploadPolicy) {
  const archiveSize=(await stat(archive)).size
  if(archiveSize>policy.maxArchiveBytes)throw new BuildValidationError('ARCHIVE_SIZE_LIMIT')
  const reader=new ZipReader(new DiskReader(archive,archiveSize),{strictness:'strict',useWebWorkers:false,
    checkCrc32:true,checkOverlappingEntry:true,checkLocalFilename:true})
  try {
    const entries=await inspectZipEntries(reader,policy,policy.maxPathDepth)
    const manifestEntry=entries.find(entry=>entry.filename==='chibasko.json')
    if(!manifestEntry || manifestEntry.uncompressedSize>policy.maxManifestBytes)throw new BuildValidationError('ROOT_MANIFEST_REQUIRED')
    const files: (ArtifactFile & {spool:string})[]=[];let total=0
    for(const [index,entry] of entries.entries()) {
      const spool=String(index)+'.bin', file=await open(join(directory,spool),'wx',0o600), hash=createHash('sha256');let size=0
      try {
        await entry.getData(new WritableStream<Uint8Array>({async write(bytes) {
          size+=bytes.length;total+=bytes.length
          if(size>entry.uncompressedSize || size>policy.maxFileBytes || total>policy.maxTotalBytes)throw new BuildValidationError('ARCHIVE_EXPANSION_LIMIT')
          hash.update(bytes)
          let offset=0
          while(offset<bytes.length) {const written=await file.write(bytes,offset,bytes.length-offset);offset+=written.bytesWritten}
        }}))
      } finally {await file.close()}
      if(size!==entry.uncompressedSize)throw new BuildValidationError('ARCHIVE_SIZE_MISMATCH')
      files.push({path:entry.filename,size,sha256:hash.digest('hex'),...artifactMedia(entry.filename),spool})
    }
    const manifestFile=files.find(f=>f.path==='chibasko.json')!
    let json:unknown
    try {json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readFile(join(directory,manifestFile.spool))))}
    catch {throw new BuildValidationError('INVALID_MANIFEST_JSON')}
    const manifest=validateManifest(json,target)
    for(const path of Object.values(manifest.client.entrypoints)) {
      const entry=files.find(f=>f.path===path)
      if(!entry || !entry.size || entry.size>1024*1024)throw new BuildValidationError('ENTRYPOINT_MISSING')
      try{new TextDecoder('utf-8',{fatal:true}).decode(await readFile(join(directory,entry.spool)))}catch{throw new BuildValidationError('ENTRYPOINT_INVALID_UTF8')}
    }
    files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)
    const inventory=files.map(({path,size,sha256,contentType,contentEncoding})=>({path,size,sha256,contentType,...(contentEncoding?{contentEncoding}:{})}))
    const artifactSha256=createHash('sha256').update(JSON.stringify(inventory.map(({path,size,sha256})=>({path,size,sha256})))).digest('hex')
    return {checkpoint:{manifest,files:inventory,artifactSha256,artifactSize:total,archiveSize,archiveSha256:await hashFile(archive)},spools:files.map(({path,spool})=>({path,spool}))}
  } finally {await reader.close()}
}
// This module is bundled separately; importing it in tests never starts a process.
export async function extractCommand(directory: string) {
  const {target,policy}=JSON.parse(await readFile(join(directory,'request.json'),'utf8'))
  const result=await extractBuild(join(directory,'archive.zip'),directory,target,policy)
  await writeFile(join(directory,'result.json'),JSON.stringify(result),{flag:'wx',mode:0o600})
}
