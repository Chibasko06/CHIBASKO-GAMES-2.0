import { createHash, randomInt } from 'node:crypto'
import { Resend } from 'resend'
import type { User } from '@supabase/supabase-js'
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin'

const PASSWORD_RESET_CODE_LENGTH = 6
const PASSWORD_RESET_EXPIRES_MINUTES = 10

function getPasswordResetSecret() {
  const secret = process.env.PASSWORD_RESET_CODE_SECRET?.trim()

  if (!secret) {
    throw new Error('Missing PASSWORD_RESET_CODE_SECRET')
  }

  return secret
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim()

  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY')
  }

  return new Resend(apiKey)
}

function getResendFromEmail() {
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim()

  if (!fromEmail) {
    throw new Error('Missing RESEND_FROM_EMAIL')
  }

  return fromEmail
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function generatePasswordResetCode() {
  return randomInt(0, 1_000_000).toString().padStart(PASSWORD_RESET_CODE_LENGTH, '0')
}

export function hashPasswordResetCode(email: string, code: string) {
  return createHash('sha256')
    .update(`${normalizeEmail(email)}:${code}:${getPasswordResetSecret()}`)
    .digest('hex')
}

export function getPasswordResetExpirationIso() {
  return new Date(Date.now() + PASSWORD_RESET_EXPIRES_MINUTES * 60 * 1000).toISOString()
}

export async function findAuthUserByEmail(email: string) {
  const supabaseAdmin = getSupabaseAdminClient()
  const normalizedEmail = normalizeEmail(email)
  let page = 1

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    })

    if (error) {
      throw error
    }

    const users = data.users ?? []
    const match = users.find((user) => normalizeEmail(user.email ?? '') === normalizedEmail)

    if (match) {
      return match
    }

    if (users.length < 1000) {
      return null
    }

    page += 1
  }
}

export async function invalidateActivePasswordResetCodes(email: string) {
  const supabaseAdmin = getSupabaseAdminClient()
  const normalizedEmail = normalizeEmail(email)

  const { error } = await supabaseAdmin
    .from('password_reset_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('email', normalizedEmail)
    .is('used_at', null)

  if (error) {
    throw error
  }
}

export async function createPasswordResetCode(email: string) {
  const supabaseAdmin = getSupabaseAdminClient()
  const normalizedEmail = normalizeEmail(email)
  const code = generatePasswordResetCode()
  const codeHash = hashPasswordResetCode(normalizedEmail, code)

  const { error } = await supabaseAdmin.from('password_reset_codes').insert({
    email: normalizedEmail,
    code_hash: codeHash,
    expires_at: getPasswordResetExpirationIso(),
  })

  if (error) {
    throw error
  }

  return code
}

export async function getValidPasswordResetCode(email: string, code: string) {
  const supabaseAdmin = getSupabaseAdminClient()
  const normalizedEmail = normalizeEmail(email)
  const codeHash = hashPasswordResetCode(normalizedEmail, code)

  const { data, error } = await supabaseAdmin
    .from('password_reset_codes')
    .select('*')
    .eq('email', normalizedEmail)
    .eq('code_hash', codeHash)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

export async function markPasswordResetCodeUsed(id: string) {
  const supabaseAdmin = getSupabaseAdminClient()

  const { error } = await supabaseAdmin
    .from('password_reset_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    throw error
  }
}

export async function updateAuthUserPassword(user: User, password: string) {
  const supabaseAdmin = getSupabaseAdminClient()
  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    password,
  })

  if (error) {
    throw error
  }
}

export async function sendPasswordResetCodeEmail(email: string, code: string) {
  const resend = getResendClient()
  const normalizedEmail = normalizeEmail(email)

  await resend.emails.send({
    from: getResendFromEmail(),
    to: normalizedEmail,
    subject: 'Code de reinitialisation Chibasko Games',
    html: `
      <div style="font-family:Arial,sans-serif;background:#09090b;color:#f4f4f5;padding:24px">
        <div style="max-width:520px;margin:0 auto;background:#111827;border:1px solid #164e63;border-radius:20px;padding:32px">
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.3em;text-transform:uppercase;color:#67e8f9">Chibasko Games</p>
          <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2">Code de reinitialisation</h1>
          <p style="margin:0 0 20px;color:#d4d4d8;line-height:1.6">
            Utilise ce code a 6 chiffres sur le site pour choisir un nouveau mot de passe. Il expire dans 10 minutes.
          </p>
          <div style="margin:0 0 20px;padding:18px 20px;border-radius:16px;background:#020617;border:1px solid #0e7490;text-align:center;font-size:32px;font-weight:800;letter-spacing:0.45em;color:#67e8f9">
            ${code}
          </div>
          <p style="margin:0;color:#a1a1aa;line-height:1.6">
            Si tu n as pas demande cette reinitialisation, ignore simplement cet email.
          </p>
        </div>
      </div>
    `,
  })
}
