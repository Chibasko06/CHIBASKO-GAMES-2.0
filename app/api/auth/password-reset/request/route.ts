import { NextRequest, NextResponse } from 'next/server'
import {
  createPasswordResetCode,
  findAuthUserByEmail,
  invalidateActivePasswordResetCodes,
  normalizeEmail,
  sendPasswordResetCodeEmail,
} from '@/lib/server/passwordReset'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''

    if (!email) {
      return NextResponse.json({ error: 'Email requis.' }, { status: 400 })
    }

    const authUser = await findAuthUserByEmail(email)

    if (authUser) {
      await invalidateActivePasswordResetCodes(email)
      const code = await createPasswordResetCode(email)
      await sendPasswordResetCodeEmail(email, code)
    }

    return NextResponse.json({
      ok: true,
      message: 'Si ce compte existe, un code de confirmation a ete envoye par email.',
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Impossible d envoyer le code.' },
      { status: 500 }
    )
  }
}
