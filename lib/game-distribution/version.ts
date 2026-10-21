import schema from './chibasko.schema.v1.json' with {type:'json'}

const definition = schema.$defs.version
const pattern = new RegExp(definition.pattern)

/** Upload admission validates only the version; the archive manifest is checked by the validator. */
export function isBuildVersion(value: unknown): value is string {
  return typeof value === 'string' && value.length <= definition.maxLength && pattern.test(value)
}
