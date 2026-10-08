import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import assert from 'node:assert/strict'

// Always creates its own loopback-only cluster. Never reads a production DSN.
const exec = promisify(execFile)
const bin = process.env.CATALOGUE_TEST_PG_BIN ?? (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '')
const tool = name => bin ? join(bin, name + (process.platform === 'win32' ? '.exe' : '')) : name
const directory = await mkdtemp(join(tmpdir(), 'chibasko-catalogue-db-'))
const data = join(directory, 'data')
const socket = createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
// Do not inherit PGOPTIONS, PGSERVICE or other connection overrides.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('PG')))
const run = (name, args) => {
  if (name !== 'pg_ctl') return exec(tool(name), args, { env, timeout: 60000, maxBuffer: 1024 * 1024 })
  // On Windows the detached PostgreSQL process can retain captured pipe handles.
  return new Promise((resolve, reject) => {
    const child = spawn(tool(name), args, { env, stdio: 'ignore', windowsHide: true })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve({ stdout: '' }) : reject(new Error(`pg_ctl exited ${code}; inspect ${directory}`)))
  })
}
let started = false
try {
  console.log('Initializing disposable local PostgreSQL cluster.')
  await run('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--no-locale'])
  console.log('Starting loopback-only test cluster.')
  await run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'])
  started = true
  const base = ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres']
  await run('psql', [...base, '-d', 'postgres', '-c', 'CREATE DATABASE chibasko_catalogue_test'])
  const args = [...base, '-d', 'chibasko_catalogue_test']
  await run('psql', [...args, '-f', fileURLToPath(new URL('./game-catalogue-db.sql', import.meta.url))])
  await assert.rejects(run('psql', [...args, '-f', fileURLToPath(new URL('../supabase/migrations/20261008000100_catalogue_game_types.sql', import.meta.url))]))
  const check = await run('psql', [...args, '-Atc', "SELECT count(*) FROM public.games WHERE game_type = 'classic'"])
  assert.equal(check.stdout.trim(), '81')
  console.log('Catalogue SQL: 81 rows preserved, defaults, constraints, uniqueness, type changes, RLS and refused reapplication passed.')
} finally {
  if (started) await run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'])
  // Keep the disposable cluster and its log for inspection; no recursive deletion.
}
