import type {NextRequest} from 'next/server'
import {requireAdmin,adminJson} from '../_utils'
import {deletionUnavailable} from '@/lib/server/accountDeletion'
import {readData} from '@/lib/dataAccess'
import {pageNumber} from '@/lib/pagination'
export async function GET(request:NextRequest){
 const access=await requireAdmin(request);if('error' in access)return access.error
 const query=new URL(request.url).searchParams,page=pageNumber(query.get('page')),state=query.get('state')??'all'
 if(!['all','review_required','pending','prepared','cleanup_pending','attention'].includes(state))return adminJson({error:'Statut invalide.'},{status:400})
 try{
  const {data}=await readData('admin_deletions_list',access.supabaseAdmin.rpc('admin_console_deletions',{p_actor:access.user.id,p_state:state,p_offset:(page-1)*50,p_limit:50}))
  const result=data as unknown as {deletions:unknown[];total:number}|null
  if(!result||!Array.isArray(result.deletions)||result.deletions.length>50||!Number.isSafeInteger(result.total)||result.total<0)throw Error('invalid_response')
  return adminJson({...result,page,pageSize:50})
 }
 catch{return deletionUnavailable()}
}
