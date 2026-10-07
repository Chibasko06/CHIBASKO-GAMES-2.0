import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readJsonObject, resetEmail, resetCode, resetPassword } from '../lib/server/inputValidation.ts'
import { validateGameSubmission } from '../lib/server/gameSubmissionValidation.ts'
import { deliverPasswordReset, hashPasswordResetCode, passwordResetClientHash } from '../lib/server/passwordReset.ts'
import { POST as requestReset } from '../app/api/auth/password-reset/request/route.ts'
import { POST as verifyReset } from '../app/api/auth/password-reset/verify/route.ts'
import { POST as confirmReset } from '../app/api/auth/password-reset/confirm/route.ts'
import { POST as submitGame } from '../app/api/game-submissions/route.ts'
import { isAdminEmail } from '../lib/adminAuth.ts'
import { logAdminAuthorization } from '../lib/server/adminDiagnostics.ts'
import { logSupabaseAuthValidation } from '../lib/server/supabaseAuthDiagnostics.ts'
import { createClient } from '@supabase/supabase-js'

test('Supabase JWT diagnostics expose only safe labels and handle malformed tokens', () => {
  const warn = console.warn
  const logs = []
  console.warn = (...args) => logs.push(args)
  const jwt = payload => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`
  try {
    logSupabaseAuthValidation(jwt({ exp: 1, email: 'private@example.test' }), 'sb_publishable_private',
      'https://project.supabase.co', { name: 'AuthApiError', status: 401, code: 'bad_jwt' })
    const expired = logs.at(-1)[1]
    assert.equal(expired.token_expired, true)
    assert.equal(expired.token_has_exp, true)
    assert.equal(expired.anon_key_kind, 'publishable')
    assert.equal(expired.auth_error_code, 'bad_jwt')
    logSupabaseAuthValidation(jwt({ exp: Date.now() / 1000 + 3600 }), jwt({ role: 'anon' }),
      'https://project.supabase.co', null)
    assert.equal(logs.at(-1)[1].token_expired, false)
    assert.equal(logs.at(-1)[1].anon_key_kind, 'legacy_anon')
    for (const token of ['private', 'a.b.c', jwt({ exp: 'invalid' }), jwt({})]) {
      logSupabaseAuthValidation(token, 'private', 'invalid', {
        name: 'private', status: NaN, code: 'private',
      })
      const fields = logs.at(-1)[1]
      assert.equal(fields.token_has_exp, false)
      assert.equal('token_expired' in fields, false)
      assert.equal(fields.auth_error_name, 'unknown')
      assert.equal(fields.auth_error_code, 'unknown')
      assert.equal(fields.auth_error_status, null)
    }
    assert.ok(!JSON.stringify(logs).includes('private'))
    assert.ok(!JSON.stringify(logs).includes('@'))
  } finally { console.warn = warn }
})

test('installed Supabase SDK sends the supplied JWT with publishable and legacy keys in both getUser forms', async () => {
  const token = 'e30.eyJleHAiOjQxMDI0NDQ4MDB9.signature'
  const legacyKey = `e30.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`
  for (const key of ['sb_publishable_test', legacyKey]) {
    for (const explicitJwt of [false, true]) {
      let calls = 0
      const client = createClient('https://project.supabase.co', key, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
        global: {
          headers: { Authorization: `Bearer ${token}` },
          fetch: async (url, options) => {
            calls++
            assert.equal(String(url), 'https://project.supabase.co/auth/v1/user')
            const headers = new Headers(options.headers)
            assert.equal(headers.get('authorization'), `Bearer ${token}`)
            assert.equal(headers.get('apikey'), key)
            return Response.json({ id: 'test-user', aud: 'authenticated' })
          },
        },
      })
      const result = explicitJwt ? await client.auth.getUser(token) : await client.auth.getUser()
      assert.equal(result.error, null)
      assert.equal(result.data.user.id, 'test-user')
      assert.equal(calls, 1)
    }
  }
})

test('admin runtime diagnostics distinguish secret and session states without disclosing values', () => {
  const previous = process.env.ADMIN_EMAILS
  const warn = console.warn
  const logs = []
  console.warn = (...args) => logs.push(args)
  const request = new Request('https://chibaskogames.fr/api/admin/status')
  const inspect = (user = null, token = false, error = false) => {
    logAdminAuthorization(request, token, user, error)
    return logs.at(-1)[1]
  }
  try {
    globalThis.__adminContext = () => ({ env: {} })
    delete process.env.ADMIN_EMAILS
    assert.equal(inspect().secret_present, false)
    assert.equal(inspect().token_present, false)
    assert.equal(isAdminEmail('admin-sensitive@example.test'), false)
    process.env.ADMIN_EMAILS = '   '
    assert.equal(inspect().secret_empty, true)
    process.env.ADMIN_EMAILS = ' ADMIN-SENSITIVE@example.test, other@example.test '
    globalThis.__adminContext = () => ({ env: { ADMIN_EMAILS: process.env.ADMIN_EMAILS } })
    assert.equal(inspect({}, true).user_present, true)
    assert.equal(inspect({}, true).user_email_present, false)
    assert.equal(inspect({ email: 'ordinary@example.test' }, true).email_matches_admin, false)
    const authorized = inspect({ email: 'admin-sensitive@example.test' }, true)
    assert.equal(authorized.email_matches_admin, true)
    assert.equal(authorized.context_secret_matches_process, true)
    globalThis.__adminContext = () => ({ env: { ADMIN_EMAILS: 'different-sensitive@example.test' } })
    assert.equal(inspect().context_secret_matches_process, false)
    globalThis.__adminContext = () => { throw new Error('sensitive-context-error') }
    assert.equal(inspect(null, true, true).context_error, true)
    assert.equal(inspect(null, true, true).auth_error, true)
    for (const [prefix, fields] of logs) {
      assert.equal(prefix, '[ADMIN_DIAGNOSTIC]')
      assert.ok(Object.values(fields).every(value => typeof value === 'boolean'))
    }
    assert.ok(!JSON.stringify(logs).includes('@'))
    assert.ok(!JSON.stringify(logs).includes('sensitive'))
  } finally {
    console.warn = warn
    delete globalThis.__adminContext
    if (previous === undefined) delete process.env.ADMIN_EMAILS
    else process.env.ADMIN_EMAILS = previous
  }
})

const validSubmission = {
  name_or_studio: 'Studio', email: ' DEV@example.com ', game_title: 'Puzzle',
  demo_url: 'https://example.com/game', game_type: 'Puzzle', category_names: ['Puzzle'],
  short_description: 'Un puzzle', long_description: 'Presentation du jeu',
  mobile_compatibility: 'mobile-compatible', sensitive_content: 'none',
  ownership_confirmed: true, has_ads: 'unknown',
}
const req = (body) => new Request('https://example.com/api/test', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
beforeEach(() => {
  process.env.PASSWORD_RESET_CODE_SECRET = 'test-secret-with-at-least-32-characters'
  process.env.RESEND_API_KEY = 'test-key'
  process.env.RESEND_FROM_EMAIL = 'test@example.com'
  delete process.env.VERCEL
  globalThis.__phase0 = {
    after: [], calls: [],
    send: async () => ({ data: { id: 'email-id' }, error: null }),
    admin: {
      rpc: async (name, args) => {
        globalThis.__phase0.calls.push([name, args])
        return { data: [], error: null }
      },
      from: (table) => ({
        insert: async (payload) => {
          globalThis.__phase0.calls.push(['insert', table, payload])
          return { error: null }
        },
        update: (payload) => ({ eq: (_key, id) => ({ is: async () => {
          globalThis.__phase0.calls.push(['invalidate', table, id, payload])
          return { error: null }
        } }) }),
      }),
      auth: { admin: { updateUserById: async (...args) => {
        globalThis.__phase0.calls.push(['update-password', ...args])
        return { error: null }
      } } },
    },
  }
})

test('public submission cannot inject review fields or ids', async () => {
  const response = await submitGame(req({ ...validSubmission, status: 'accepted', admin_notes: 'injected', id: 'injected', created_at: '2000' }))
  assert.equal(response.status, 200)
  const payload = globalThis.__phase0.calls[0][2]
  assert.equal(payload.status, 'pending')
  assert.equal(payload.admin_notes, null)
  assert.equal(payload.email, 'dev@example.com')
  assert.equal('id' in payload, false)
  assert.equal('created_at' in payload, false)
})

test('submission rejects bad types, URLs, lengths and enums before writing', () => {
  for (const patch of [
    { ownership_confirmed: 'true' }, { email: 'bad' }, { game_title: 'x'.repeat(161) },
    { demo_url: 'javascript:alert(1)' }, { demo_url: 'https://user:pass@example.com/' },
    { sensitive_content: 'invalid' }, { mobile_compatibility: 'invalid' },
    { category_names: Array(9).fill('a') }, { category_names: [42] }, { has_ads: {} },
  ]) assert.throws(() => validateGameSubmission({ ...validSubmission, ...patch }))
})

test('JSON input rejects malformed objects and bounded streaming bodies', async () => {
  for (const value of [null, [], 'text']) await assert.rejects(() => readJsonObject(req(value)))
  await assert.rejects(() => readJsonObject(req({ value: 'x'.repeat(200) }), 100), { status: 413 })
  await assert.rejects(() => readJsonObject(new Request('https://example.com', { method: 'POST', body: '{' })), { status: 415 })
  await assert.rejects(() => readJsonObject(new Request('https://example.com', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })), { status: 400 })
})

test('reset inputs normalize email, preserve leading zeroes and bound password', () => {
  assert.equal(resetEmail({ email: ' Test@example.com ' }), 'test@example.com')
  assert.equal(resetCode({ code: '000123' }), '000123')
  for (const code of ['12345', '1234567', 'abcdef', 123456]) assert.throws(() => resetCode({ code }))
  assert.throws(() => resetPassword({ password: 'short' }))
  assert.throws(() => resetPassword({ password: 'x'.repeat(129) }))
  assert.equal(resetPassword({ password: ' valid password ' }), ' valid password ')
  assert.notEqual(hashPasswordResetCode('a@example.com', '000123'), hashPasswordResetCode('b@example.com', '000123'))
})

test('untrusted forwarded headers cannot bypass client quota', () => {
  const a = new Request('https://example.com', { headers: { 'x-vercel-forwarded-for': '1.2.3.4' } })
  const b = new Request('https://example.com', { headers: { 'x-vercel-forwarded-for': '5.6.7.8' } })
  assert.equal(passwordResetClientHash(a), passwordResetClientHash(b))
  process.env.VERCEL = '1'
  assert.notEqual(passwordResetClientHash(a), passwordResetClientHash(b))
})

test('request response is identical for account, missing account, quota and DB failure', async () => {
  const responses = []
  for (const result of [
    { data: [{ request_id: 'request-id', auth_user_id: 'user-id' }], error: null },
    { data: [{ request_id: 'request-id', auth_user_id: null }], error: null },
    { data: [], error: null }, { data: null, error: new Error('private database detail') },
  ]) {
    globalThis.__phase0.admin.rpc = async () => result
    const response = await requestReset(req({ email: 'test@example.com' }))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    responses.push(await response.text())
  }
  assert.equal(new Set(responses).size, 1)
  assert.equal(globalThis.__phase0.after.length, 1)
  assert.equal(globalThis.__phase0.calls.length, 0)
})

test('verify and confirm share the database attempt budget; confirm consumes before Auth', async () => {
  globalThis.__phase0.admin.rpc = async (name, args) => {
    globalThis.__phase0.calls.push([name, args])
    return { data: [{ auth_user_id: 'user-id' }], error: null }
  }
  const verify = await verifyReset(req({ email: 'test@example.com', code: '000123' }))
  assert.equal(verify.status, 200)
  assert.equal(globalThis.__phase0.calls[0][1].p_consume, false)
  assert.equal((await verify.text()).includes('user-id'), false)
  const confirm = await confirmReset(req({ email: 'test@example.com', code: '000123', password: 'safe password' }))
  assert.equal(confirm.status, 200)
  assert.equal(globalThis.__phase0.calls[1][1].p_consume, true)
  assert.equal(globalThis.__phase0.calls[2][0], 'update-password')
})

test('invalid confirmation never changes Auth, and provider errors stay private', async () => {
  const invalid = await confirmReset(req({ email: 'test@example.com', code: '000123', password: 'safe password' }))
  assert.equal(invalid.status, 400)
  assert.equal(globalThis.__phase0.calls.some(([name]) => name === 'update-password'), false)
  globalThis.__phase0.admin.rpc = async () => ({ data: [{ auth_user_id: 'user-id' }], error: null })
  globalThis.__phase0.admin.auth.admin.updateUserById = async () => ({ error: new Error('private auth detail') })
  const failed = await confirmReset(req({ email: 'test@example.com', code: '000123', password: 'safe password' }))
  assert.equal(failed.status, 503)
  assert.equal((await failed.text()).includes('private auth detail'), false)
})

test('Resend errors, thrown errors and missing delivery id invalidate the reserved code', async () => {
  for (const send of [
    async () => ({ error: { message: 'private provider detail' }, data: null }),
    async () => { throw new Error('private network detail') },
    async () => ({ error: null, data: null }),
  ]) {
    globalThis.__phase0.send = send
    await deliverPasswordReset('request-id', 'test@example.com', '000123')
  }
  assert.equal(globalThis.__phase0.calls.filter(([name]) => name === 'invalidate').length, 3)
  globalThis.__phase0.send = async () => ({ error: null, data: { id: 'email-id' } })
  await deliverPasswordReset('request-id', 'test@example.com', '000123')
  assert.equal(globalThis.__phase0.calls.length, 3)
})
