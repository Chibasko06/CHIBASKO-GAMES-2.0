import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

if (process.env.PGDATABASE !== 'chibasko_phase0_test' || process.env.PGHOST !== '127.0.0.1') {
  throw new Error('Use a disposable local cluster with PGDATABASE=chibasko_phase0_test and PGHOST=127.0.0.1. Never use production.')
}
const run = promisify(execFile)
const psql = process.env.PSQL_BIN || 'psql'
const args = ['-X', '-v', 'ON_ERROR_STOP=1', '-At']
async function sql(query) {
  return (await run(psql, [...args, '-c', query])).stdout.trim()
}
async function file(path) {
  await run(psql, [...args, '-f', fileURLToPath(new URL(path, import.meta.url))])
}
await file('./database-fixture.sql')
const migrations = [
  '20261007000100_retire_time_based_progression.sql',
  '20261007000200_secure_password_reset.sql',
  '20261007000300_secure_game_submissions.sql',
]
for (let pass = 0; pass < 2; pass++) {
  for (const migration of migrations) await file(`../supabase/migrations/${migration}`)
}
await file('./database-assertions.sql')
console.log('SQL assertions and migration reapplication passed')

await sql("insert into auth.users (email, raw_user_meta_data) values ('race@example.com', '{\"user_name\":\"race\"}')")
const reservations = await Promise.all(Array.from({ length: 12 }, () => sql(
  "set role service_role; select request_id from public.reserve_password_reset('race@example.com',repeat('a',64),repeat('6',64))",
)))
assert.equal(reservations.filter((value) => /[0-9a-f]{8}-/.test(value)).length, 1)
const confirmations = await Promise.all(Array.from({ length: 12 }, () => sql(
  "set role service_role; select auth_user_id from public.check_password_reset('race@example.com',repeat('a',64),true)",
)))
assert.equal(confirmations.filter((value) => /[0-9a-f]{8}-/.test(value)).length, 1)

await sql("insert into auth.users (email, raw_user_meta_data) values ('attempts@example.com', '{\"user_name\":\"attempts\"}')")
await sql("set role service_role; select * from public.reserve_password_reset('attempts@example.com',repeat('a',64),repeat('7',64))")
await Promise.all(Array.from({ length: 12 }, () => sql(
  "set role service_role; select * from public.check_password_reset('attempts@example.com',repeat('b',64),false)",
)))
assert.equal(await sql("select attempts from public.password_reset_codes where email='attempts@example.com'"), '5')
assert.equal(await sql("select count(*) from public.check_password_reset('attempts@example.com',repeat('a',64),true)"), '0')
console.log('Concurrent requests: one reservation, one consumption, five attempts maximum passed')
