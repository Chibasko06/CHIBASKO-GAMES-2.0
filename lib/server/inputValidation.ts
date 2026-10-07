export class InputError extends Error {
  readonly status: number
  constructor(message = 'Requete invalide.', status = 400) {
    super(message)
    this.status = status
  }
}

export function isEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export async function readJsonObject(request: Request, maxBytes = 16_384): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new InputError('Format JSON requis.', 415)
  }
  const reader = request.body?.getReader()
  if (!reader) throw new InputError()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new InputError('Requete trop volumineuse.', 413)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  try {
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError()
    return body as Record<string, unknown>
  } catch {
    throw new InputError('Objet JSON invalide.')
  }
}

export function resetEmail(body: Record<string, unknown>) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!isEmail(email)) throw new InputError('Adresse email invalide.')
  return email
}

export function resetCode(body: Record<string, unknown>) {
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  if (!/^\d{6}$/.test(code)) throw new InputError('Code a 6 chiffres requis.')
  return code
}

export function resetPassword(body: Record<string, unknown>) {
  if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) {
    throw new InputError('Le mot de passe doit faire entre 8 et 128 caracteres.')
  }
  return body.password
}
