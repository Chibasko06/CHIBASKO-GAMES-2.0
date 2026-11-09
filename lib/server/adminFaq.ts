import 'server-only'
import type {NextRequest} from 'next/server'
import {requireAdmin,readAdminJson,adminJson} from '@/app/api/admin/_utils'
import {logDataFailure} from '@/lib/dataAccess'
import {InputError} from './inputValidation'
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
export async function mutateFaq(request:NextRequest,id?:string){
 const auth=await requireAdmin(request);if('error' in auth)return auth.error
 try{
  const body=await readAdminJson(request)
  if(Object.keys(body).some(key=>!['question','answer','sort_order','is_published','expected','expected_order','operationId','action'].includes(key)))throw new InputError()
  const action=request.method==='DELETE'?'delete':id?(body.action==='move'?'move':'save'):'create'
  if(body.action!==undefined&&(body.action!=='move'||!id||request.method!=='PATCH'))throw new InputError()
  const target=id??body.operationId??crypto.randomUUID();if(typeof target!=='string'||!uuid.test(target))throw new InputError()
  if(body.expected_order!==undefined&&(!Array.isArray(body.expected_order)||body.expected_order.some(value=>typeof value!=='string'||!uuid.test(value))))throw new InputError()
  const input:Record<string,unknown>={}
  if(action==='create'||action==='save'){
   if(typeof body.question!=='string'||!body.question.trim()||typeof body.answer!=='string'||!body.answer.trim()||typeof body.is_published!=='boolean')throw new InputError('Question, réponse et statut obligatoires.')
   input.question=body.question;input.answer=body.answer;input.is_published=body.is_published
  }
  if(action!=='delete'&&body.sort_order!==undefined){if(!Number.isSafeInteger(body.sort_order)||Number(body.sort_order)<1)throw new InputError('Position cible invalide.');input.sort_order=body.sort_order}
  const {data,error}=await auth.supabaseAdmin.rpc('admin_mutate_faq' as never,{p_actor:auth.user.id,p_action:action,p_id:target,p_input:input,p_expected:body.expected??null,p_order:body.expected_order??null} as never)
  if(error)throw error
  return adminJson(data)
 }catch(error){if(error instanceof InputError)return adminJson({error:error.message},{status:error.status});logDataFailure('admin_faq_mutation',error,'database_error');const code=error&&typeof error==='object'&&'code' in error?error.code:null;const status=code==='40001'||code==='23505'?409:code==='P0002'?404:code==='42501'?403:code==='22023'||code==='22P02'?400:503;return adminJson({error:status===409?'La FAQ a changé. Actualisez la liste avant de réessayer.':status===404?'Question introuvable.':status===403?'Autorisation refusée.':status===400?'Position ou formulaire invalide.':'La FAQ est temporairement indisponible.'},{status})}
}
