import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readJsonObject, resetEmail, resetCode, resetPassword } from '../lib/server/inputValidation.ts'
import { validateGameSubmission } from '../lib/server/gameSubmissionValidation.ts'
import { deliverPasswordReset, hashPasswordResetCode, passwordResetClientHash } from '../lib/server/passwordReset.ts'
import { POST as requestReset } from '../app/api/auth/password-reset/request/route.ts'
import { POST as verifyReset } from '../app/api/auth/password-reset/verify/route.ts'
import { POST as confirmReset } from '../app/api/auth/password-reset/confirm/route.ts'
import { POST as submitGame } from '../app/api/game-submissions/route.ts'
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
