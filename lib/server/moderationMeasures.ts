import 'server-only'
import {authorizeAdmin,createUserAuthClient} from './adminAuthorization'
import {adminOriginAllowed} from './adminRequest'
import {adminJson} from './adminResponses'
import {InputError,readJsonObject} from './inputValidation'
import {withTimeout} from '@/lib/asyncOperation'
import {uploadRepository} from '@/lib/game-distribution/uploads/repository'
import {UploadError} from '@/lib/game-distribution/uploads/policy'
import {logDataFailure} from '@/lib/dataAccess'

const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const id=(value:unknown)=>typeof value==='string'&&uuid.test(value)
const text=(value:unknown,min=10)=>typeof value==='string'&&value.trim().length>=min&&value.length<=5000&&!value.includes('\0')
export async function moderationMeasuresRequest(request:Request,scope:'admin'|'appeals'|'self'){
 try{
  if(request.method==='POST'&&!adminOriginAllowed(request))throw new InputError('Origine refusée.',403)
  const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1]
  if(!token)throw new InputError('Connexion requise.',401)
  const client=createUserAuthClient(token)
  let actor:string
  if(scope==='self'){
   const identity=await withTimeout(client.auth.getUser(token));if(identity.error||!identity.data.user)throw new InputError('Connexion requise.',401)
   actor=identity.data.user.id
  }else actor=(await authorizeAdmin(client,token)).id
  const query=new URL(request.url).searchParams
  if([...query.keys()].some(key=>query.getAll(key).length!==1))throw new InputError('Paramètre dupliqué.')
  const input=request.method==='POST'?await readJsonObject(request,16000):Object.fromEntries(query)
  if(request.method==='POST'&&scope==='admin'&&process.env.MODERATION_MEASURES_ENABLED!=='1'&&!['lift','restore'].includes(String(input.action)))throw new InputError('La création de mesures administratives n’est pas activée.',503)
  let result:unknown
  if(scope==='self'){
   const rpc=client.rpc as unknown as (name:string,args?:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message:string}|null}>
   if(request.method==='GET'&&input.view==='access'){
    if(Object.keys(input).length!==1)throw new InputError()
    const value=await withTimeout(rpc.call(client,'account_access'));if(value.error)throw value.error
    if(typeof value.data!=='boolean')throw Error('account_access_invalid')
    return adminJson({data:{blocked:!value.data}})
   }
   if(request.method==='GET'){if(Object.keys(input).some(key=>!['before','cursor'].includes(key))||(input.before===undefined)!==(input.cursor===undefined)||input.before!==undefined&&(typeof input.before!=='string'||input.before.length>40||!Number.isFinite(Date.parse(input.before))||!id(input.cursor)))throw new InputError();const value=await withTimeout(rpc.call(client,'moderation_self_status',input.before?{p_before:input.before,p_cursor:input.cursor}:{}));if(value.error)throw value.error;result=value.data}
   else{
    if(Object.keys(input).some(key=>!['operationId','measureId','description'].includes(key))||!id(input.operationId)||!id(input.measureId)||!text(input.description,20))throw new InputError('Recours invalide (20 à 5 000 caractères).')
    const value=await withTimeout(rpc.call(client,'moderation_appeal',{p_id:input.operationId,p_measure:input.measureId,p_description:input.description}))
    if(value.error){if(value.error.message==='decision_archived')throw new InputError('Décision archivée. Le contact direct reste disponible.',410);if(value.error.message==='request_conflict')throw new InputError('Un recours existe déjà pour cette décision.',409);if(value.error.message==='rate_limited')throw new InputError('Limite de recours atteinte. Le contact direct reste disponible.',429);if(value.error.message==='forbidden')throw new InputError('Décision inaccessible.',403);throw value.error}
    result=value.data
   }
  }else{
   const fields=scope==='admin'?['kind','target','before','cursor',...(request.method==='GET'?['subject']:[]),...(request.method==='POST'?['action','version','operationId','caseId','reason','note','endsAt']:[])]:['before','cursor',...(request.method==='POST'?['id','version','state','decision','lift','subjectVersion','operationId']:[])]
   if(Object.keys(input).some(key=>!fields.includes(key))||(input.before===undefined)!==(input.cursor===undefined)
    ||input.before!==undefined&&(typeof input.before!=='string'||input.before.length>40||!Number.isFinite(Date.parse(input.before))||!id(input.cursor)))throw new InputError('Demande ou pagination invalide.')
   if(scope==='admin'){
    if(input.subject!==undefined?(request.method!=='GET'||!id(input.subject)||input.target!==undefined||input.kind!==undefined):(!['player','game'].includes(String(input.kind))||!id(input.target)))throw new InputError('Cible invalide.')
    if(request.method==='POST'&&(!['warn','suspend','ban','lift','unpublish','restore'].includes(String(input.action))||!id(input.operationId)||!Number.isInteger(input.version)||Number(input.version)<0
      ||!text(input.reason)||typeof input.note!=='string'||!text(input.note,0)||input.caseId!==undefined&&!id(input.caseId)
      ||input.endsAt!==undefined&&(typeof input.endsAt!=='string'||!Number.isFinite(Date.parse(input.endsAt)))))throw new InputError('Décision invalide. Motif requis : 10 à 5 000 caractères.')
   }else if(request.method==='POST'&&(!id(input.id)||!Number.isInteger(input.version)||!['accepted','rejected'].includes(String(input.state))||!text(input.decision)
     ||typeof input.lift!=='boolean'||input.lift&&(!id(input.operationId)||!Number.isInteger(input.subjectVersion))))throw new InputError('Réexamen invalide.')
   if(scope==='admin'&&request.method==='POST'){
    const policy=process.env.MODERATION_MEASURES_RETENTION_DAYS
    const recovery=['lift','restore'].includes(String(input.action))
    if(policy!==undefined&&/^[1-9][0-9]{0,3}$/.test(policy)&&Number(policy)<=3650){
     input.retentionDays=Number(policy)
    }else if(!recovery)throw new InputError('Politique de conservation non configurée.',503)
   }
   result=await uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'').call(scope==='admin'?'distribution_moderation_measure':'distribution_moderation_appeals',{p_actor:actor,p_input:input})
  }
  return adminJson({data:result})
 }catch(error){
  if(error instanceof InputError)return adminJson({error:error.message},{status:error.status})
  if(error instanceof UploadError&&error.code==='moderation_scope_disabled')return adminJson({error:'La création de mesures est désactivée dans le périmètre serveur.',code:error.code},{status:503})
  if(error instanceof UploadError&&error.code==='moderation_target_not_allowed')return adminJson({error:'Cette cible ne fait pas partie des ressources autorisées pour la qualification.',code:error.code},{status:403})
  if(error&&typeof error==='object'&&'status' in error&&[401,403].includes(Number(error.status)))return adminJson({error:'Accès refusé.'},{status:Number(error.status)})
  if(error instanceof UploadError&&[400,404,409,429].includes(error.status))return adminJson({error:error.status===409?'La cible ou le dossier a changé. Actualise avant de décider à nouveau.':'Décision impossible dans cet état.',code:error.code},{status:error.status})
  logDataFailure('moderation_measures',error,'database_unavailable')
  return adminJson({error:'Le résultat ne peut pas être confirmé. Actualise avant de réessayer avec la même référence.'},{status:503})
 }
}
