import type {NextRequest} from 'next/server'
import {requireAdmin,adminJson} from '../_utils'
import {readData,logDataFailure} from '@/lib/dataAccess'

export async function GET(request:NextRequest){
 const access=await requireAdmin(request)
 if('error' in access)return access.error
 try{
  const {data}=await readData('admin_overview',access.supabaseAdmin.rpc('admin_console_overview',{p_actor:access.user.id}))
  const keys=['games','publishedGames','users','buildsAwaitingReview','buildsAwaitingValidation','deletionsAwaitingReview','deletionsBlocked','notificationsBlocked']
  if(!data||typeof data!=='object'||keys.some(key=>!Number.isSafeInteger((data as Record<string,number>)[key])||(data as Record<string,number>)[key]<0))throw Error('invalid_overview')
  return adminJson({overview:Object.fromEntries(keys.map(key=>[key,(data as Record<string,number>)[key]]))})
 }catch(error){logDataFailure('admin_overview',error,'database_unavailable');return adminJson({error:'La vue d’ensemble est temporairement indisponible.'},{status:503})}
}
