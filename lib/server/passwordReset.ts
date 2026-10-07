import { createHmac, randomInt } from 'node:crypto'
import { isIP } from 'node:net'
import { Resend } from 'resend'
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin'

function secret() {
  const value = process.env.PASSWORD_RESET_CODE_SECRET?.trim()
  if (!value || value.length < 32) throw new Error('Password reset secret is missing or too short')
  return value
}

export function generatePasswordResetCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

export function hashPasswordResetCode(email: string, code: string) {
  return createHmac('sha256', secret()).update(`code:${email}:${code}`).digest('hex')
}

export function passwordResetClientHash(request: Request) {
  // Only trust the IP header when the request is handled by Vercel's ingress.
  // Local/unknown hosts share a conservative quota; arbitrary XFF is ignored.
  const forwarded = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for') : null
  const candidate = forwarded?.split(',')[0].trim() || ''
  const client = isIP(candidate) ? candidate : 'shared-untrusted-ingress'
  return createHmac('sha256', secret()).update(`client:${client}`).digest('hex')
}

export async function reservePasswordReset(email: string, code: string, clientHash: string) {
  const { data, error } = await getSupabaseAdminClient().rpc('reserve_password_reset', {
    p_email: email,
    p_code_hash: hashPasswordResetCode(email, code),
    p_client_hash: clientHash,
  })
  if (error) throw error
  return data?.[0] ?? null
}

export async function checkPasswordReset(email: string, code: string, consume: boolean) {
  const { data, error } = await getSupabaseAdminClient().rpc('check_password_reset', {
    p_email: email,
    p_code_hash: hashPasswordResetCode(email, code),
    p_consume: consume,
  })
  if (error) throw error
  return data?.[0]?.auth_user_id ?? null
}

export async function deliverPasswordReset(requestId: string, email: string, code: string) {
  try {
    const apiKey = process.env.RESEND_API_KEY?.trim()
    const from = process.env.RESEND_FROM_EMAIL?.trim()
    if (!apiKey || !from) throw new Error('Email configuration missing')
    const { data, error } = await new Resend(apiKey).emails.send({
      from,
      to: email,
      subject: 'Code de reinitialisation Chibasko Games',
      text: `Ton code Chibasko Games : ${code}. Il expire dans 10 minutes. Si tu n as pas demande ce code, ignore cet email.`,
      html: `<div style="font-family:Arial,sans-serif;padding:24px"><h1>Chibasko Games</h1><p>Ton code de reinitialisation :</p><p style="font-size:32px;letter-spacing:8px">${code}</p><p>Il expire dans 10 minutes. Si tu n as pas demande ce code, ignore cet email.</p></div>`,
    }, { idempotencyKey: `password-reset/${requestId}` })
    if (error || !data?.id) throw new Error('Email delivery rejected')
  } catch {
    // No email, code, hash or provider payload is written to logs or returned.
    console.error('Password reset email delivery failed')
    try {
      const { error } = await getSupabaseAdminClient().from('password_reset_codes')
        .update({ used_at: new Date().toISOString() }).eq('id', requestId).is('used_at', null)
      if (error) console.error('Password reset delivery invalidation failed')
    } catch {
      console.error('Password reset delivery invalidation failed')
    }
  }
}

export async function updateAuthUserPassword(userId: string, password: string) {
  const { error } = await getSupabaseAdminClient().auth.admin.updateUserById(userId, { password })
  if (error) throw error
}
