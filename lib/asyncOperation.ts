export const AUTH_OPERATION_TIMEOUT_MS = 30_000

export class OperationTimeoutError extends Error {
  constructor() { super('Le délai de connexion est dépassé. Vérifie ta connexion puis réessaie.'); this.name = 'OperationTimeoutError' }
}

export async function withTimeout<T>(operation: PromiseLike<T>, timeout = AUTH_OPERATION_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([Promise.resolve(operation), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new OperationTimeoutError()), timeout)
    })])
  } finally { clearTimeout(timer) }
}

export async function fetchJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {...init, signal: AbortSignal.timeout(AUTH_OPERATION_TIMEOUT_MS)})
  const payload = await response.json()
  return {response, payload}
}
