import schemaValidator from './manifest-validator.generated.mjs'
import type { GameBuildManifest, UploadTarget } from './types'
import { assertArtifactPath } from './paths'
import {safeValidationLocation,type ValidationLocation} from './validation-diagnostics'

const validate = (value: unknown): value is GameBuildManifest => schemaValidator(value)
export class BuildValidationError extends Error {
  readonly diagnosticLocation:ValidationLocation
  constructor(readonly code: string,location:ValidationLocation={}) { super(code); this.name = 'BuildValidationError';this.diagnosticLocation=safeValidationLocation(location) }
}
export function validateManifest(value: unknown, target: UploadTarget): GameBuildManifest {
  // JSON round-trip snapshots caller data and rejects cycles/non-JSON values.
  let copy: unknown
  try { copy = JSON.parse(JSON.stringify(value)) } catch { throw new BuildValidationError('INVALID_MANIFEST_JSON') }
  if (!validate(copy)) {
    const first=(schemaValidator as unknown as {errors?:{instancePath?:string;params?:{missingProperty?:string}}[]}).errors?.[0]
    const field=(first?.instancePath??'')+(first?.params?.missingProperty?'/'+first.params.missingProperty:'')
    throw new BuildValidationError('INVALID_MANIFEST_SCHEMA',{path:'chibasko.json',field:field||'$'})
  }
  if (copy.gameId !== target.gameId || copy.version !== target.version) throw new BuildValidationError('UPLOAD_TARGET_MISMATCH',{path:'chibasko.json',field:copy.gameId!==target.gameId?'/gameId':'/version'})
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
