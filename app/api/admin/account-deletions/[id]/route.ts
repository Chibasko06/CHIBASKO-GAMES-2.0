import type {NextRequest} from 'next/server'
import {requireAdmin,readAdminJson,adminJson} from '../../_utils'
import {accountDeletionDependencies,deletionResponse,deletionUnavailable} from '@/lib/server/accountDeletion'
import {processAccountDeletion} from '@/lib/game-distribution/account-deletion'

export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const access=await requireAdmin(request);if('error' in access)return access.error
 try{
  const {id}=await params
  const data=await accountDeletionDependencies().db.call('distribution_account_status',{p_actor:access.user.id,p_id:id})
  return adminJson({deletion:data})
 }catch{return deletionUnavailable()}
}
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const access=await requireAdmin(request);if('error' in access)return access.error
 if(process.env.GAME_ACCOUNT_DELETIONS_ENABLED!=='1')return deletionUnavailable()
 let body:Record<string,unknown>
 try{
  body=await readAdminJson(request)
  if(Object.keys(body).length!==1||Object.keys(body).some(key=>key!=='reviewReference'&&key!=='retry'&&key!=='cancel')
   ||(body.reviewReference!==undefined&&(typeof body.reviewReference!=='string'||!/^[A-Za-z0-9_./-]{1,160}$/.test(body.reviewReference)))
   ||(body.reviewReference===undefined&&body.retry!==true&&body.cancel!==true))return adminJson({error:'Décision invalide.'},{status:400})
 }catch{return adminJson({error:'Décision invalide.'},{status:400})}
 try{
  const {id}=await params,deps=accountDeletionDependencies()
  if(body.cancel===true){await deps.db.call('distribution_account_cancel',{p_actor:access.user.id,p_id:id});return deletionResponse({id,state:'cancelled'})}
  const job=await deps.db.call<{id:string;state:string}>('distribution_account_review',{p_actor:access.user.id,p_id:id,p_reference:body.reviewReference??null})
  return deletionResponse(await processAccountDeletion(deps,id)??job)
 }catch{return deletionUnavailable()}
}
