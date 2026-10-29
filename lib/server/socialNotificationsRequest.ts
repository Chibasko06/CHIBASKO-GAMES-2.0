import 'server-only'
import {createUserAuthClient} from './adminAuthorization'
import {adminOriginAllowed} from './adminRequest'
import {adminJson} from './adminResponses'
import {InputError,readJsonObject} from './inputValidation'
import {withTimeout} from '@/lib/asyncOperation'
import {logDataFailure} from '@/lib/dataAccess'

const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
export async function socialNotificationsRequest(request:Request){
 if(!['GET','POST'].includes(request.method))return adminJson({error:'Méthode non autorisée.'},{status:405,headers:{Allow:'GET, POST'}})
 try{
  if(request.method==='POST'&&!adminOriginAllowed(request))throw new InputError('Origine refusée.',403)
  const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1]
  if(!token)throw new InputError('Connexion requise.',401)
  const db=createUserAuthClient(token),identity=await withTimeout(db.auth.getUser(token))
  if(identity.error){if([400,401,403].includes(identity.error.status??0))throw new InputError('Session expirée.',401);throw identity.error}
  if(!identity.data.user)throw new InputError('Connexion requise.',401)
  let result
  if(request.method==='GET'){
   const q=new URL(request.url).searchParams,view=q.get('view')??'all',before=q.get('before'),cursor=q.get('cursor'),search=q.get('search')??''
   if([...q.keys()].some(key=>!['view','before','cursor','search'].includes(key)||q.getAll(key).length!==1)
    ||!['navigation','count','all','shares','friends'].includes(view)||(before===null)!==(cursor===null)
    ||(cursor!==null&&!uuid.test(cursor))||(before!==null&&(before.length>40||!/^\d{4}-\d\d-\d\dT/.test(before)||!Number.isFinite(Date.parse(before))))
    ||search.length>32||(view!=='friends'&&q.has('search'))||(['navigation','count'].includes(view)&&(before!==null)))throw new InputError('Lecture invalide.')
   const position=before&&cursor?{p_before:before,p_cursor:cursor}:{}
   if(view==='navigation')result=await withTimeout(db.rpc('social_navigation'))
   else if(view==='count')result=await withTimeout(db.rpc('social_notifications_count'))
   else if(view==='friends')result=await withTimeout(db.rpc('social_share_friends',{p_search:search,...position}))
   else result=await withTimeout(db.rpc('social_notifications_page',{p_kind:view,...position}))
  }else{
   const body=await readJsonObject(request,10000,5000)
   if(body.action==='read'){
    if(Object.keys(body).some(key=>!['action','ids'].includes(key))||!Array.isArray(body.ids)||body.ids.length>200||body.ids.some(id=>typeof id!=='string'||!uuid.test(id)))throw new InputError('Notifications invalides.')
    result=await withTimeout(db.rpc('social_notifications_read',{p_ids:body.ids}))
   }else if(body.action==='share'){
    if(Object.keys(body).some(key=>!['action','target','gameId','operationId'].includes(key))||[body.target,body.gameId,body.operationId].some(id=>typeof id!=='string'||!uuid.test(id as string)))throw new InputError('Partage invalide.')
    result=await withTimeout(db.rpc('social_share_game',{p_target:body.target as string,p_game:body.gameId as string,p_operation:body.operationId as string}))
   }else throw new InputError('Action invalide.')
  }
  if(result.error){
   const failures:Record<string,[number,string]>={social_unauthorized:[401,'Connexion requise.'],social_invalid:[400,'Demande invalide.'],social_inactive:[403,'Ce compte ne peut pas utiliser cette fonction.'],social_unavailable:[404,'Le jeu ou le destinataire n’est plus disponible.'],social_conflict:[409,'La demande a changé. Actualise avant de réessayer.'],social_rate_limited:[429,'Limite atteinte : 20 partages par jour, un même jeu au même ami toutes les 24 heures.']}
   const failure=failures[result.error.message]
   if(failure)return adminJson({error:failure[1],code:result.error.message},{status:failure[0]})
   throw result.error
  }
  if(result.data===null)throw Error('social_notification_response_missing')
  return adminJson({data:result.data})
 }catch(error){
  if(error instanceof InputError)return adminJson({error:error.message},{status:error.status})
  logDataFailure('social_notifications',error,'database_unavailable')
  return adminJson({error:'Les notifications sont temporairement indisponibles. Un envoi interrompu peut avoir abouti : ne le répète pas automatiquement.'},{status:503})
 }
}
