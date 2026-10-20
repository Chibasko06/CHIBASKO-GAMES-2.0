import {mkdtemp,rm,mkdir,writeFile,unlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {uploadRepository} from '../../lib/game-distribution/uploads/repository'
import {r2FromEnvironment} from '../../lib/game-distribution/uploads/r2'
import {assertUploadId} from '../../lib/game-distribution/uploads/policy'
import {processUpload} from './job'
import {reviewGame} from './review-job'
import {reviewFailureMessage} from './review-diagnostics'
import {configureReviewEnvironment,configurationFailure,ReviewConfigurationError} from '../../scripts/review-environment.mjs'
let phase='configuration'
async function main(){
 const id=process.argv[2];assertUploadId(id)
 if(process.argv.length!==3||process.versions.node.split('.')[0]!=='24')throw new ReviewConfigurationError('review_node_24_required')
 const env=process.env;configureReviewEnvironment(env)
 phase='storage_configuration'
 const db=uploadRepository(env.SUPABASE_URL??'',env.SUPABASE_SERVICE_ROLE_KEY??'')
 const staging=r2FromEnvironment(env,'STAGING'),artifacts=r2FromEnvironment(env,'ARTIFACTS')
 phase='scratch_setup'
 const base=resolve(env.GAME_BUILDS_SCRATCH_DIR??tmpdir());await mkdir(base,{recursive:true,mode:0o700})
 // A unique root prevents concurrent local commands from cleaning each other's files.
 const root=await mkdtemp(join(base,'chibasko-review-')),stop=new AbortController()
 let timer:ReturnType<typeof setTimeout>|undefined
 const shutdown=()=>{if(stop.signal.aborted)return;stop.abort();timer=setTimeout(()=>process.exit(1),80_000)}
 process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown)
 try{
  const probe=join(root,'write-check');await writeFile(probe,'',{mode:0o600,flag:'wx'});await unlink(probe)
  phase='review_job'
  const result=await reviewGame(id,db,value=>processUpload(value,db,staging,artifacts,undefined,{signal:stop.signal,scratchRoot:root,onFailure:failure=>console.error(JSON.stringify({event:'review_job_failed',...failure}))}))
  if(stop.signal.aborted)throw new Error('interrupted')
  console.log(JSON.stringify({uploadId:id,status:result.status,gameVersionId:result.gameVersionId,published:false}))
 }finally{
  const previous=phase;phase='cleanup'
  clearTimeout(timer);process.off('SIGINT',shutdown);process.off('SIGTERM',shutdown);await rm(root,{recursive:true,force:true,maxRetries:3})
  phase=previous
 }
}
main().catch(error=>{console.error(error instanceof ReviewConfigurationError?configurationFailure(error):reviewFailureMessage(error,phase));process.exitCode=1})
