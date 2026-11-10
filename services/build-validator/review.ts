import {mkdtemp,rm,mkdir,writeFile,unlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {uploadRepository} from '../../lib/game-distribution/uploads/repository'
import {r2FromEnvironment} from '../../lib/game-distribution/uploads/r2'
import {assertUploadId} from '../../lib/game-distribution/uploads/policy'
import {processUpload} from './job'
import {reviewGame,ReviewOutcomeError,type ReviewState} from './review-job'
import {describeValidation} from '../../lib/game-distribution/validation-diagnostics'
import {reviewFailureMessage} from './review-diagnostics'
import {configureReviewEnvironment,configurationFailure,ReviewConfigurationError} from '../../scripts/review-environment.mjs'
let phase='configuration'
const flags=new Set(process.argv.slice(3))
async function main(){
 const id=process.argv[2];assertUploadId(id)
 if(process.versions.node.split('.')[0]!=='24')throw new ReviewConfigurationError('review_node_24_required')
 const env=process.env;configureReviewEnvironment(env)
 phase='storage_configuration'
 const db=uploadRepository(env.SUPABASE_URL??'',env.SUPABASE_SERVICE_ROLE_KEY??'')
 if(flags.has('--retry-internal')){
  const before=await db.call<ReviewState>('distribution_review_state',{p_id:id})
  if(before.status==='failed')await db.call('distribution_retry_validation',{p_actor:null,p_id:id,p_attempt:before.attempts})
 }
 const staging=r2FromEnvironment(env,'STAGING'),artifacts=r2FromEnvironment(env,'ARTIFACTS')
 phase='scratch_setup'
 const base=resolve(env.GAME_BUILDS_SCRATCH_DIR??tmpdir());await mkdir(base,{recursive:true,mode:0o700})
 // A unique root prevents concurrent local commands from cleaning each other's files.
 const root=await mkdtemp(join(base,'chibasko-review-')),stop=new AbortController()
 let timer:ReturnType<typeof setTimeout>|undefined
 const shutdown=()=>{if(stop.signal.aborted)return;stop.abort();timer=setTimeout(()=>process.exit(1),80_000)}
 process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown)
 let output=''
 try{
  const probe=join(root,'write-check');await writeFile(probe,'',{mode:0o600,flag:'wx'});await unlink(probe)
  phase='review_job'
  const result=await reviewGame(id,db,value=>processUpload(value,db,staging,artifacts,undefined,{signal:stop.signal,scratchRoot:root,retryTransient:false,onFailure:failure=>{if(flags.has('--details'))console.error(JSON.stringify({event:'review_job_failed',...failure}))}}))
  if(stop.signal.aborted)throw new Error('interrupted')
  output=flags.has('--json')?JSON.stringify({uploadId:id,status:result.status,gameVersionId:result.gameVersionId,published:false}):'Vérification technique réussie. La publication nécessite une décision administrative.'
 }finally{
  const previous=phase;phase='cleanup'
  clearTimeout(timer);process.off('SIGINT',shutdown);process.off('SIGTERM',shutdown);await rm(root,{recursive:true,force:true,maxRetries:3})
  phase=previous
 }
 console.log(output)
}
main().catch(error=>{
 if(flags.has('--json')&&error instanceof ReviewOutcomeError){
  console.error(JSON.stringify({status:error.state.status,uploadId:process.argv[2],attemptId:process.argv[2]+':'+(error.state.attempts??0),at:error.state.updatedAt??null,
   ...(error.state.diagnostic?describeValidation(error.state.diagnostic):{code:'DIAGNOSTIC_UNAVAILABLE',category:'undetermined',phase})}))
 }else {
  const message=error instanceof ReviewConfigurationError?configurationFailure(error):reviewFailureMessage(error,phase)
  console.error(flags.has('--json')?JSON.stringify({status:'interrupted',category:'undetermined',phase,message}):message)
 }
 process.exitCode=1
})
