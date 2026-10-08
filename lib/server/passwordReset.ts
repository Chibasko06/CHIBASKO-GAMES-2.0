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
  // Trust provider headers only on their configured ingress, never arbitrary XFF.
  // Local/unknown hosts share a conservative quota; arbitrary XFF is ignored.
  const forwarded = process.env.CHIBASKO_CLOUDFLARE === '1'
    ? request.headers.get('cf-connecting-ip')
    : process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for') : null
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
      from: `Chibasko Games <${from.replace(/^.*<([^<>]+)>$/, '$1')}>`,
      to: email,
      subject: 'Ton code de réinitialisation Chibasko Games',
      text: `Chibasko Games\n\nRéinitialisation de ton mot de passe\n\nUne demande de réinitialisation a été faite pour ton compte Chibasko Games. Saisis ce code sur la page de réinitialisation pour choisir un nouveau mot de passe :\n\n${code}\n\nCe code expire après 10 minutes. Ne le partage avec personne.\n\nSi tu n’es pas à l’origine de cette demande, ignore cet email. Ton mot de passe reste inchangé.\n\nChibasko Games`,
      html: `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Réinitialisation de ton mot de passe</title></head>
<body style="margin:0;padding:0;background-color:#f1f3f7;color:#202838;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f3f7;">
    <tr><td align="center" style="padding:32px 12px;">
      <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e1e5ed;border-radius:16px;">
        <tr><td style="padding:28px 24px;background-color:#111827;border-radius:16px 16px 0 0;">
          <p style="margin:0;color:#ffffff;font-size:22px;font-weight:bold;line-height:30px;">Chibasko <span style="color:#67e8f9;">Games</span></p>
        </td></tr>
        <tr><td style="padding:28px 24px;">
          <h1 style="margin:0 0 20px;font-size:24px;line-height:32px;color:#111827;">Réinitialisation de ton mot de passe</h1>
          <p style="margin:0 0 12px;font-size:16px;line-height:25px;">Une demande de réinitialisation a été faite pour ton compte Chibasko Games.</p>
          <p style="margin:0 0 24px;font-size:16px;line-height:25px;">Saisis ce code sur la page de réinitialisation pour choisir un nouveau mot de passe :</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:22px 8px;background-color:#ecfeff;border:1px solid #a5f3fc;border-radius:12px;">
            <p style="margin:0;font-family:'Courier New',monospace;font-size:32px;font-weight:bold;letter-spacing:5px;line-height:44px;color:#155e75;white-space:nowrap;">${code}</p>
          </td></tr></table>
          <p style="margin:20px 0 0;font-size:14px;line-height:22px;color:#475569;">Ce code expire après <strong>10 minutes</strong>. Ne le partage avec personne.</p>
          <p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #e1e5ed;font-size:14px;line-height:22px;color:#475569;">Si tu n’es pas à l’origine de cette demande, ignore cet email. Ton mot de passe reste inchangé.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
      <p style="margin:20px 0 0;font-size:12px;line-height:20px;color:#64748b;">Chibasko Games</p>
    </td></tr>
  </table>
</body>
</html>`,
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
