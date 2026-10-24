import {withTimeout, OperationTimeoutError} from './asyncOperation'

export type DataFailureKind = 'database_error' | 'database_unavailable' | 'unexpected_error'

export class DataAccessError extends Error {
  constructor(readonly kind: DataFailureKind) {
    super('Les données sont temporairement indisponibles. Réessaie dans un instant.')
    this.name = 'DataAccessError'
  }
}

export function logDataFailure(operation: string, error: unknown, kind: DataFailureKind) {
  if (typeof window !== 'undefined') return
  const value = error && typeof error === 'object' ? error as {code?: unknown; status?: unknown} : {}
  const code = typeof value.code === 'string' && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(value.code) ? value.code : undefined
  const status = typeof value.status === 'number' && Number.isInteger(value.status) && value.status >= 100 && value.status <= 599 ? value.status : undefined
  console.error(JSON.stringify({event: 'data_access_failed', requestId: crypto.randomUUID(), operation, kind, code, status}))
}

export async function readData<T extends {error?: unknown; status?: number}>(operation: string, query: PromiseLike<T>): Promise<T> {
  let result: T
  try { result = await withTimeout(query) } catch (error) {
    const kind = error instanceof OperationTimeoutError || error instanceof TypeError || (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
      ? 'database_unavailable' : 'unexpected_error'
    logDataFailure(operation, error, kind)
    throw new DataAccessError(kind)
  }
  if (result.error) {
    const code = (result.error as {code?: unknown}).code
    const unavailable = result.status === 0 || (result.status !== undefined && result.status >= 502)
      || (typeof code === 'string' && /^(?:08|53|57P0|PGRST00)/.test(code))
    const kind = unavailable ? 'database_unavailable' : 'database_error'
    logDataFailure(operation, result.error, kind)
    throw new DataAccessError(kind)
  }
  return result
}
