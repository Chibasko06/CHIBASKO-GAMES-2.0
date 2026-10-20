import {setTimeout as delay} from 'node:timers/promises'
import {messageUploadId} from './queue'

type Message={body:unknown;lease_id:string}
export type ValidatorQueue={pull(signal?:AbortSignal):Promise<Message[]>;acknowledge(lease:string,retry?:boolean):Promise<unknown>}
type Dependencies={queue:ValidatorQueue;process:(id:string,signal:AbortSignal)=>Promise<unknown>;
  cleanup:()=>Promise<unknown>;log?:(event:string)=>void}
/** A resolved job includes a durable completed/failed/requeued decision, or a duplicate claim. */
export async function validatorLoop(deps:Dependencies,signal:AbortSignal,pollMs=5000) {
  let lastCleanup=0
  const log=(event:string)=>{try{deps.log?.(event)}catch{/* Observability cannot change queue admission. */}}
  while(!signal.aborted) {
    try {
      for(const message of await deps.queue.pull(signal)) {
        if(signal.aborted){await deps.queue.acknowledge(message.lease_id,true);break}
        let id:string
        try{id=messageUploadId(message.body)}catch{
          log('build_validator_invalid_message');await deps.queue.acknowledge(message.lease_id,true);continue
        }
        try {
          await deps.process(id,signal)
          await deps.queue.acknowledge(message.lease_id,signal.aborted)
        }catch{
          log(signal.aborted?'build_validator_interrupted':'build_validator_job_retry')
          await deps.queue.acknowledge(message.lease_id,true)
        }
      }
      if(!signal.aborted && Date.now()-lastCleanup>60_000){await deps.cleanup();lastCleanup=Date.now()}
    }catch{if(!signal.aborted)log('build_validator_cycle_failed')}
    if(!signal.aborted)await delay(pollMs,undefined,{signal}).catch(()=>{})
  }
}
