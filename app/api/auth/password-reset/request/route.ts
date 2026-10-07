import { after, NextRequest, NextResponse } from 'next/server'
import { InputError, readJsonObject, resetEmail } from '@/lib/server/inputValidation'
import { deliverPasswordReset, generatePasswordResetCode, passwordResetClientHash, reservePasswordReset } from '@/lib/server/passwordReset'

export async function POST(request: NextRequest) {
  try {
    const email = resetEmail(await readJsonObject(request))
    const code = generatePasswordResetCode()
    const reservation = await reservePasswordReset(email, code, passwordResetClientHash(request))
    // Sending after the response avoids an account-dependent Resend timing signal.
    if (reservation?.auth_user_id) {
      after(() => deliverPasswordReset(reservation.request_id, email, code))
    }
  } catch (error) {
    if (error instanceof InputError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } })
    }
    console.error('Password reset request could not be processed')
    // Same public result for absent accounts, quotas and infrastructure failures.
  }
  return NextResponse.json({
    ok: true,
    message: 'Si ce compte existe et que la limite de demandes le permet, un code sera envoye par email.',
  }, { headers: { 'Cache-Control': 'no-store' } })
}
