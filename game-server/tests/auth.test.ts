import test from 'node:test'
import assert from 'node:assert/strict'
import { createSupabaseAuthenticator } from '../src/auth/supabaseAuth.js'

const now = 1800000000000
const jwt = (exp = now / 1000 + 60) => `e30.${Buffer.from(JSON.stringify({ exp, sub: 'forged-payload-id' })).toString('base64url')}.signature`
const profile = { id: 'verified-id', username: 'Database name', avatar_url: 'https://assets.chibaskogames.fr/avatars/test.png' }
function setup({ userError = false, network = false, row = profile as unknown, expired = false } = {}) {
  const requests: { url: URL; authorization: string | null }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    requests.push({ url, authorization: new Headers(init?.headers).get('Authorization') })
    if (network) throw new TypeError('offline')
    if (url.pathname === '/auth/v1/user') return Response.json(userError ? { message: 'invalid', code: 'bad_jwt' } : { id: 'verified-id', email: 'private@example.invalid' }, { status: userError ? 401 : 200 })
    assert.equal(url.pathname, '/rest/v1/profiles')
    assert.equal(url.searchParams.get('id'), 'eq.verified-id')
    return Response.json(row)
  }
  return { authenticate: createSupabaseAuthenticator('https://example.supabase.co', 'sb_publishable_test', fetcher, () => now), requests, token: jwt(expired ? now / 1000 - 1 : undefined) }
}
test('verified Auth ID and database profile are the only identity sources', async () => {
  const { authenticate, requests, token } = setup()
  assert.deepEqual(await authenticate(token), { userId: profile.id, username: profile.username, avatarUrl: profile.avatar_url, expiresAt: now + 60000 })
  assert.equal(requests.length, 2)
  assert.ok(requests.every(request => request.authorization === `Bearer ${token}`))
})
test('missing, malformed and rejected tokens fail closed', async () => {
  const basic = setup()
  await assert.rejects(basic.authenticate(undefined), /Authentication refused/)
  await assert.rejects(basic.authenticate('invalid'), /Authentication refused/)
  assert.equal(basic.requests.length, 0)
  const rejected = setup({ userError: true })
  await assert.rejects(rejected.authenticate(rejected.token), /Authentication refused/)
  assert.equal(rejected.requests.length, 1)
})
test('expiration is inspected after Auth validation; expired token never queries profile', async () => {
  const fixture = setup({ expired: true })
  await assert.rejects(fixture.authenticate(fixture.token))
  assert.equal(fixture.requests.length, 1)
  assert.equal(fixture.requests[0]?.url.pathname, '/auth/v1/user')
})
test('network failures, absent and invalid profiles fail closed', async () => {
  for (const options of [{ network: true }, { row: null }, { row: { ...profile, id: 'other' } }, { row: { ...profile, username: '' } }, { row: { ...profile, avatar_url: 'javascript:alert(1)' } }]) {
    const fixture = setup(options)
    await assert.rejects(fixture.authenticate(fixture.token), /Authentication refused/)
  }
})
test('null avatar accepted and private User fields discarded', async () => {
  const fixture = setup({ row: { ...profile, avatar_url: null } })
  const result = await fixture.authenticate(fixture.token)
  assert.equal(result.avatarUrl, null)
  assert.deepEqual(Object.keys(result).sort(), ['avatarUrl', 'expiresAt', 'userId', 'username'])
})
test('privileged configuration rejected', () => {
  assert.throws(() => createSupabaseAuthenticator('https://example.supabase.co', 'sb_secret_test'))
})
