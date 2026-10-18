import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { parse, getDomain } from 'tldts'
import { readJson } from './read-json.mjs'

export const migrations = Object.freeze([
  '20261016000100_game_distribution_versions.sql',
  '20261016000200_game_build_uploads.sql',
  '20261016000300_game_artifact_previews.sql',
  '20261017000100_game_launch_sessions.sql',
  '20261017000200_game_launch_renewals.sql',
  '20261018000100_online_sessions.sql',
  '20261018000200_multiplayer_lobbies.sql',
  '20261018000300_artifact_catalogue_and_server_roster.sql',
  '20261018000400_control_plane_maintenance.sql',
])

const shared = ['GAME_CONTENT_BASE_DOMAIN', 'GAME_CONTENT_PUBLIC_BASE', 'GAME_CONTENT_PREVIEW_BASE', 'GAME_PORTAL_ORIGINS']
const database = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
const r2 = ['GAME_BUILDS_R2_ACCOUNT_ID', 'GAME_BUILDS_R2_ACCESS_KEY_ID', 'GAME_BUILDS_R2_SECRET_ACCESS_KEY', 'GAME_BUILDS_STAGING_BUCKET']
export const environments = Object.freeze({
  portal: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SITE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    'PASSWORD_RESET_CODE_SECRET', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'CHIBASKO_CLOUDFLARE',
    'GAME_DISTRIBUTION_UPLOADS_ENABLED', 'GAME_ARTIFACT_PREVIEWS_ENABLED', 'GAME_RUNTIME_LAUNCHES_ENABLED', ...shared, ...r2],
  gateway: [...database, ...shared, 'GAME_ARTIFACT_GATEWAY_ENABLED'],
  dispatcher: database,
  maintenance: [...database, 'GAME_SESSION_MAINTENANCE_ENABLED'],
  validator: [...database, ...r2, 'GAME_BUILDS_ARTIFACTS_BUCKET', 'GAME_BUILDS_QUEUE_ID', 'GAME_BUILDS_QUEUE_TOKEN'],
})

export function environmentChecks(component, env) {
  if (!Object.hasOwn(environments, component)) throw new Error('unknown_component')
  const checks = environments[component].map(name => ({ check: name, ok: typeof env[name] === 'string' && env[name].trim().length > 0 }))
  const add = (check, ok) => checks.push({ check, ok: Boolean(ok) })
  for (const name of environments[component].filter(name => name.endsWith('_ENABLED'))) add(name + ':boolean', ['0', '1'].includes(env[name]))
  for (const name of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SITE_URL'].filter(name => environments[component].includes(name))) {
    let valid = false
    try { const url = new URL(env[name]); valid = url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' } catch {}
    add(name + ':https_origin', valid)
  }
  if (shared.every(name => environments[component].includes(name))) {
    const base = env.GAME_CONTENT_BASE_DOMAIN ?? ''
    const suffix = parse('l-' + 'a'.repeat(48) + '.' + base, { allowPrivateDomains: true })
    add('content_private_psl_boundary', base.length <= 202 && suffix.isPrivate && suffix.publicSuffix === base)
    let origins = []
    try {
      origins = (env.GAME_PORTAL_ORIGINS ?? '').split(',').map(value => new URL(value.trim()))
      add('portal_origins', origins.length > 0 && origins.every(url => url.origin === url.href.slice(0, -1) && url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash))
    } catch { add('portal_origins', false) }
    for (const name of ['GAME_CONTENT_PUBLIC_BASE', 'GAME_CONTENT_PREVIEW_BASE', 'GAME_CONTENT_BASE_DOMAIN']) {
      const host = env[name] ?? '', p = parse(host, { allowPrivateDomains: true })
      add(name + ':separate_site', /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host)
        && host.length <= (name === 'GAME_CONTENT_BASE_DOMAIN' ? 202 : 218)
        && host.split('.').every(label => label.length <= 63)
        && origins.length > 0 && origins.every(url => {
          const site = getDomain(url.hostname, { allowPrivateDomains: true })
          return site && (p.isPrivate && p.publicSuffix === host ? url.hostname !== host && !url.hostname.endsWith('.' + host) : p.domain && p.domain !== site)
        }))
    }
  }
  for (const name of ['GAME_BUILDS_R2_ACCOUNT_ID', 'GAME_BUILDS_QUEUE_ID'].filter(name => environments[component].includes(name))) add(name + ':format', /^[a-f0-9]{32}$/.test(env[name] ?? ''))
  for (const name of ['GAME_BUILDS_STAGING_BUCKET', 'GAME_BUILDS_ARTIFACTS_BUCKET'].filter(name => environments[component].includes(name))) add(name + ':format', /^[a-z0-9][a-z0-9-]{1,62}$/.test(env[name] ?? ''))
  if (component === 'validator') add('separate_buckets', env.GAME_BUILDS_STAGING_BUCKET !== env.GAME_BUILDS_ARTIFACTS_BUCKET)
  return checks
}

