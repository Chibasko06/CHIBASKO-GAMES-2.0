import { BlobReader, ERR_UNSAFE_FILENAME, ZipReader } from '@zip.js/zip.js'
import { BuildValidationError, validateManifest } from './manifest'
import { assertArtifactPath } from './paths'
import { effectiveIntegration, type IntegrationMode } from './integration'
import type { UploadTarget } from './types'

import { UPLOAD_POLICY } from './uploads/policy'

const manifestLimit = UPLOAD_POLICY.maxManifestBytes
const inspectionBudget = 8 * 1024 * 1024

class InspectionLimit extends Error {}

class BoundedReader extends BlobReader {
  private remaining = inspectionBudget

  constructor(file: Blob, private readonly signal?: AbortSignal) {
    super(file)
  }

  override async readUint8Array(offset: number, length: number) {
    this.signal?.throwIfAborted()
    if (length > this.remaining) throw new InspectionLimit()
    this.remaining -= length
    return super.readUint8Array(offset, length)
  }
}

export async function inspectPublicationZip(file: Blob, target: UploadTarget, max: number, mode?: IntegrationMode, signal?: AbortSignal) {
  if (file.size > max) throw new BuildValidationError('ARCHIVE_SIZE_LIMIT')
  const reader = new ZipReader(new BoundedReader(file, signal), {
    strictness: 'strict', checkCrc32: true, checkLocalFilename: true, useWebWorkers: false,
  })
  try {
    const entries = new Map<string, number>()
    const names = new Set<string>()
    let rootManifest
    for await (const entry of reader.getEntriesGenerator()) {
      signal?.throwIfAborted()
      if (names.size >= 10_000) throw new InspectionLimit()
      const path = entry.directory ? entry.filename.replace(/\/$/, '') : entry.filename
      assertArtifactPath(path)
      const folded = path.toLowerCase()
      if (names.has(folded)) throw new BuildValidationError('DUPLICATE_BUILD_PATH', { path })
      names.add(folded)
      if (!entry.directory) {
        entries.set(path, entry.uncompressedSize)
        if (path === 'chibasko.json') rootManifest = entry
      }
    }
    if (!rootManifest || rootManifest.uncompressedSize > manifestLimit) {
      throw new BuildValidationError('ROOT_MANIFEST_REQUIRED')
    }
    if (rootManifest.encrypted || ![0, 8].includes(rootManifest.compressionMethod)) {
      throw new BuildValidationError('UNSUPPORTED_ARCHIVE_ENTRY', { path: 'chibasko.json' })
    }
    let size = 0
    const chunks: Uint8Array[] = []
    await rootManifest.getData(new WritableStream<Uint8Array>({
      write(chunk) {
        size += chunk.length
        if (size > manifestLimit || size > rootManifest.uncompressedSize) {
          throw new BuildValidationError('ARCHIVE_EXPANSION_LIMIT', { path: 'chibasko.json' })
        }
        chunks.push(chunk.slice())
      },
    }), { signal })
    if (size !== rootManifest.uncompressedSize) throw new BuildValidationError('ARCHIVE_SIZE_MISMATCH')
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.length
    }
    let value: unknown
    try {
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    } catch {
      throw new BuildValidationError('INVALID_MANIFEST_JSON', { path: 'chibasko.json' })
    }
    const manifest = validateManifest(value, target)
    if (mode && effectiveIntegration(manifest) !== mode) {
      throw new BuildValidationError('INTEGRATION_MODE_MISMATCH', { path: 'chibasko.json' })
    }
    for (const path of Object.values(manifest.client.entrypoints)) {
      if (!entries.get(path)) throw new BuildValidationError('ENTRYPOINT_MISSING', { path })
    }
    return { manifest, deferred: false } as const
  } catch (error) {
    if (error instanceof InspectionLimit) return { manifest: null, deferred: true } as const
    if (error instanceof BuildValidationError) throw error
    if (error instanceof Error && 'diagnosticLocation' in error) throw error
    if (error instanceof Error && error.message === ERR_UNSAFE_FILENAME) throw new BuildValidationError('UNSAFE_ARTIFACT_PATH')
    throw new BuildValidationError('ZIP_FORMAT_INVALID')
  } finally {
    await reader.close()
  }
}
