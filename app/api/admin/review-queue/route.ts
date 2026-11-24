import type {NextRequest} from 'next/server'
import {requireAdmin,adminJson} from '../_utils'
import {uploadRepository} from '@/lib/game-distribution/uploads/repository'
export async function GET(request:NextRequest){
 const access=await requireAdmin(request);if('error' in access)return access.error
 const query=request.nextUrl.searchParams,kind=query.get('kind')??'review',offset=Number(query.get('offset')??0)
 if(!['review','validation'].includes(kind)||!Number.isSafeInteger(offset)||offset<0||offset>100000)return adminJson({error:'Filtre invalide.'},{status:400})
 try{const db=uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'');return adminJson({data:await db.call('distribution_admin_review_queue',{p_actor:access.user.id,p_kind:kind,p_offset:offset})})}
 catch{return adminJson({error:'La liste à examiner est indisponible.'},{status:503})}
}
