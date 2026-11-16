import 'server-only'
import {createHash} from 'node:crypto'
import {adminMailSenders,type MailSender,type MailStatus,type MailEntry} from '../adminMail'
import {uploadRepository} from '../game-distribution/uploads/repository'
import {UploadError} from '../game-distribution/uploads/policy'
import {withTimeout} from '../asyncOperation'
import {AdminAccessError,authorizeAdmin,createUserAuthClient} from './adminAuthorization'
import {adminOriginAllowed} from './adminRequest'
import {adminJson} from './adminResponses'
import {InputError,readJsonObject} from './inputValidation'

const defaults = {
  actor: async(token:string)=>(await withTimeout(authorizeAdmin(createUserAuthClient(token),token),10_000)).id,
  db: ()=>uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??''),
  apiKey: ()=>process.env.RESEND_API_KEY?.trim(),
  send: (...args:Parameters<typeof fetch>)=>fetch(...args),
}

function mailInput(input:Record<string,unknown>) {
  const {id,sender,recipient,subject,text}=input
  if(Object.keys(input).length!==5||typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))
    throw new InputError('Identifiant d’envoi invalide.')
  if(typeof sender!=='string'||!Object.hasOwn(adminMailSenders,sender))throw new InputError('Expéditeur invalide.')
  if(typeof recipient!=='string'||recipient.length>254||recipient.split('@')[0].length>64||
    !/^[a-z0-9_%+!-]+(?:\.[a-z0-9_%+!-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(recipient))
    throw new InputError('Saisis une seule adresse e-mail valide.')
  if(typeof subject!=='string'||!subject.trim()||subject.length>150||/[\p{Cc}\p{Zl}\p{Zp}]/u.test(subject))
    throw new InputError('L’objet est obligatoire et limité à 150 caractères sur une ligne.')
  if(typeof text!=='string'||!text.trim()||text.length>8000||/[^\P{Cc}\r\n\t]/u.test(text))
    throw new InputError('Le message est obligatoire et limité à 8 000 caractères.')
  return {id,sender:sender as MailSender,recipient,subject:subject.trim(),text:text.replace(/\r\n?/g,'\n')}
}

export async function adminMailRequest(request:Request,deps=defaults) {
  try {
    if(!adminOriginAllowed(request))throw new InputError('Origine refusée.',403)
    const token=request.headers.get('authorization')?.match(/^Bearer (\S{1,8192})$/)?.[1]
    if(!token)throw new AdminAccessError(401)
    const actor=await deps.actor(token)
    const db=deps.db()
    if(request.method==='GET'){
      const page=new URL(request.url).searchParams.get('page')??'0'
      if(!/^\d{1,5}$/.test(page)||Number(page)>10000)throw new InputError('Page invalide.')
      const rows=await db.call<MailEntry[]>('distribution_admin_mail_history',{p_actor:actor,p_page:Number(page)})
      return adminJson({rows:rows.slice(0,20),more:rows.length>20})
    }
    const {id,sender,recipient,subject,text}=mailInput(await readJsonObject(request,64_000,5000))
    const apiKey=deps.apiKey()
    if(!apiKey)throw new InputError('Le service d’envoi est indisponible.',503)
    const fingerprint=createHash('sha256').update(JSON.stringify([sender,recipient,subject,text])).digest('hex')
    const reservation=await db.call<{reserved:boolean;status:MailStatus}>('distribution_admin_mail_reserve',{
      p_actor:actor,p_id:id,p_sender:sender,p_recipient:recipient,p_subject:subject,p_fingerprint:fingerprint,
    })
    if(!reservation.reserved)return adminJson({status:reservation.status})

    const identity=adminMailSenders[sender]
    let status:MailStatus='unconfirmed',providerStatus:number|null=null,providerId:string|null=null
    try {
      await withTimeout((async()=>{
        const response=await deps.send('https://api.resend.com/emails',{
          method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':'admin-mail/'+id},
          body:JSON.stringify({from:identity.label+' <'+identity.address+'>',to:[recipient],reply_to:identity.address,subject,text}),
          signal:AbortSignal.timeout(8000),
        })
        providerStatus=response.status
        if(response.ok){
          const receipt=await response.json()
          if(typeof receipt?.id==='string'&&/^[a-z0-9-]{1,100}$/i.test(receipt.id)){
            status='accepted'
            providerId=receipt.id
          }
        }else if(response.status>=400&&response.status<500&&![408,409].includes(response.status)){
          status='rejected'
        }
      })(),8500)
    } catch {
      // A transport failure can happen after Resend accepted the message.
    }
    await db.call('distribution_admin_mail_finish',{p_actor:actor,p_id:id,p_status:status,p_provider_id:providerId,p_provider_status:providerStatus})
    return adminJson({status})
  }catch(error){
    if(error instanceof InputError||error instanceof AdminAccessError)return adminJson({error:error.message},{status:error.status})
    if(error instanceof UploadError&&error.status===429)return adminJson({error:'Limite d’envoi atteinte. Réessaie plus tard.'},{status:429})
    if(error instanceof UploadError&&error.status===409)return adminJson({error:'Cette confirmation ne correspond plus au message.'},{status:409})
    return adminJson({error:'Résultat indisponible. Vérifie l’historique avant tout nouvel envoi.'},{status:503})
  }
}
