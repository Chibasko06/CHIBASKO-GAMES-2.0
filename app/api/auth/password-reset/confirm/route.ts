import { NextRequest, NextResponse } from 'next/server'
import { InputError, readJsonObject, resetCode, resetEmail, resetPassword } from '@/lib/server/inputValidation'
import { checkPasswordReset, updateAuthUserPassword } from '@/lib/server/passwordReset'

export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  try {
    const body = await readJsonObject(request)
    const email = resetEmail(body)
    const code = resetCode(body)
    const password = resetPassword(body)
    // Consume atomically BEFORE Auth: concurrent confirmations cannot reuse it.
    const userId = await checkPasswordReset(email, code, true)
    if (!userId) return NextResponse.json({ error: 'Code invalide ou expire.' }, { status: 400, headers })
    await updateAuthUserPassword(userId, password)
    return NextResponse.json({ ok: true, message: 'Mot de passe mis a jour. Tu peux te reconnecter.' }, { headers })
  } catch (error) {
    if (error instanceof InputError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
    console.error('Password reset confirmation failed')
    // A consumed code is never reactivated after an uncertain Auth outcome.
    return NextResponse.json({ error: 'Impossible de changer le mot de passe. Demande un nouveau code.' }, { status: 503, headers })
  }
}
