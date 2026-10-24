import {pageNumber} from '@/lib/pagination'
import { NextRequest } from 'next/server'
import { requireAdmin, adminJson, adminErrorMessage } from '../_utils'

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck

  const page=pageNumber(new URL(request.url).searchParams.get('page'))
  const {data,error:profilesError}=await supabaseAdmin.rpc('catalogue_admin_users' as never,{p_actor:adminCheck.user.id,p_offset:(page-1)*50,p_limit:50} as never)

  if (profilesError) {
    return adminJson({ error: adminErrorMessage(profilesError) }, { status: 500 })
  }

  return adminJson({...data as object,page,pageSize:50})
}
