import { NextRequest, NextResponse } from 'next/server'
import { getValidPasswordResetCode, normalizeEmail } from '@/lib/server/passwordReset'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
    const code = typeof body?.code === 'string' ? body.code.trim() : ''

    if (!email || !code) {
      return NextResponse.json({ error: 'Email et code requis.' }, { status: 400 })
    }

    const resetCode = await getValidPasswordResetCode(email, code)

    if (!resetCode) {
      return NextResponse.json({ error: 'Code invalide ou expire.' }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      message: 'Code confirme. Tu peux maintenant choisir un nouveau mot de passe.',
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Verification impossible.' },
      { status: 500 }
    )
  }
}
