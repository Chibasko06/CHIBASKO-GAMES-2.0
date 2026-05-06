import { NextRequest, NextResponse } from 'next/server'
import {
  findAuthUserByEmail,
  getValidPasswordResetCode,
  markPasswordResetCodeUsed,
  normalizeEmail,
  updateAuthUserPassword,
} from '@/lib/server/passwordReset'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
    const code = typeof body?.code === 'string' ? body.code.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!email || !code || !password) {
      return NextResponse.json({ error: 'Email, code et mot de passe requis.' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Le mot de passe doit faire au moins 8 caracteres.' }, { status: 400 })
    }

    const resetCode = await getValidPasswordResetCode(email, code)

    if (!resetCode) {
      return NextResponse.json({ error: 'Code invalide ou expire.' }, { status: 400 })
    }

    const authUser = await findAuthUserByEmail(email)

    if (!authUser) {
      return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 })
    }

    await updateAuthUserPassword(authUser, password)
    await markPasswordResetCodeUsed(resetCode.id)

    return NextResponse.json({
      ok: true,
      message: 'Mot de passe mis a jour. Tu peux maintenant te reconnecter.',
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Impossible de changer le mot de passe.' },
      { status: 500 }
    )
  }
}
