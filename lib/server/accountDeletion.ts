import 'server-only'
import {getCloudflareContext} from '@opennextjs/cloudflare'
import {uploadRepository} from '../game-distribution/uploads/repository'
import {accountDeletionAuth,processAccountDeletion} from '../game-distribution/account-deletion'
import {accountCleanup,type CleanupBindings} from '../game-distribution/account-cleanup'

export function accountDeletionDependencies(){
 const db=uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'')
 let bindings:CleanupBindings={}
 try{bindings=getCloudflareContext().env as CleanupBindings}catch{}
 return {db,auth:accountDeletionAuth({NEXT_PUBLIC_SUPABASE_URL:process.env.NEXT_PUBLIC_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY}),cleanup:accountCleanup(db,bindings),log:(entry:object)=>console.info(JSON.stringify(entry))}
}
export function deletionResponse(data:{id:string;state:string}){
 return Response.json({deletion:data,success:data.state==='completed'},
  {status:data.state==='completed'?200:202,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
}
export function deletionUnavailable(){
 return Response.json({error:'La suppression du compte est temporairement indisponible. Réessayez ultérieurement.'},{status:503,headers:{'Cache-Control':'private, no-store'}})
}
export async function requestAccountDeletion(actor:string,target:string,dependencies?:ReturnType<typeof accountDeletionDependencies>){
 if(process.env.GAME_ACCOUNT_DELETIONS_ENABLED!=='1')return deletionUnavailable()
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(target))return Response.json({error:'Compte invalide.'},{status:400,headers:{'Cache-Control':'private, no-store'}})
 try{
  const deps=dependencies??accountDeletionDependencies()
  const job=await deps.db.call<{id:string;state:string}>('distribution_account_request',{p_actor:actor,p_target:target})
  const result=job.state==='pending'?await processAccountDeletion(deps,job.id):null
  return deletionResponse(result??job)
 }catch(error){
  if(error&&typeof error==='object'&&'code' in error&&error.code==='last_admin')return Response.json({error:'Un autre administrateur doit être désigné avant cette suppression.'},{status:409,headers:{'Cache-Control':'private, no-store'}})
  return deletionUnavailable()
 }
}
