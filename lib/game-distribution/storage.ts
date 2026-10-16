import { gameArtifactKeys } from './keys'
import { sha256 } from './build'
import { artifactMedia } from './paths'
import type { ArtifactFile } from './types'

/** Private R2-compatible ingestion port, never a game SDK capability. */
export type ImmutableArtifactBucket = {
  put(key: string, bytes: Uint8Array, options: {
    onlyIf: Headers
    httpMetadata: { contentType: string; contentEncoding?: string; cacheControl: string }
    customMetadata: Record<string,string>
  }): Promise<unknown | null>
}
/** No credentials/bucket lookup/public URL. A delivery gateway decides cache,
 * CSP and preview authorization; private stored objects default to no-store.
 */
export async function putArtifactFile(bucket: ImmutableArtifactBucket,
  identity: Readonly<{gameId:string;versionId:string;artifactSha256:string}>, file: ArtifactFile, input: Uint8Array) {
  const key=gameArtifactKeys(identity.gameId,identity.versionId,identity.artifactSha256).file(file.path)
  const expected={...file}, versionId=identity.versionId, bytes=Uint8Array.from(input), media=artifactMedia(file.path)
  if (bytes.length!==expected.size || await sha256(bytes)!==expected.sha256) throw new Error('ARTIFACT_FILE_HASH_MISMATCH')
  const result=await bucket.put(key,bytes,{onlyIf:new Headers({'If-None-Match':'*'}),
    httpMetadata:{...media,cacheControl:'no-store'},
    customMetadata:{application:'chibasko-games',versionId,sha256:expected.sha256}})
  if (result===null) throw new Error('ARTIFACT_OBJECT_ALREADY_EXISTS')
  return key
}
