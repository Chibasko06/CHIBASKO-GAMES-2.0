import type {UploadRepository} from '../../lib/game-distribution/uploads/contracts'
import {assertUploadId,UploadError} from '../../lib/game-distribution/uploads/policy'
import {parseValidationDiagnostic,type ValidationDiagnostic} from '../../lib/game-distribution/validation-diagnostics'
export type ReviewState={status:string;gameVersionId:string|null;attempts?:number;updatedAt?:string;errorCode?:string;diagnostic?:ValidationDiagnostic|null;reviewDecision?:string}
export class ReviewOutcomeError extends UploadError{constructor(readonly state:ReviewState){super('validation_failed',422)}}

/** processUpload may resolve after a persisted rejection; success requires a final DB check. */
export async function reviewGame(id:string,db:UploadRepository,process:(id:string)=>Promise<unknown>) {
  assertUploadId(id)
  const get=()=>db.call<ReviewState>('distribution_review_state',{p_id:id})
  const before=await get()
  if(before.status==='completed'&&before.gameVersionId)return before
  if(['failed','expired'].includes(before.status))throw new ReviewOutcomeError({...before,diagnostic:parseValidationDiagnostic(before.diagnostic)})
  if(['rejected','archived'].includes(before.reviewDecision??''))throw new UploadError('invalid_state',409)
  if(before.status!=='queued')throw new UploadError('invalid_state',409)
  let processingError:unknown
  try{await process(id)}catch(error){processingError=error}
  const after=await get()
  if(after.status!=='completed'||!after.gameVersionId){
    if(processingError&&!['failed','expired'].includes(after.status))throw processingError
    throw new ReviewOutcomeError({...after,diagnostic:parseValidationDiagnostic(after.diagnostic)})
  }
  return after
}
