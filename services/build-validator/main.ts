import { setTimeout } from 'node:timers/promises'
import { uploadRepository } from '../../lib/game-distribution/uploads/repository'
import { r2FromEnvironment } from '../../lib/game-distribution/uploads/r2'
import { CloudflarePullQueue, messageUploadId, cleanupUploads } from './queue'
import { processUpload } from './job'

const env=process.env
const db=uploadRepository(env.SUPABASE_URL ?? '',env.SUPABASE_SERVICE_ROLE_KEY ?? '')
const staging=r2FromEnvironment(env,'STAGING'),artifacts=r2FromEnvironment(env,'ARTIFACTS')
const queue=new CloudflarePullQueue(env.GAME_BUILDS_R2_ACCOUNT_ID ?? '',env.GAME_BUILDS_QUEUE_ID ?? '',env.GAME_BUILDS_QUEUE_TOKEN ?? '')
let stopped=false,lastCleanup=0
process.on('SIGINT',()=>{stopped=true});process.on('SIGTERM',()=>{stopped=true})
while(!stopped) {
  try {
    for(const message of await queue.pull()) {
      let id: string
      try{id=messageUploadId(message.body)}catch{await queue.acknowledge(message.lease_id);continue}
      try{await processUpload(id,db,staging,artifacts);await queue.acknowledge(message.lease_id)}
      catch{await queue.acknowledge(message.lease_id,true)}
    }
    if(Date.now()-lastCleanup>60_000){await cleanupUploads(db,staging,artifacts);lastCleanup=Date.now()}
  } catch {console.error('build_validator_cycle_failed')}
  if(!stopped)await setTimeout(5000)
}
