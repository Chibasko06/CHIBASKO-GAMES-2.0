/** Distribution contracts. No React, SDK transport, host or developer tool implied. */
export type GameBuildManifest = Readonly<{
  schemaVersion: 1
  /** Platform-assigned games.id, not a slug, Auth ID or legacy multiplayer_game_id. */
  gameId: string
  version: string
  integrationVersion: 1
  capabilities: Readonly<{
    local?: Readonly<{ players: Readonly<{ min: number; max: number }> }>
    online?: Readonly<{ access: readonly ('public' | 'private')[]; players: Readonly<{ min: number; max: number }> }>
  }>
  client: Readonly<{
    entrypoints: Readonly<{ local?: string; online?: string }>
    requirements?: Readonly<{ crossOriginIsolation?: boolean }>
  }>
}>
export type UploadTarget = Readonly<{ gameId: string; version: string }>
export type BuildFile = Readonly<{ path: string; bytes: Uint8Array }>
export type ArtifactFile = Readonly<{ path: string; size: number; sha256: string; contentType: string; contentEncoding?: 'gzip' | 'br' }>
export type ValidatedWebBuild = Readonly<{
  manifest: GameBuildManifest
  /** sha256(JSON.stringify(sorted [{path,size,sha256}])). Includes chibasko.json. */
  artifactSha256: string
  artifactSize: number
  files: readonly ArtifactFile[]
}>
export type BuildLimits = Readonly<{
  maxFiles: number; maxFileBytes: number; maxTotalBytes: number; maxArchiveBytes: number; maxCompressionRatio: number; maxManifestBytes: number
}>
/** Deployment/backend provenance is assigned by the platform, never the payload. */
export type ResultProvenance = 'local_unverified' | 'external_server' | 'chibasko_server'
