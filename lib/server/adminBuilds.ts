import 'server-only'
import type {NextRequest} from 'next/server'
import {requireAdmin,adminJson,readAdminJson} from '@/app/api/admin/_utils'
import {uploadRepository} from '@/lib/game-distribution/uploads/repository'
import {UploadError,assertUploadId} from '@/lib/game-distribution/uploads/policy'
import {InputError} from './inputValidation'

export async function adminBuildRequest(request:NextRequest,id?:string) {
  const auth=await requireAdmin(request)
  if(auth.error)return auth.error
  try {
    if(id)assertUploadId(id)
    const db=uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'')
    if(request.method==='GET') {
      const offset=Number(new URL(request.url).searchParams.get('offset')??0)
      if(!Number.isInteger(offset)||offset<0||offset>100000)throw new UploadError('invalid_request',400)
      return adminJson({data:await db.call('distribution_admin_builds',{p_actor:auth.user.id,p_id:id??null,p_offset:offset})})
    }
    if(!id)throw new UploadError('invalid_request',400)
    const body=await readAdminJson(request,4096)
    if(typeof body.action!=='string'||Object.keys(body).some(k=>!['action','checklist','reason','submissionId'].includes(k)) ||
      !['review','publish','reject','archive','link_submission'].includes(String(body.action)))throw new UploadError('invalid_request',400)
    if(body.submissionId!==undefined&&body.submissionId!==null)assertUploadId(String(body.submissionId))
    if(body.reason!==undefined&&(typeof body.reason!=='string'||body.reason.length>2000))throw new UploadError('invalid_request',400)
    return adminJson({data:await db.call('distribution_review_action',{p_actor:auth.user.id,p_id:id,p_action:body.action,
      p_checklist:body.checklist??{},p_reason:body.reason??null,p_submission:body.submissionId??null})})
  }catch(error){const safe=error instanceof UploadError?error:error instanceof InputError?new UploadError('invalid_request',error.status):new UploadError('service_unavailable',503)
    return adminJson({error:{code:safe.code}},{status:safe.status})}
}
