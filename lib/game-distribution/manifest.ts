import schemaValidator from './manifest-validator.generated.mjs'
import type { GameBuildManifest, UploadTarget } from './types'
import { assertArtifactPath } from './paths'

const validate = (value: unknown): value is GameBuildManifest => schemaValidator(value)
export class BuildValidationError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'BuildValidationError' }
}
export function validateManifest(value: unknown, target: UploadTarget): GameBuildManifest {
  // JSON round-trip snapshots caller data and rejects cycles/non-JSON values.
  let copy: unknown
  try { copy = JSON.parse(JSON.stringify(value)) } catch { throw new BuildValidationError('INVALID_MANIFEST_JSON') }
  if (!validate(copy)) throw new BuildValidationError('INVALID_MANIFEST_SCHEMA')
  if (copy.gameId !== target.gameId || copy.version !== target.version) throw new BuildValidationError('UPLOAD_TARGET_MISMATCH')
  for (const capability of Object.values(copy.capabilities)) {
    if (capability.players.min > capability.players.max) throw new BuildValidationError('INVALID_PLAYER_RANGE')
  }
  for (const path of Object.values(copy.client.entrypoints)) assertArtifactPath(path)
  return freeze(copy)
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
