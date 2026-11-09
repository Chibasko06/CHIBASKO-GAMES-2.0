import {mutateFaq} from '@/lib/server/adminFaq'
import { NextRequest } from 'next/server'
import {readAllRows} from '@/lib/pagination'
import { requireAdmin, adminJson, adminErrorMessage } from '../_utils'

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck
  const {data,error}=await readAllRows('admin_faq',(from,to)=>supabaseAdmin.from('faq_entries').select('*',{count:'exact'}).order('sort_order').order('created_at').order('id').range(from,to)).then(data=>({data,error:null}),error=>({data:[],error}))

  if (error) {
    return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
  }

  return adminJson({ faqEntries: data ?? [] })
}

export async function POST(request:NextRequest){return mutateFaq(request)}
