import type { ValidatedWebBuild } from '../types'
import type { UploadPolicy } from './policy'

export type UploadState = 'created' | 'uploading' | 'finalizing' | 'queued' | 'validating' | 'completed' | 'failed' | 'expired'
export type Upload = {
  id: string; game_id: string; created_by: string | null; version: string; version_id: string
  status: UploadState; expected_size: number; staging_key: string; staging_etag: string | null; multipart_id: string | null
  expires_at: string; policy: UploadPolicy; lease_token: string | null; attempts: number
  error_code: string | null; checkpoint: CheckpointSummary | null; cleaned_at: string | null
}
export type Checkpoint = ValidatedWebBuild & { archiveSha256: string; archiveSize: number }
export type CheckpointSummary = Omit<Checkpoint,'files'> & {fileCount:number}
export type Part = { number: number; size: number; etag: string }
export type StagingStorage = {
  begin(key: string): Promise<string>
  signPart(key: string, multipart: string, part: number, size: number, seconds: number): Promise<string>
  parts(key: string, multipart: string): Promise<Part[]>
  complete(key: string, multipart: string, parts: Part[]): Promise<void>
  head(key: string): Promise<{size:number;etag:string} | null>
  abort(key: string, multipart: string): Promise<void>
  delete(key: string): Promise<void>
}
/** RPC calls are fixed by trusted application code, never supplied by HTTP users. */
export type UploadRepository = { call<T>(name: string, args: Record<string,unknown>): Promise<T> }
export function publicUpload(upload: Upload) {
  return { id: upload.id, gameId: upload.game_id, version: upload.version, status: upload.status,
    reviewUrl: '/developer/builds/'+upload.id,
    expiresAt: upload.expires_at, error: upload.error_code ? {code:upload.error_code} : null,
    gameVersionId: upload.status === 'completed' ? upload.version_id : null,
    upload: { protocol: 'multipart-v1', archiveSize: upload.expected_size,
      partSize: upload.policy.partBytes, partCount: Math.ceil(upload.expected_size / upload.policy.partBytes) } }
}
