import type { BuildLimits } from '../types'

export type UploadPolicy = BuildLimits & {
  revision: 1; partBytes: number; maxPathDepth: number; validationMs: number
  sessionSeconds: number; signedUrlSeconds: number; jobSeconds: number; maxAttempts: number
  maxActiveUploads: number; maxUploadsPerDay: number; maxApiPerMinute: number
  redispatchSeconds: number
}
/** Service policy, independent of engine, game or publisher. Snapshot per upload. */
export const UPLOAD_POLICY: Readonly<UploadPolicy> = Object.freeze({
  revision: 1, maxArchiveBytes: 4 * 1024 ** 3, maxTotalBytes: 16 * 1024 ** 3,
  maxFileBytes: 4 * 1024 ** 3, maxFiles: 50_000, maxManifestBytes: 64 * 1024,
  maxCompressionRatio: 200, maxPathDepth: 32, partBytes: 32 * 1024 ** 2,
  validationMs: 15 * 60_000, sessionSeconds: 86_400, signedUrlSeconds: 900,
  jobSeconds: 3600, maxAttempts: 3,
  maxActiveUploads: 2, maxUploadsPerDay: 20, maxApiPerMinute: 120,
  redispatchSeconds: 3600,
})
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export class UploadError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); this.name = 'UploadError' }
}
export function assertUploadId(id: string) { if (!UUID.test(id)) throw new UploadError('invalid_request') }
export function expectedPartSize(size: number, part: number, partBytes: number) {
  if (!Number.isInteger(part) || part < 1 || part > Math.ceil(size / partBytes)) throw new UploadError('invalid_part')
  return Math.min(partBytes, size - (part - 1) * partBytes)
}
