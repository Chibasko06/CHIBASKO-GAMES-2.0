import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { localChecks, environmentChecks, environments } from '../scripts/production-preflight.mjs'

test('local inventory checks registry dependencies and ordered transactional migrations', async () => {
  const result = await localChecks(fileURLToPath(new URL('../', import.meta.url)))
  assert.equal(result.checks.every(check => check.ok), true)
  assert.equal(result.migrations.length, 9)
  assert.equal(result.migrations.every(item => /^[a-f0-9]{64}$/.test(item.sha256)), true)
})
test('missing environment fails without printing secret values', () => {
  const checks = environmentChecks('portal', { SUPABASE_SERVICE_ROLE_KEY: 'fixture-not-a-credential' })
  assert.equal(checks.every(check => check.ok), false)
  assert.equal(JSON.stringify(checks).includes('fixture-not-a-credential'), false)
  assert.throws(() => environmentChecks('unknown', {}), /unknown_component/)
})
test('a PRIVATE suffix is required and portal/content sites must be separate', () => {
  const env = Object.fromEntries(environments.gateway.map(name => [name, 'fixture']))
  Object.assign(env, { SUPABASE_URL: 'https://database.example', GAME_CONTENT_BASE_DOMAIN: 'github.io',
    GAME_CONTENT_PUBLIC_BASE: 'github.io', GAME_CONTENT_PREVIEW_BASE: 'github.io', GAME_PORTAL_ORIGINS: 'https://portal.example', GAME_ARTIFACT_GATEWAY_ENABLED: '0' })
  // Known PSL entry used only as parser input. No request or deployment to this domain.
  assert.equal(environmentChecks('gateway', env).every(check => check.ok), true)
  env.GAME_CONTENT_BASE_DOMAIN = 'content.example'
  assert.equal(environmentChecks('gateway', env).find(check => check.check === 'content_private_psl_boundary').ok, false)
  env.GAME_CONTENT_BASE_DOMAIN = 'github.io'
  env.GAME_PORTAL_ORIGINS = 'https://other.github.io'
  assert.equal(environmentChecks('gateway', env).find(check => check.check === 'GAME_CONTENT_BASE_DOMAIN:separate_site').ok, false)
})
test('validator requires separate buckets and canonical resource identifiers', () => {
  const env = Object.fromEntries(environments.validator.map(name => [name, 'fixture']))
  Object.assign(env, { SUPABASE_URL: 'https://database.example', GAME_BUILDS_R2_ACCOUNT_ID: 'a'.repeat(32), GAME_BUILDS_QUEUE_ID: 'b'.repeat(32), GAME_BUILDS_STAGING_BUCKET: 'staging-fixture', GAME_BUILDS_ARTIFACTS_BUCKET: 'artifacts-fixture' })
  assert.equal(environmentChecks('validator', env).every(check => check.ok), true)
  env.GAME_BUILDS_ARTIFACTS_BUCKET = env.GAME_BUILDS_STAGING_BUCKET
  assert.equal(environmentChecks('validator', env).find(check => check.check === 'separate_buckets').ok, false)
})
