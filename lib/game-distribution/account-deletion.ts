import type {UploadRepository} from './uploads/contracts'
import {withTimeout} from '../asyncOperation'

export type DeletionJob={id:string;target:string|null;state:string;lease:string}
export type CleanupTask={id:string;kind:'staging'|'artifacts'|'avatars'|'cover';key:string;multipart:string|null;owner:string|null;cursor:string|null;lease:string}
export type DeletionDependencies={
 db:UploadRepository
 auth:{exists(id:string):Promise<boolean>;remove(id:string):Promise<void>}
 cleanup(task:CleanupTask):Promise<{done:boolean;cursor:string|null}>
 log?(entry:{event:'account_deletion';phase:string;outcome:'deferred'|'completed'}):void
}

export async function processAccountDeletion(deps:DeletionDependencies,id?:string){
 let job:DeletionJob|null=null,phase='database'
 try{
  job=await deps.db.call<DeletionJob|null>('distribution_account_claim',{p_id:id??null})
  if(!job)return null
  let state=job.state
  if(state==='pending')state=await deps.db.call<string>('distribution_account_prepare',{p_id:job.id,p_lease:job.lease})
  if(state==='review_required')return {id:job.id,state}
  if(state==='prepared'){
   phase='auth'
   if(!job.target)throw Error('missing_subject')
   if(await deps.auth.exists(job.target))await deps.auth.remove(job.target)
   if(await deps.auth.exists(job.target))throw Error('auth_still_present')
   phase='database'
   await deps.db.call('distribution_account_auth_deleted',{p_id:job.id,p_lease:job.lease})
  }
  phase='cleanup'
  // Une page par invocation borne la durée sans perdre le curseur de reprise.
  const task=await deps.db.call<CleanupTask|null>('distribution_account_cleanup_next',{p_id:job.id,p_lease:job.lease})
  if(task){
   const progress=await withTimeout(deps.cleanup(task),30000)
   await deps.db.call('distribution_account_cleanup_ack',{p_id:job.id,p_lease:job.lease,p_task:task.id,p_cursor:progress.cursor,p_done:progress.done})
  }
  const result=await deps.db.call<{id:string;state:string}>('distribution_account_release',{p_id:job.id,p_lease:job.lease,p_error:null})
  try{deps.log?.({event:'account_deletion',phase:'finished',outcome:result.state==='completed'?'completed':'deferred'})}catch{}
  return result
 }catch{
  const code=phase==='auth'?'auth_unavailable':phase==='cleanup'?'cleanup_unavailable':'database_unavailable'
  try{deps.log?.({event:'account_deletion',phase,outcome:'deferred'})}catch{}
  if(job){
   try{return await deps.db.call<{id:string;state:string}>('distribution_account_release',{p_id:job.id,p_lease:job.lease,p_error:code})}catch{}
  }
  throw Error('account_deletion_unavailable')
 }
}

export function accountDeletionAuth(env:{SUPABASE_URL?:string;NEXT_PUBLIC_SUPABASE_URL?:string;SUPABASE_SERVICE_ROLE_KEY?:string},fetcher:typeof fetch=fetch){
 const base=env.SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL,key=env.SUPABASE_SERVICE_ROLE_KEY
 if(!base||!key)throw Error('account_deletion_configuration')
 const call=async(id:string,method:string)=>{
  if(!/^[a-f0-9-]{36}$/.test(id))throw Error('invalid_subject')
  const response=await fetcher(new URL('/auth/v1/admin/users/'+id,base),{method,headers:{apikey:key,Authorization:'Bearer '+key},cache:'no-store',signal:AbortSignal.timeout(12000)})
  if(response.status===404){
   const error=await response.json().catch(()=>null)
   if(error?.code==='user_not_found')return false
  }
  if(!response.ok)throw Error('auth_unavailable')
  return true
 }
 return {exists:(id:string)=>call(id,'GET'),async remove(id:string){await call(id,'DELETE')}}
}
