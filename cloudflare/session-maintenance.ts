import {deliverModeration,type ModerationMailEnvironment} from '../lib/moderationDelivery'
import {deliverSubmissionNotifications,type NotificationEnvironment} from '../lib/game-distribution/submission-notifications'
import {uploadRepository} from '../lib/game-distribution/uploads/repository'
import type {UploadRepository} from '../lib/game-distribution/uploads/contracts'
import {processAccountDeletion,accountDeletionAuth} from '../lib/game-distribution/account-deletion'
import {accountCleanup,type CleanupBindings} from '../lib/game-distribution/account-cleanup'
import {withTimeout} from '../lib/asyncOperation'

type Environment=ModerationMailEnvironment & NotificationEnvironment & CleanupBindings & {GAME_ACCOUNT_DELETIONS_ENABLED?:string;GAME_SUBMISSION_NOTIFICATIONS_ENABLED?:string;SUPABASE_URL:string;SUPABASE_SERVICE_ROLE_KEY:string;GAME_SESSION_MAINTENANCE_ENABLED?:string;GAME_UPLOAD_MAINTENANCE_ENABLED?:string;CONTACT_RECEIPTS_MAINTENANCE_ENABLED?:string}
type Event={component:'session_maintenance';outcome:'completed'|'already_running'|'failed';durationMs:number}
export async function maintainSessions(db:UploadRepository,log:(event:Event)=>void=event=>console.info(JSON.stringify(event))){
 const started=Date.now();let outcome:Event['outcome']='failed'
 try{outcome=await db.call<boolean>('distribution_cleanup_sessions',{})?'completed':'already_running'}catch{}
 try{log({component:'session_maintenance',outcome,durationMs:Date.now()-started})}catch{}
 if(outcome==='failed')throw Error('session_maintenance_failed')
}
type Task='moderation'|'social'|'sessions'|'previews'|'launches'|'uploads'|'contact'|'notifications'|'accounts'|'health'|'cycle'
type Log={component:'maintenance';runId:string;task:Task;outcome:'completed'|'failed'|'deferred'|'attention_required';durationMs:number;count?:number;metric?:string}
type Options={db?:UploadRepository;log?:(event:Log)=>void;operationMs?:number;accountMs?:number;notificationMs?:number;notifications?:()=>Promise<number>;account?:(signal:AbortSignal)=>Promise<{state:string}|null>}
export async function runMaintenance(env:Environment,options:Options={}){
 const flags=[env.MODERATION_MAINTENANCE_ENABLED,env.GAME_SESSION_MAINTENANCE_ENABLED,env.GAME_UPLOAD_MAINTENANCE_ENABLED,env.CONTACT_RECEIPTS_MAINTENANCE_ENABLED,env.GAME_SUBMISSION_NOTIFICATIONS_ENABLED,env.GAME_ACCOUNT_DELETIONS_ENABLED]
 if(!flags.some(flag=>flag==='1'))return
 const runId=crypto.randomUUID(),start=Date.now(),operationMs=options.operationMs??8000,accountMs=options.accountMs??90000,notificationMs=options.notificationMs??75000
 if(!Number.isInteger(operationMs)||operationMs<1||operationMs>8000||!Number.isInteger(accountMs)||accountMs<1||accountMs>90000||!Number.isInteger(notificationMs)||notificationMs<1||notificationMs>75000)throw Error('invalid_maintenance_budget')
 const log=(task:Task,outcome:Log['outcome'],started:number,extra:Pick<Log,'count'|'metric'>={})=>{try{(options.log??(entry=>console.info(JSON.stringify(entry))))({component:'maintenance',runId,task,outcome,durationMs:Date.now()-started,...extra})}catch{}}
 let failures=0
 try{
  const fetcher:typeof fetch=(input,init)=>fetch(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(operationMs)]):AbortSignal.timeout(operationMs)})
  const source=options.db??uploadRepository(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,fetcher)
  const db:UploadRepository={call:(name,args)=>withTimeout(source.call(name,args),operationMs)}
  async function task(name:Task,operation:()=>Promise<unknown>,budget=operationMs){
   const started=Date.now()
   try{const result=await withTimeout(operation(),budget);log(name,result&&typeof result==='object'&&'state' in result&&result.state!=='completed'?'deferred':'completed',started,typeof result==='number'?{count:result}:{});return result}
   catch{failures++;log(name,'failed',started);return null}
  }
  if(env.GAME_SESSION_MAINTENANCE_ENABLED==='1'){
   await task('sessions',()=>maintainSessions(db,()=>{}))
   await task('previews',()=>db.call('distribution_cleanup_previews',{}))
   await task('launches',()=>db.call('distribution_cleanup_launches',{}))
   await task('social',()=>db.call('distribution_cleanup_social_notifications',{}))
  }
  if(env.MODERATION_MAINTENANCE_ENABLED==='1')await task('moderation',async()=>{
   const signal=AbortSignal.timeout(24000)
   await db.call('distribution_moderation_cleanup',{})
   return deliverModeration(db,env,{signal})
  },25000)
  if(env.GAME_UPLOAD_MAINTENANCE_ENABLED==='1')await task('uploads',()=>db.call('distribution_maintenance_uploads',{}))
  if(env.CONTACT_RECEIPTS_MAINTENANCE_ENABLED==='1')await task('contact',()=>db.call('contact_cleanup',{}))
  if(env.GAME_SUBMISSION_NOTIFICATIONS_ENABLED==='1')await task('notifications',async()=>{
   if(options.notifications)return options.notifications()
   let failed=false
   const signal=AbortSignal.timeout(Math.max(1,notificationMs-1))
   const count=await deliverSubmissionNotifications(db,env,{limit:env.GAME_ACCOUNT_DELETIONS_ENABLED==='1'?1:5,signal,log:entry=>{if(entry.outcome==='failed'||entry.outcome==='configuration_missing')failed=true;if(entry.outcome==='attention_required')log('notifications','attention_required',Date.now())}})
   if(failed)throw Error('notification_delivery_failed')
   return count
  },notificationMs)
  if(env.GAME_ACCOUNT_DELETIONS_ENABLED==='1')await task('accounts',async()=>{
   const signal=AbortSignal.timeout(Math.max(1,accountMs-1))
   if(options.account)return options.account(signal)
   const guarded:UploadRepository={async call(name,args){signal.throwIfAborted();const value=await db.call(name,args);signal.throwIfAborted();return value as never}}
   const auth=accountDeletionAuth(env)
   return processAccountDeletion({db:guarded,auth:{async exists(id){signal.throwIfAborted();const result=await withTimeout(auth.exists(id),12000);signal.throwIfAborted();return result},async remove(id){signal.throwIfAborted();await withTimeout(auth.remove(id),12000);signal.throwIfAborted()}},cleanup:accountCleanup(guarded,env,signal),log:entry=>log('accounts',entry.outcome==='completed'?'completed':'deferred',Date.now(),{metric:entry.phase})})
  },accountMs)
  const health=await task('health',()=>db.call<Record<string,number>>('distribution_maintenance_health',{}))
  if(health&&typeof health==='object')for(const metric of ['moderation_pending','moderation_attention','moderation_oldest_seconds','notifications_attention','accounts_attention','accounts_review','notifications_pending','notifications_oldest_seconds','accounts_pending','expired_uploads','expired_contacts']){
   const value=(health as Record<string,unknown>)[metric]
   if(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e12)log('health',(metric.endsWith('_attention')&&value>0)||(metric.endsWith('_oldest_seconds')&&value>3600)?'attention_required':'completed',Date.now(),{metric,count:value})
  }
 }catch{failures++;log('cycle','failed',start)}
 log('cycle',failures?'failed':'completed',start,{count:failures})
 if(failures)throw Error('maintenance_cycle_failed')
}
const worker={async scheduled(_event:unknown,env:Environment){await runMaintenance(env)},fetch(){return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}})}}
export default worker
