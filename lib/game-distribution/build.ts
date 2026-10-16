import { validateManifest, BuildValidationError } from './manifest'
import { assertArtifactPath, artifactMedia } from './paths'
import type { ArtifactFile, BuildFile, BuildLimits, UploadTarget, ValidatedWebBuild } from './types'

/** Operational quotas, not engine/format capabilities. Trusted caller may lower/raise them. */
export const DEFAULT_BUILD_LIMITS: BuildLimits = Object.freeze({ maxFiles:10_000, maxFileBytes:256*1024*1024,
  maxTotalBytes:1024*1024*1024, maxArchiveBytes:256*1024*1024, maxCompressionRatio:200, maxManifestBytes:64*1024 })
export async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)))
  return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('')
}
export function checkFileInventory(files: readonly { path: string; size: number }[], limits: BuildLimits): void {
  if (!files.length || files.length > limits.maxFiles) throw new BuildValidationError('BUILD_FILE_LIMIT')
  const names = new Set<string>(); let total = 0
  for (const file of files) {
    assertArtifactPath(file.path)
    const folded = file.path.toLowerCase()
    if (names.has(folded)) throw new BuildValidationError('DUPLICATE_BUILD_PATH')
    names.add(folded)
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > limits.maxFileBytes) throw new BuildValidationError('BUILD_FILE_SIZE')
    total += file.size
    if (total > limits.maxTotalBytes) throw new BuildValidationError('BUILD_TOTAL_SIZE')
  }
  // File/directory collisions are ambiguous across extractors and URL gateways.
  for (const name of names) for (const [index] of name.split('/').entries()) {
    if (index && names.has(name.split('/').slice(0, index).join('/'))) throw new BuildValidationError('BUILD_PATH_COLLISION')
  }
}
export async function validateWebBuild(input: readonly BuildFile[], target: UploadTarget, limits = DEFAULT_BUILD_LIMITS): Promise<ValidatedWebBuild> {
  checkFileInventory(input.map(file => ({path:file.path, size:file.bytes.byteLength})), limits)
  // Own bytes before awaiting hashing; mutation by caller cannot change validated output.
  const files = input.map(file => ({path:file.path, bytes:Uint8Array.from(file.bytes)}))
  const manifestFile = files.find(file => file.path === 'chibasko.json')
  if (!manifestFile || manifestFile.bytes.length > limits.maxManifestBytes) throw new BuildValidationError('ROOT_MANIFEST_REQUIRED')
  let json: unknown
  try { json = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(manifestFile.bytes)) } catch { throw new BuildValidationError('INVALID_MANIFEST_JSON') }
  const manifest = validateManifest(json, target)
  for (const path of Object.values(manifest.client.entrypoints)) {
    const entry = files.find(file => file.path === path)
    if (!entry || !/\.html$/.test(path) || entry.bytes.length === 0) throw new BuildValidationError('ENTRYPOINT_MISSING')
    if (entry.bytes.length > 1024*1024) throw new BuildValidationError('ENTRYPOINT_SIZE_LIMIT')
    try { new TextDecoder('utf-8',{fatal:true}).decode(entry.bytes) } catch { throw new BuildValidationError('ENTRYPOINT_INVALID_UTF8') }
  }
  const inventory: ArtifactFile[] = []
  for (const file of files.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) inventory.push(Object.freeze({
    path:file.path, size:file.bytes.length, sha256:await sha256(file.bytes), ...artifactMedia(file.path),
  }))
  const content = inventory.map(({path,size,sha256}) => ({path,size,sha256}))
  return Object.freeze({manifest, files:Object.freeze(inventory), artifactSize:inventory.reduce((n,f) => n+f.size,0),
    artifactSha256:await sha256(new TextEncoder().encode(JSON.stringify(content)))})
}
