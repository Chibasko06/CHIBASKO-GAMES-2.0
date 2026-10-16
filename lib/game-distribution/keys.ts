import { assertArtifactPath } from './paths'

const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const digest = /^[0-9a-f]{64}$/
/** Pure immutable keys. No bucket, public origin, credential or write authority. */
export function gameArtifactKeys(gameId: string, versionId: string, artifactSha256: string) {
  if (!id.test(gameId) || !id.test(versionId) || !digest.test(artifactSha256)) throw new Error('INVALID_ARTIFACT_IDENTITY')
  const prefix = `games/${gameId}/versions/${versionId}/${artifactSha256}/`
  return Object.freeze({
    prefix, clientPrefix:prefix+'client/', inventoryKey:prefix+'inventory.json',
    file(path: string) { assertArtifactPath(path); return prefix+'client/'+path },
    archive(archiveSha256: string) { if (!digest.test(archiveSha256)) throw new Error('INVALID_ARCHIVE_HASH'); return prefix+'archives/'+archiveSha256+'.zip' },
  })
}
