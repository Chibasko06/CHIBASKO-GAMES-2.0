import 'server-only'
import {createUserAuthClient} from './adminAuthorization'
import {adminOriginAllowed} from './adminRequest'
import {adminJson} from './adminResponses'
import {InputError,readJsonObject} from './inputValidation'
import {withTimeout} from '@/lib/asyncOperation'
import {logDataFailure} from '@/lib/dataAccess'

const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const actions=['request','accept','reject','cancel','remove','block','unblock']
const kinds=['friends','incoming','outgoing','blocked']
const failures:Record<string,{status:number;message:string}>={
 social_invalid:{status:400,message:'Demande invalide.'},
 social_unauthorized:{status:401,message:'Connexion requise.'},
 social_inactive:{status:403,message:'Cette action n’est pas disponible pour ce compte.'},
 social_unavailable:{status:404,message:'Ce profil ou cette action n’est pas disponible.'},
 social_conflict:{status:409,message:'La relation a changé. Actualise les données avant de réessayer.'},
 social_rate_limited:{status:429,message:'Limite de demandes atteinte. Réessaie plus tard.'},
}

export async function socialRequest(request:Request) {
 if(!['GET','POST'].includes(request.method))return adminJson({error:'Méthode non autorisée.'},{status:405,headers:{Allow:'GET, POST'}})
 try {
  if(request.method==='POST'&&!adminOriginAllowed(request))throw new InputError('Origine refusée.',403)
  const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1]
  if(!token)throw new InputError('Connexion requise.',401)
  const db=createUserAuthClient(token)
  const identity=await withTimeout(db.auth.getUser(token))
  if(identity.error){if([400,401,403].includes(identity.error.status??0))throw new InputError('Session expirée.',401);throw identity.error}
  if(!identity.data.user)throw new InputError('Connexion requise.',401)
  let result
  if(request.method==='GET'){
   const query=new URL(request.url).searchParams,kind=query.get('kind')??'friends',before=query.get('before'),cursor=query.get('cursor')
   const target=query.get('target')
   if(target!==null){
    if([...query.keys()].length!==1||!uuid.test(target))throw new InputError('Profil invalide.')
    result=await withTimeout(db.rpc('social_relation',{p_target:target}))
   }else{
   if([...query.keys()].some(key=>!['kind','before','cursor'].includes(key)||query.getAll(key).length!==1)
    || !kinds.includes(kind)||(before===null)!==(cursor===null)
    ||(cursor!==null&&!uuid.test(cursor))||(before!==null&&(before.length>40||!/^\d{4}-\d\d-\d\dT/.test(before)||!Number.isFinite(Date.parse(before)))))throw new InputError('Pagination invalide.')
   result=await withTimeout(db.rpc('social_list',{p_kind:kind,...(before&&cursor?{p_before:before,p_cursor:cursor}:{})}))
   }
  }else{
   const body=await readJsonObject(request,2048,5000)
   if(Object.keys(body).some(key=>!['action','target','operationId','relationId'].includes(key))||typeof body.action!=='string'||!actions.includes(body.action)
    ||typeof body.target!=='string'||!uuid.test(body.target)||typeof body.operationId!=='string'||!uuid.test(body.operationId)
    ||(body.relationId!==undefined&&(typeof body.relationId!=='string'||!uuid.test(body.relationId)))
    ||(['accept','reject','cancel','remove','unblock'].includes(body.action)&&body.relationId===undefined))throw new InputError('Demande invalide.')
   result=await withTimeout(db.rpc('social_change',{p_action:body.action,p_target:body.target,p_operation:body.operationId,...(typeof body.relationId==='string'?{p_relation:body.relationId}:{})}))
  }
  if(result.error){
   const known=failures[result.error.message]
   if(known)return adminJson({error:known.message,code:result.error.message},{status:known.status})
   throw result.error
  }
  if(!result.data)throw new Error('social_response_missing')
  return adminJson(result.data)
 }catch(error){
  if(error instanceof InputError)return adminJson({error:error.message},{status:error.status})
  logDataFailure('social_request',error,'database_unavailable')
  return adminJson({error:'Les données sociales sont temporairement indisponibles. Actualise leur état avant de réessayer.',code:'social_unavailable_service'},{status:503})
 }
}
