import { uploadRepository } from '../../lib/game-distribution/uploads/repository'
import { r2FromEnvironment } from '../../lib/game-distribution/uploads/r2'
import { CloudflarePullQueue, cleanupUploads } from './queue'
import { processUpload } from './job'
import {validatorLoop} from './runtime'
import {scratchPath,prepareScratch,heartbeat} from './scratch'

async function main() {
const env=process.env
if(process.versions.node.split('.')[0]!=='24' || !env.GAME_BUILDS_STAGING_BUCKET
  || env.GAME_BUILDS_STAGING_BUCKET===env.GAME_BUILDS_ARTIFACTS_BUCKET)throw new Error('invalid_configuration')
const db=uploadRepository(env.SUPABASE_URL ?? '',env.SUPABASE_SERVICE_ROLE_KEY ?? '')
const staging=r2FromEnvironment(env,'STAGING'),artifacts=r2FromEnvironment(env,'ARTIFACTS')
const queue=new CloudflarePullQueue(env.GAME_BUILDS_R2_ACCOUNT_ID ?? '',env.GAME_BUILDS_QUEUE_ID ?? '',env.GAME_BUILDS_QUEUE_TOKEN ?? '')
const root=scratchPath(env),stop=new AbortController();let deadline:ReturnType<typeof setTimeout>|undefined
const shutdown=()=>{
  if(stop.signal.aborted)return
  stop.abort()
  // Hard termination remains recoverable through the DB lease and startup scratch cleanup.
  deadline=setTimeout(()=>{console.error('build_validator_shutdown_timeout');process.exit(1)},80_000)
}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown)
let pulse:ReturnType<typeof setInterval>|undefined,pending=Promise.resolve()
try {
  await prepareScratch(root);await heartbeat(root)
  pulse=setInterval(()=>{pending=pending.then(()=>heartbeat(root,stop.signal.aborted)).catch(()=>{console.error('build_validator_health_failed');shutdown()})},10_000)
  console.log('build_validator_started')
  await validatorLoop({queue,process:(id,signal)=>processUpload(id,db,staging,artifacts,undefined,{signal,scratchRoot:root}),
    cleanup:()=>cleanupUploads(db,staging,artifacts,stop.signal),log:event=>console.log(event)},stop.signal)
}finally{
  clearInterval(pulse);await pending;await heartbeat(root,true).catch(()=>{})
  clearTimeout(deadline);process.off('SIGINT',shutdown);process.off('SIGTERM',shutdown)
}
console.log('build_validator_stopped')
}
main().catch(()=>{console.error('build_validator_startup_or_shutdown_failed');process.exitCode=1})
