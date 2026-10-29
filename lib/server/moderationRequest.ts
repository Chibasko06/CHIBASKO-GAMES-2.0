import 'server-only'
import {createHmac} from 'node:crypto'
import {isIP} from 'node:net'
import {createUserAuthClient,authorizeAdmin} from './adminAuthorization'
import {adminJson} from './adminResponses'
import {adminOriginAllowed} from './adminRequest'
import {InputError,readJsonObject,isEmail} from './inputValidation'
import {withTimeout} from '@/lib/asyncOperation'
import {logDataFailure} from '@/lib/dataAccess'
import {uploadRepository} from '@/lib/game-distribution/uploads/repository'
import {UploadError} from '@/lib/game-distribution/uploads/policy'
import {reportCategories} from '@/lib/moderation'

export async function moderationRequest(request:Request,admin=false){
 try{
  if(!['GET','POST'].includes(request.method)||(!admin&&request.method!=='POST'))return adminJson({error:'Méthode non autorisée.'},{status:405})
  if(request.method==='POST'&&(!adminOriginAllowed(request)||(!admin&&request.headers.get('origin')!==new URL(request.url).origin)))throw new InputError('Origine refusée.',403)
  if(!admin&&process.env.MODERATION_ENABLED!=='1')throw new InputError('Les signalements intégrés ne sont pas encore disponibles. Contact : chibasko06@gmail.com.',503)
  const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1]
  let actor:string|null=null
  if(admin){
   if(!token)throw new InputError('Connexion requise.',401)
   actor=(await authorizeAdmin(createUserAuthClient(token),token)).id
  }else if(token){
   const identity=await withTimeout(createUserAuthClient(token).auth.getUser(token))
   if(identity.error){if([400,401,403].includes(identity.error.status??0))throw new InputError('Session expirée.',401);throw identity.error}
   if(!identity.data.user)throw new InputError('Connexion requise.',401)
   actor=identity.data.user.id
  }
  let input:Record<string,unknown>,client='',fingerprint=''
  if(admin){
   if(request.method==='GET'){const query=new URL(request.url).searchParams;if([...query.keys()].some(key=>query.getAll(key).length!==1))throw new InputError('Paramètre dupliqué.')}
   input=request.method==='GET'?Object.fromEntries(new URL(request.url).searchParams):await readJsonObject(request,65536,5000)
   if(Object.keys(input).some(key=>!['id','page','search','state','kind','action','version','justification','note','privacyReviewed','redactedDescription','redactNotes'].includes(key)))throw new InputError('Champ non autorisé.')
   if(request.method==='GET'&&input.action!==undefined)throw new InputError('Action invalide.')
   if(input.id!==undefined&&(typeof input.id!=='string'||!uuid.test(input.id)))throw new InputError('Dossier invalide.')
   if(input.search!==undefined&&(typeof input.search!=='string'||input.search.length>100)||input.page!==undefined&&(!/^\d{1,5}$/.test(String(input.page))||Number(input.page)<1||Number(input.page)>10000)
    ||input.state!==undefined&&!['','open','review','dismissed','resolved'].includes(String(input.state))||input.kind!==undefined&&!['','player','game'].includes(String(input.kind)))throw new InputError('Recherche ou pagination invalide.')
   if(request.method==='POST'){
    if(typeof input.privacyReviewed!=='boolean'||input.action!=='update'||!input.id||!Number.isInteger(input.version)||Number(input.version)<1||typeof input.state!=='string'||!['review','dismissed','resolved'].includes(input.state)
     ||typeof input.note!=='string'||input.note.length>5000||typeof input.justification!=='string'||input.justification.length>5000
     ||(['dismissed','resolved'].includes(input.state)&&input.justification.trim().length<10))throw new InputError('Décision ou justification invalide.')
    const retention=Number(process.env.MODERATION_CLOSED_RETENTION_DAYS)
    if(!Number.isInteger(retention)||retention<1||retention>3650)throw new InputError('La politique de conservation doit être configurée avant une décision.',503)
    input={...input,retentionDays:retention}
    if(typeof input.note==='string'&&input.note.includes('\0')||typeof input.justification==='string'&&input.justification.includes('\0')
     ||input.redactNotes!==undefined&&typeof input.redactNotes!=='boolean'
     ||input.redactedDescription!==undefined&&(typeof input.redactedDescription!=='string'||input.redactedDescription.trim().length<20||input.redactedDescription.length>5000||input.redactedDescription.includes('\0'))
     ||(input.redactedDescription!==undefined||input.redactNotes===true)&&String(input.note).trim().length<10)throw new InputError('Minimisation ou motif invalide.')
   }
  }else{
   input=await readJsonObject(request,16000,5000)
   if(Object.keys(input).some(key=>!['operationId','kind','target','category','description','contactName','contactEmail','goodFaith','sensitiveException','website','botToken'].includes(key)))throw new InputError('Champ non autorisé.')
   if(typeof input.operationId!=='string'||!uuid.test(input.operationId)||typeof input.kind!=='string'||!['player','game'].includes(input.kind)
    ||typeof input.category!=='string'||!Object.hasOwn(reportCategories[input.kind as 'player'|'game'],input.category)
    ||typeof input.description!=='string'||input.description.trim().length<20||input.description.length>5000||input.description.includes('\0')
    ||typeof input.target!=='string'||input.target.length>500||input.website!==''||typeof input.goodFaith!=='boolean'||typeof input.sensitiveException!=='boolean'
    ||(input.category==='illegal'&&!input.goodFaith)||(input.sensitiveException&&input.category!=='illegal'))throw new InputError('Vérifie la cible, le motif et la description (20 à 5 000 caractères).')
   for(const field of ['contactName','contactEmail'])if(typeof input[field]!=='string'||String(input[field]).length>(field==='contactName'?160:254)||/[\r\n\0]/.test(String(input[field])))throw new InputError('Coordonnées invalides.')
   if(input.contactEmail&&!isEmail(String(input.contactEmail)))throw new InputError('Adresse e-mail invalide.')
   if((!actor||input.category==='illegal')&&!input.sensitiveException&&(!input.contactEmail||String(input.contactName).trim().length<2))throw new InputError('Le nom et l’adresse e-mail sont nécessaires à ce signalement.')
   let target=input.target.trim()
   if(target.startsWith('https://')){
    const url=new URL(target)
    if(!['chibaskogames.fr','www.chibaskogames.fr'].includes(url.hostname)||url.port||url.username||url.password||url.search||url.hash)throw new InputError('URL de cible invalide.')
    const prefix=input.kind==='player'?'/players/':'/games/'
    if(!url.pathname.startsWith(prefix)||url.pathname.slice(prefix.length).includes('/'))throw new InputError('URL de cible invalide.')
    target=decodeURIComponent(url.pathname.slice(prefix.length))
   }
   if(!uuid.test(target)&&!(input.kind==='player'?/^@[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$/i:/^[a-z0-9][a-z0-9_-]{0,255}$/i).test(target))throw new InputError('Cible invalide.')
   input={...input,target}
   const secret=process.env.CONTACT_HASH_SECRET
   if(!secret||secret.length<32)throw new InputError('Le service est temporairement indisponible.',503)
   const ip=process.env.CHIBASKO_CLOUDFLARE==='1'?request.headers.get('cf-connecting-ip')??'':''
   const hash=(value:string)=>createHmac('sha256',secret).update(value).digest('hex')
   client=hash(actor?'account:'+actor:'guest:'+(isIP(ip)?ip:'shared-untrusted-ingress'))
   if(!actor){
    const botSecret=process.env.MODERATION_TURNSTILE_SECRET
    if(!botSecret)throw new InputError('Le formulaire invité doit être configuré. Contact : chibasko06@gmail.com.',503)
    if(typeof input.botToken!=='string'||!input.botToken||input.botToken.length>2048)throw new InputError('Vérification anti-robot requise.')
    const verification=await withTimeout(fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:botSecret,response:input.botToken as string,idempotency_key:input.operationId as string,...(isIP(ip)?{remoteip:ip}:{})}),signal:AbortSignal.timeout(8000)}),8000)
    const result=await verification.json()
    if(!verification.ok||result.success!==true||result.action!=='moderation'||result.hostname!==new URL(request.url).hostname)throw new InputError('Vérification anti-robot refusée.')
   }
   const {operationId,website,botToken,...content}=input
   void operationId;void website;void botToken
   fingerprint=hash(JSON.stringify(Object.fromEntries(Object.keys(content).sort().map(key=>[key,typeof content[key]==='string'?(key==='contactEmail'?String(content[key]).trim().toLowerCase():String(content[key]).trim().normalize('NFC')):content[key]]))))
   input={...content,operationId:input.operationId}
  }
  if(!admin){const retention=Number(process.env.MODERATION_CLOSED_RETENTION_DAYS);if(!Number.isInteger(retention)||retention<1||retention>3650)throw new InputError('La configuration de conservation des signalements doit être finalisée. Contact : chibasko06@gmail.com.',503)}
  const db=uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'')
  const result=admin?await db.call('distribution_moderation_admin',{p_actor:actor,p_input:input}):await db.call('distribution_moderation_submit',{p_actor:actor,p_input:input,p_client:client,p_fingerprint:fingerprint})
  if(!result)throw new InputError('Dossier introuvable.',404)
  return adminJson({data:result},{status:admin?200:201})
 }catch(error){
  if(error instanceof InputError)return adminJson({error:error.message},{status:error.status})
  if(error&&typeof error==='object'&&'status' in error&&[401,403].includes(Number(error.status)))return adminJson({error:'Accès non autorisé.'},{status:Number(error.status)})
  if(error instanceof UploadError&&[400,403,404,409,429].includes(error.status))return adminJson({error:error.status===429?'Trop de signalements rapprochés. Réessaie plus tard ou utilise le contact direct si la situation est urgente.':error.status===409?'Cette demande a changé. Actualise avant de réessayer.':'La cible ou la demande n’est pas valide.',code:error.code},{status:error.status,headers:error.status===429?{'Retry-After':'60'}:{}})
  logDataFailure('moderation_request',error,'database_unavailable')
  return adminJson({error:'L’enregistrement n’a pas pu être confirmé. Réessaie avec la même demande ; aucun second dossier ne sera créé pendant la fenêtre de reprise.'},{status:503})
 }
}
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
