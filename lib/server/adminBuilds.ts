import 'server-only'
import type {NextRequest} from 'next/server'
import {requireAdmin,adminJson,readAdminJson} from '@/app/api/admin/_utils'
import {uploadRepository} from '@/lib/game-distribution/uploads/repository'
import {UploadError,assertUploadId} from '@/lib/game-distribution/uploads/policy'
import {InputError} from './inputValidation'
import {launchHash} from '@/lib/game-distribution/gateway/launch'

export async function adminBuildRequest(request:NextRequest,id?:string) {
  const auth=await requireAdmin(request)
  if(auth.error)return auth.error
  try {
    if(id)assertUploadId(id)
    const db=uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'')
    if(request.method==='GET') {
      const offset=Number(new URL(request.url).searchParams.get('offset')??0)
      if(!Number.isInteger(offset)||offset<0||offset>100000)throw new UploadError('invalid_request',400)
      const data=await db.call<Record<string,unknown>|unknown[]>('distribution_admin_builds',{p_actor:auth.user.id,p_id:id??null,p_offset:offset})
      if(id && !Array.isArray(data)){
        data.developerProfile=await db.call('distribution_admin_developer_profile',{p_actor:auth.user.id,p_upload:id})
        data.integration=await db.call('distribution_admin_integration',{p_actor:auth.user.id,p_id:id})
      }
      return adminJson({data})
    }
    if(!id)throw new UploadError('invalid_request',400)
    const body=await readAdminJson(request,4096)
    if(body.action==='record_integration'){
      if(Object.keys(body).some(key=>!['action','launchId','generation','controlToken','mode','protocol'].includes(key))||typeof body.mode!=='string'||!['classic','sdk'].includes(body.mode)||typeof body.launchId!=='string'||typeof body.generation!=='string'||typeof body.controlToken!=='string'||!/^[a-f0-9]{64}$/.test(body.controlToken)
        ||(body.mode==='classic'?body.protocol!==null:![1,2].includes(Number(body.protocol))||typeof body.protocol!=='number'))throw new UploadError('invalid_request',400)
      assertUploadId(String(body.launchId));assertUploadId(String(body.generation))
      await db.call('distribution_record_integration_observation',{p_actor:auth.user.id,p_id:id,p_launch:body.launchId,p_generation:body.generation,p_control_hash:await launchHash(body.controlToken),p_mode:body.mode,p_protocol:body.protocol})
      return adminJson({data:await db.call('distribution_admin_integration',{p_actor:auth.user.id,p_id:id})})
    }
    if(body.action==='record_playtest'){
      if(Object.keys(body).some(key=>!['action','requestId','code'].includes(key))||typeof body.code!=='string'||!['hello_timeout','handshake_timeout','game_ready_timeout','launch_expired','launch_unavailable','unexpected_navigation','unknown'].includes(body.code))throw new UploadError('invalid_request',400)
      assertUploadId(String(body.requestId))
      await db.call('distribution_record_playtest',{p_actor:auth.user.id,p_id:id,p_request:body.requestId,p_code:body.code})
      return adminJson({recorded:true})
    }
    if(body.action==='retry_validation'){
      if(Object.keys(body).some(key=>!['action','attempt'].includes(key))||!Number.isSafeInteger(body.attempt)||Number(body.attempt)<0)throw new UploadError('invalid_request',400)
      await db.call('distribution_retry_validation',{p_actor:auth.user.id,p_id:id,p_attempt:body.attempt})
      return adminJson({data:await db.call('distribution_admin_builds',{p_actor:auth.user.id,p_id:id,p_offset:0})})
    }
    if(body.action==='request_correction'){
      if(Object.keys(body).some(key=>!['action','reason'].includes(key))||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>2000)throw new UploadError('invalid_request',400)
      return adminJson({data:await db.call('distribution_request_build_correction',{p_actor:auth.user.id,p_id:id,p_reason:body.reason.trim()})})
    }
    if(body.action==='compatibility'){
      if(Object.keys(body).some(k=>!['action','compatibility','expected'].includes(k))||typeof body.compatibility!=='string'||!['desktop','mobile','both','unknown'].includes(body.compatibility)||typeof body.expected!=='string'||body.expected.length>500)throw new UploadError('invalid_request',400)
      return adminJson({data:await db.call('distribution_admin_compatibility',{p_actor:auth.user.id,p_upload:id,p_value:body.compatibility,p_expected:body.expected})})
    }
    if(typeof body.action!=='string'||Object.keys(body).some(k=>!['action','checklist','reason','submissionId'].includes(k)) ||
      !['review','publish','reject','archive','link_submission'].includes(String(body.action)))throw new UploadError('invalid_request',400)
    if(body.submissionId!==undefined&&body.submissionId!==null)assertUploadId(String(body.submissionId))
    if(body.reason!==undefined&&(typeof body.reason!=='string'||body.reason.length>2000))throw new UploadError('invalid_request',400)
    return adminJson({data:await db.call('distribution_review_action',{p_actor:auth.user.id,p_id:id,p_action:body.action,
      p_checklist:body.checklist??{},p_reason:body.reason??null,p_submission:body.submissionId??null})})
  }catch(error){const safe=error instanceof UploadError?error:error instanceof InputError?new UploadError('invalid_request',error.status):new UploadError('service_unavailable',503)
    return adminJson({error:{code:safe.code}},{status:safe.status})}
}
