import type { ArtifactReader, ArtifactRange, ArtifactMetadata } from '../lib/game-distribution/storage'
import { GatewayError } from '../lib/game-distribution/gateway/contracts'

type StoredObject={size:number;etag:string;customMetadata?:Record<string,string>;range?:ArtifactRange;body?:ReadableStream<Uint8Array>}
export type ArtifactBucketBinding={head(key:string):Promise<StoredObject|null>;get(key:string,options:{onlyIf:{etagMatches:string};range?:ArtifactRange}):Promise<StoredObject|null>}
/** Native read-only R2 adapter to the shared artifact port, with streaming ranges. */
export function artifactReader(bucket:ArtifactBucketBinding):ArtifactReader {
  return {
    async head(key) {
      try {const object=await bucket.head(key);return object?{size:object.size,etag:object.etag,sha256:object.customMetadata?.sha256 ?? ''}:null}
      catch {throw new GatewayError('storage_error',503)}
    },
    async get(key:string,metadata:ArtifactMetadata,range?:ArtifactRange) {
      try {
        const object=await bucket.get(key,{onlyIf:{etagMatches:metadata.etag},...(range?{range}:{})})
        if(!object)return null
        if(!object.body || object.etag!==metadata.etag || (range && (object.range?.offset!==range.offset || object.range?.length!==range.length))) {
          await object.body?.cancel();throw new GatewayError('storage_error',503)
        }
        return object.body
      } catch {throw new GatewayError('storage_error',503)}
    },
  }
}
