import {deliverSubmissionNotifications,type NotificationEnvironment} from '../lib/game-distribution/submission-notifications'
import { uploadRepository } from '../lib/game-distribution/uploads/repository'
import type { UploadRepository } from '../lib/game-distribution/uploads/contracts'

type Environment=NotificationEnvironment & {GAME_SUBMISSION_NOTIFICATIONS_ENABLED?:string;SUPABASE_URL:string;SUPABASE_SERVICE_ROLE_KEY:string;GAME_SESSION_MAINTENANCE_ENABLED?:string}
type Event={component:'session_maintenance';outcome:'completed'|'already_running'|'failed';durationMs:number}
export async function maintainSessions(db:UploadRepository,log:(event:Event)=>void=event=>console.info(JSON.stringify(event))) {
  const started=Date.now()
  let outcome:Event['outcome']='failed'
  try {outcome=await db.call<boolean>('distribution_cleanup_sessions',{})?'completed':'already_running'}
  catch { /* RPC errors can contain SQL details; only the bounded outcome is logged. */ }
  const event:Event={component:'session_maintenance',outcome,durationMs:Date.now()-started}
  try {log(event)}catch { /* Logging cannot change cleanup or retry semantics. */ }
  if(outcome==='failed')throw new Error('session_maintenance_failed')
}
const worker={
  async scheduled(_event:unknown,env:Environment) {
    if(env.GAME_SESSION_MAINTENANCE_ENABLED!=='1' && env.GAME_SUBMISSION_NOTIFICATIONS_ENABLED!=='1')return
    const db=uploadRepository(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY)
    if(env.GAME_SUBMISSION_NOTIFICATIONS_ENABLED==='1')await deliverSubmissionNotifications(db,env,{limit:5})
    if(env.GAME_SESSION_MAINTENANCE_ENABLED==='1')await maintainSessions(db)
  },
  fetch(){return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}})},
}
export default worker
