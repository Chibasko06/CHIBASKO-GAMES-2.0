import {pageNumber} from '@/lib/pagination'
import { NextRequest } from 'next/server'
import { requireAdmin, adminJson, adminErrorMessage } from '../_utils'
import {readData,logDataFailure} from '@/lib/dataAccess'

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck

  const page=pageNumber(new URL(request.url).searchParams.get('page'))
  const query=new URL(request.url).searchParams,search=query.get('search')??'',role=query.get('role')??'all'
  if(search.length>80||!['all','admin','developer'].includes(role))return adminJson({error:'Recherche ou rôle invalide.'},{status:400})
  try{
    const {data}=await readData('admin_users',supabaseAdmin.rpc('admin_console_users',{p_actor:adminCheck.user.id,p_offset:(page-1)*50,p_limit:50,p_search:search,p_role:role}))
    const result=data as unknown as {users:unknown[];total:number}|null
    if(!result||!Array.isArray(result.users)||result.users.length>50||!Number.isSafeInteger(result.total)||result.total<0)throw Error('invalid_users_response')
    return adminJson({users:result.users,total:result.total,page,pageSize:50})
  }catch(error){
    logDataFailure('admin_users',error,'database_unavailable')
    return adminJson({error:adminErrorMessage(error)},{status:503})
  }
}