export async function localChecks(root) {
  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'))
  const checks = []
  const add = (check, ok) => checks.push({ check, ok: Boolean(ok) })
  add('public_sdk_0_3_0', packageJson.dependencies?.['@chibaskogames/sdk'] === '0.3.0'
    && lock.packages?.['node_modules/@chibaskogames/sdk']?.version === '0.3.0')
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    add(field + ':registry_only', Object.entries(packageJson[field] ?? {}).every(([name, spec]) => !/^(?:git|github:|file:|workspace:)|github\.com/i.test(spec) && !name.includes('chibasko-pong')))
  }
  add('lock_registry_only', Object.values(lock.packages ?? {}).every(entry => !entry.link && (!entry.resolved || /^https:\/\/registry\.npmjs\.org\//.test(entry.resolved))))
  const names = (await readdir(resolve(root, 'supabase/migrations'))).filter(name => /^202610(?:16|17|18)/.test(name)).sort()
  add('migration_order', JSON.stringify(names) === JSON.stringify(migrations))
  const inventory = []
  for (const name of migrations) {
    const bytes = await readFile(resolve(root, 'supabase/migrations', name))
    const sql = bytes.toString('utf8')
    add(name + ':transaction', /\bbegin\s*;/i.test(sql) && /\bcommit\s*;\s*$/i.test(sql))
    inventory.push({ name, sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  return { checks, migrations: inventory }
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.log('node scripts/production-preflight.mjs [--component=portal|gateway|dispatcher|validator|maintenance] [--audit-report=PATH]\nRead-only local checks. Audit evidence must match the current lockfile. Environment values are never printed. No network, subprocess, file writes or resource activation. Remote readiness is NOT checked.')
    return
  }
  if (args.some(value => !/^--component=(portal|gateway|dispatcher|validator|maintenance)$/.test(value) && !/^--audit-report=.+$/.test(value))
    || new Set(args.map(value=>value.split('=')[0])).size!==args.length) throw new Error('invalid_arguments')
  const root = fileURLToPath(new URL('../', import.meta.url))
  const result = await localChecks(root)
  const component=args.find(value=>value.startsWith('--component='))?.split('=')[1]
  if (component) result.checks.push(...environmentChecks(component, process.env))
  const audit=args.find(value=>value.startsWith('--audit-report='))?.slice('--audit-report='.length)
  if(audit) {
    const report=await readJson(audit),lock=await readFile(resolve(root,'package-lock.json'))
    result.checks.push({check:'runtime_audit_current_lock',ok:report.format===1 && report.scope==='production'
      && report.lockfileSha256===createHash('sha256').update(lock).digest('hex')})
    result.checks.push({check:'runtime_audit_clean',ok:Array.isArray(report.packages) && report.packages.length===0
      && ['info','low','moderate','high','critical','total'].every(name=>report.counts?.[name]===0)})
  }
  result.ok = result.checks.every(check => check.ok)
  result.remoteReadiness = 'not_checked'
  result.bindingReadiness = 'not_checked'
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch(() => { console.error(JSON.stringify({ ok: false, error: 'preflight_failed' })); process.exitCode = 1 })
}
