import { main } from './migrate-media.mjs'

// Reuse S3 verification, CAS database updates, durable journal and rollback.
main(['--local-thumbnails', ...process.argv.slice(2)]).catch(() => {
  console.error('Migration locale interrompue ; vérifier configuration et journal. Aucun secret affiché.')
  process.exitCode = 1
})
