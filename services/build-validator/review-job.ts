import type {UploadRepository} from '../../lib/game-distribution/uploads/contracts'
import {assertUploadId,UploadError} from '../../lib/game-distribution/uploads/policy'

/** processUpload may resolve after a persisted rejection; success requires a final DB check. */
export async function reviewGame(id:string,db:UploadRepository,process:(id:string)=>Promise<unknown>) {
  assertUploadId(id)
  type State={status:string;gameVersionId:string|null}
  const get=()=>db.call<State>('distribution_review_job',{p_id:id})
  const before=await get()
  if(before.status==='completed'&&before.gameVersionId)return before
  if(before.status!=='queued')throw new UploadError('invalid_state',409)
  await process(id)
  const after=await get()
  if(after.status!=='completed'||!after.gameVersionId)throw new UploadError('validation_failed',422)
  return after
}
