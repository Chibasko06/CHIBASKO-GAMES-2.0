import { NextRequest, NextResponse } from 'next/server'
import { InputError, readJsonObject, resetCode, resetEmail } from '@/lib/server/inputValidation'
import { checkPasswordReset } from '@/lib/server/passwordReset'

export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  try {
    const body = await readJsonObject(request)
    const userId = await checkPasswordReset(resetEmail(body), resetCode(body), false)
    if (!userId) return NextResponse.json({ error: 'Code invalide ou expire.' }, { status: 400, headers })
    return NextResponse.json({ ok: true, message: 'Code confirme. Tu peux choisir un nouveau mot de passe.' }, { headers })
  } catch (error) {
    if (error instanceof InputError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
    console.error('Password reset verification failed')
    return NextResponse.json({ error: 'Verification indisponible. Reessaie plus tard.' }, { status: 503, headers })
  }
}
