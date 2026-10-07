import { open, mkdir, readFile, unlink } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { targets, migrateRow, rollbackEntry, origin, classify } from './media-migration-core.mjs'
import { localSource, readLocalThumbnail } from './local-thumbnail-source.mjs'

export function options(args) {
  const result = { apply: false, rollback: false, journal: '.media-migration/journal.jsonl' }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') result.apply = true
    else if (args[i] === '--local-thumbnails') { result.local = true; result.journal = '.media-migration/local-thumbnails.jsonl' }
    else if (args[i] === '--dry-run') { /* default */ }
    else if (args[i] === '--rollback') result.rollback = true
    else if (args[i] === '--journal' && args[i + 1] && !args[i + 1].startsWith('--')) result.journal = args[++i]
    else throw new Error('invalid-option')
  }
  if (args.includes('--dry-run') && result.apply) throw new Error('conflicting-options')
  return result
}

export async function main(args = process.argv.slice(2)) {
  const config = options(args)
  const required = name => { if (!process.env[name]) throw new Error(`missing-${name}`); return process.env[name] }
  const supabaseUrl = required('NEXT_PUBLIC_SUPABASE_URL')
  const parsed = new URL(supabaseUrl)
  if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) throw new Error('invalid-supabase-url')
  const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceKey.startsWith('sb_secret_')) {
    try { if (JSON.parse(Buffer.from(serviceKey.split('.')[1], 'base64url')).role !== 'service_role') throw 0 } catch { throw new Error('server-key-required') }
  }
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const update = async (target, id, oldUrl, newUrl) => {
    const { data, error } = await db.from(target.table).update({ [target.column]: newUrl }).eq('id', id).eq(target.column, oldUrl).select('id')
    if (error) throw new Error('database-update-failed')
    return data.length === 1
  }
  let s3
  if (config.apply && !config.rollback) {
    const account = required('R2_ACCOUNT_ID')
    if (!/^[0-9a-f]{32}$/.test(account)) throw new Error('invalid-r2-account-id')
    s3 = new S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId: required('R2_ACCESS_KEY_ID'), secretAccessKey: required('R2_SECRET_ACCESS_KEY') }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' })
  }
  const bucket = 'chibasko-assets'
  const objects = {
    async ensure(key, bytes, contentType, metadata) {
      try {
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType, CacheControl: 'public,max-age=31536000,immutable', Metadata: metadata, IfNoneMatch: '*' }))
      } catch (error) {
        if (error?.$metadata?.httpStatusCode !== 412) throw new Error('r2-write-failed')
        // Existing objects are never overwritten; read-back below must match exactly.
      }
    },
    async read(key) {
      const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      return { bytes: await result.Body.transformToByteArray(), contentType: result.ContentType, metadata: result.Metadata || {} }
    },
  }
  const journalPath = resolve(config.journal)
  let lock, journalFile
  const counters = { total: 0, success: 0, planned: 0, skipped: 0, errors: 0 }
  const journal = async entry => {
    try { await journalFile.write(`${JSON.stringify(entry)}\n`); await journalFile.sync() }
    catch { throw new Error('journal-failed') }
  }
  try {
    if (config.apply) {
      await mkdir(dirname(journalPath), { recursive: true })
      lock = await open(`${journalPath}.lock`, 'wx', 0o600)
      journalFile = await open(journalPath, 'a', 0o600)
    }
    console.log(config.apply ? 'APPLY — sources conservées' : 'DRY-RUN — aucune écriture')
    if (config.rollback) {
      const lines = (await readFile(journalPath, 'utf8')).split('\n').filter(Boolean)
      const entries = new Map()
      for (const line of lines) {
        const entry = JSON.parse(line)
        if (entry.state !== 'prepared' && entry.state !== 'committed') continue
        const target = targets.find(t => t.table === entry.table && t.column === entry.column)
        if (!target || typeof entry.oldUrl !== 'string' || !entry.newUrl?.startsWith(`${origin}/${target.prefix}/`)) throw new Error('invalid-journal')
        entries.set(`${entry.table}:${entry.id}:${entry.newUrl}`, { entry, target })
      }
      for (const { entry, target } of [...entries.values()].reverse()) {
        counters.total++
        const state = await rollbackEntry({ target, entry, apply: config.apply, update, journal })
        counters[state]++
      }
    } else {
      for (const target of config.local ? targets.filter(t => t.table === 'games') : targets) {
        const before = { ...counters }
        let cursor
        while (true) {
          let query = db.from(target.table).select(`id,${target.column}`).order('id').limit(200)
          if (cursor !== undefined) query = query.gt('id', cursor)
          const { data, error } = await query
          if (error) throw new Error('inventory-read-failed')
          if (!data.length) break
          for (const row of data) {
            if (config.local && !(typeof row[target.column] === 'string' && row[target.column].startsWith('/') && !row[target.column].startsWith('//'))) continue
            counters.total++
            try {
              const local = config.local ? localSource(row[target.column]) : null
              const state = await migrateRow({ target, row, supabaseUrl, apply: config.apply, objects, update, journal,
                sourceOverride: local, validateDryRun: !!config.local,
                download: async source => {
                  if (config.local) return readLocalThumbnail(fileURLToPath(new URL('../public/', import.meta.url)), source)
                  const { data: blob, error: failure } = await db.storage.from(source.bucket).download(source.path)
                  if (failure || !blob) throw new Error('source-download-failed')
                  if (blob.size > 8 * 1024 * 1024) throw new Error('source-too-large')
                  return new Uint8Array(await blob.arrayBuffer())
                },
              })
              const source = local || classify(row[target.column], supabaseUrl)
              console.log(JSON.stringify({ table: target.table, id: row.id, state, ...(source.bucket ? { source_bucket: source.bucket } : {}) }))
              if (['invalid', 'unsupported-supabase'].includes(state)) counters.errors++
              else if (state === 'success' || state === 'planned') counters[state]++
              else counters.skipped++
            } catch (failure) {
              counters.errors++
              const safeCodes = ['invalid-local-path', 'outside-public', 'invalid-file-size', 'extension-mismatch', 'database-update-failed', 'verification-failed', 'journal-failed', 'source-download-failed', 'source-too-large', 'r2-write-failed', 'invalid-owner', 'invalid-avatar', 'invalid-dimensions']
              console.error(JSON.stringify({ table: target.table, id: row.id, state: 'error', stage: safeCodes.includes(failure?.message) ? failure.message : 'validation-or-storage-failed' }))
              if (failure?.message === 'journal-failed') throw failure
            }
          }
          cursor = data.at(-1).id
        }
        console.log(JSON.stringify({ table: target.table, summary: Object.fromEntries(Object.entries(counters).map(([key, count]) => [key, count - before[key]])) }))
      }
    }
  } finally {
    console.log(JSON.stringify(counters))
    await journalFile?.close()
    await lock?.close()
    if (lock) await unlink(`${journalPath}.lock`)
    s3?.destroy()
  }
  if (counters.errors) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Migration interrompue. Vérifier configuration, journal et accès ; aucun détail sensible affiché.'); process.exitCode = 1 })
}
