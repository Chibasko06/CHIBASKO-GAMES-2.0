import { NextRequest } from 'next/server'
import {readAllRows} from '@/lib/pagination'
import { requireAdmin, adminJson, adminErrorMessage } from '../_utils'

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck
  const {data,error}=await readAllRows('admin_historical_submissions',(from,to)=>supabaseAdmin.from('game_submissions').select('*',{count:'exact'}).order('created_at',{ascending:false}).order('id').range(from,to)).then(data=>({data,error:null}),error=>({data:[],error}))

  if (error) {
    return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
  }

  return adminJson({ submissions: data ?? [] })
}
