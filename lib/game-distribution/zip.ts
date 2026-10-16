import { ZipReader, Uint8ArrayReader, type FileEntry } from '@zip.js/zip.js'
import { DEFAULT_BUILD_LIMITS, checkFileInventory, sha256, validateWebBuild } from './build'
import { BuildValidationError } from './manifest'
import { assertArtifactPath } from './paths'
import type { BuildFile, BuildLimits, UploadTarget } from './types'

/** In-memory, bounded ZIP validation. No filesystem extraction, execution or upload.
 * Future ingestion must also enforce job wall-time/CPU/memory and stream R2 input.
 */
export async function validateWebBuildZip(input: Uint8Array, target: UploadTarget, limits: BuildLimits = DEFAULT_BUILD_LIMITS) {
  if (input.byteLength > limits.maxArchiveBytes) throw new BuildValidationError('ARCHIVE_SIZE_LIMIT')
  const bytes = Uint8Array.from(input)
  const reader = new ZipReader(new Uint8ArrayReader(bytes), {strictness:'strict', useWebWorkers:false,
    checkCrc32:true, checkOverlappingEntry:true, checkLocalFilename:true})
  try {
    const entries: FileEntry[] = [], names = new Set<string>(), directories = new Set<string>()
    let count = 0
    for await (const entry of reader.getEntriesGenerator()) {
      if (++count > limits.maxFiles) throw new BuildValidationError('BUILD_FILE_LIMIT')
      const path = entry.directory ? entry.filename.replace(/\/$/, '') : entry.filename
      assertArtifactPath(path)
      const folded = path.toLowerCase(), mode = (entry.unixMode ?? 0) & 0o170000
      if (entry.encrypted || entry.symlink || entry.diskNumberStart !== 0
        || (mode && mode !== 0o100000 && mode !== 0o040000)
        || ![0,8].includes(entry.compressionMethod)) throw new BuildValidationError('UNSUPPORTED_ARCHIVE_ENTRY')
      if (names.has(folded) || directories.has(folded)) throw new BuildValidationError('DUPLICATE_BUILD_PATH')
      if (entry.directory) {
        if (entry.uncompressedSize !== 0) throw new BuildValidationError('INVALID_DIRECTORY_ENTRY')
        directories.add(folded)
      } else { names.add(folded); entries.push(entry) }
      if (entry.uncompressedSize > Math.max(1, entry.compressedSize) * limits.maxCompressionRatio) throw new BuildValidationError('ARCHIVE_RATIO_LIMIT')
    }
    checkFileInventory(entries.map(entry => ({path:entry.filename,size:entry.uncompressedSize})), limits)
    for (const file of names) for (const dir of directories) if (dir.startsWith(file+'/')) throw new BuildValidationError('BUILD_PATH_COLLISION')
    const files: BuildFile[] = []; let total = 0
    for (const entry of entries) {
      const chunks: Uint8Array[] = []; let size = 0
      await entry.getData(new WritableStream<Uint8Array>({write(chunk) {
        size += chunk.length; total += chunk.length
        if (size > limits.maxFileBytes || size > entry.uncompressedSize || total > limits.maxTotalBytes) throw new BuildValidationError('ARCHIVE_EXPANSION_LIMIT')
        chunks.push(Uint8Array.from(chunk))
      }}))
      if (size !== entry.uncompressedSize) throw new BuildValidationError('ARCHIVE_SIZE_MISMATCH')
      const content = new Uint8Array(size); let offset = 0
      for (const chunk of chunks) { content.set(chunk,offset); offset += chunk.length }
      files.push({path:entry.filename,bytes:content})
    }
    return Object.freeze({...await validateWebBuild(files,target,limits), archiveSha256:await sha256(bytes), archiveSize:bytes.length})
  } catch (error) {
    if (error instanceof BuildValidationError) throw error
    // Never leak parser-controlled filenames/messages through an eventual API.
    throw new BuildValidationError('INVALID_OR_UNSAFE_ARCHIVE')
  } finally { await reader.close() }
}
