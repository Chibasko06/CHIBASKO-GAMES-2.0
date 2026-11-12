import type {NextRequest} from 'next/server'
import {adminJson,readAdminJson,requireAdmin} from '../../_utils'
import {uploadRepository} from '@/lib/game-distribution/uploads/repository'
import {UUID,UploadError} from '@/lib/game-distribution/uploads/policy'
import {externalGameUrl} from '@/lib/game-distribution/external-game-url'

const actions=['approve','publish','correction','reject','suspend','withdraw']
const reasonActions=['correction','reject','suspend','withdraw']
function repository(){
  return uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'',
    (input,init)=>fetch(input,{...init,cache:'no-store'}))
}
export async function GET(request:NextRequest){
  const admin=await requireAdmin(request)
  if('error' in admin)return admin.error
  const offset=Number(request.nextUrl.searchParams.get('offset')??0)
  if(!Number.isInteger(offset)||offset<0||offset>100000)return adminJson({error:'Page invalide.'},{status:400})
  try{
    return adminJson({data:await repository().call('distribution_admin_external_reviews',{p_actor:admin.user.id,p_offset:offset})})
  }catch{return adminJson({error:'Impossible de charger les révisions externes.'},{status:503})}
}
export async function POST(request:NextRequest){
  const admin=await requireAdmin(request)
  if('error' in admin)return admin.error
  let body
  try{body=await readAdminJson(request,8192)}catch{return adminJson({error:'Formulaire invalide.'},{status:400})}
  const {revisionId,action,reason,origin,checked}=body
  if(typeof revisionId!=='string'||!UUID.test(revisionId)||typeof action!=='string'||!actions.includes(action)
    ||Object.keys(body).some(key=>!['revisionId','action','reason','origin','checked'].includes(key))
    ||reason!==undefined&&(typeof reason!=='string'||reason.length>2000)
    ||reasonActions.includes(action)&&!(typeof reason==='string'&&reason.trim())){
    return adminJson({error:'Décision ou motif invalide.'},{status:400})
  }
  if(action==='approve'){
    try{if(checked!==true||externalGameUrl(origin).origin!==origin)throw Error()}
    catch{return adminJson({error:'Confirmez les vérifications et renseignez l’origine HTTPS examinée.'},{status:400})}
  }
  try{
    await repository().call('distribution_external_review',{p_actor:admin.user.id,p_revision:revisionId,
      p_action:action,p_reason:typeof reason==='string'?reason:null,
      p_reviewed_origin:action==='approve'?origin:null,p_checked:action==='approve'&&checked===true})
    return adminJson({data:{revisionId}})
  }catch(error){
    const code=error instanceof UploadError?error.code:'service_unavailable'
    const messages:Record<string,string>={
      external_review_conflict:'La révision ou son état a changé. Actualisez le dossier.',
      revision_not_found:'Révision introuvable.',forbidden:'Accès refusé.',
      invalid_state:'La fiche éditoriale de cette révision est incomplète.',
    }
    return adminJson({error:messages[code]??'Impossible d’enregistrer cette décision.'},
      {status:messages[code]?(error as UploadError).status:503})
  }
}
