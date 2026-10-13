import 'server-only'
import { NextResponse } from 'next/server'

export function adminJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Cache-Control', 'private, no-store, max-age=0')
  headers.set('Vary', 'Cookie, Authorization')
  return NextResponse.json(body, { ...init, headers })
}
export function adminErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
  return code === '23505' ? 'Ce slug ou cet identifiant est déjà utilisé.' : code === 'PGRST116'
    ? 'Ce contenu a changé ou n’est plus disponible. Recharge la page puis réessaie.'
    : 'L’opération n’a pas pu être effectuée. Réessaie.'
}
