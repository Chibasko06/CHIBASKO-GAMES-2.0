import * as zip from '@zip.js/zip.js'
import {BuildValidationError} from '../../lib/game-distribution/manifest'
import {ArtifactPathError} from '../../lib/game-distribution/paths'
import {parseValidationDiagnostic,type ValidationDiagnostic} from '../../lib/game-distribution/validation-diagnostics'
import {UploadError} from '../../lib/game-distribution/uploads/policy'

const zipErrors=new Set(Object.entries(zip).filter(([key,value])=>/^ERR_(?:BAD_FORMAT|INVALID_SIGNATURE|INVALID_CRC32|INVALID_UNCOMPRESSED_SIZE|INVALID_COMPRESSED_SIZE|LOCAL_FILE_HEADER_NOT_FOUND|CENTRAL_DIRECTORY_NOT_FOUND|EOCDR_NOT_FOUND|CRC32|INVALID_PASSWORD|UNSUPPORTED_COMPRESSION)/.test(key)&&typeof value==='string').map(([,value])=>value))
export function extractionDiagnostic(error:unknown):ValidationDiagnostic{
  if(error instanceof BuildValidationError||error instanceof ArtifactPathError){
    const reason=error instanceof BuildValidationError?error.code:error.message
    const safe=parseValidationDiagnostic({version:1,kind:'submission',reason,...error.diagnosticLocation})
    if(safe)return safe
  }
  if(error instanceof Error){
    if(error.message===zip.ERR_UNSAFE_FILENAME)return {version:1,kind:'submission',reason:'UNSAFE_ARTIFACT_PATH'}
    const code=(error as NodeJS.ErrnoException).code
    if(['ERR_ACCESS_DENIED','EACCES','EPERM'].includes(code??''))return {version:1,kind:'internal',reason:'EXTRACTOR_PERMISSION_DENIED'}
    if(['ENOSPC','ENOENT','EIO','EMFILE','ENFILE','EROFS'].includes(code??''))return {version:1,kind:'internal',reason:'EXTRACTOR_IO_ERROR'}
    if(zipErrors.has(error.message))return {version:1,kind:'submission',reason:'ZIP_FORMAT_INVALID'}
  }
  return {version:1,kind:'unknown',reason:'EXTRACTOR_ERROR'}
}
export class ExtractionFailure extends UploadError{
  constructor(readonly diagnostic:ValidationDiagnostic,timeout=false){super(timeout?'validation_timeout':'validation_failed',422)}
}
