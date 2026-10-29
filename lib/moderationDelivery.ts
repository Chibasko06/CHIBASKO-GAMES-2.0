import type {UploadRepository} from '@/lib/game-distribution/uploads/contracts'
import {withTimeout} from '@/lib/asyncOperation'

export type ModerationMailEnvironment={MODERATION_MAINTENANCE_ENABLED?:string;RESEND_API_KEY?:string;RESEND_FROM_EMAIL?:string;GAME_SUBMISSION_NOTIFY_EMAIL?:string;NEXT_PUBLIC_SITE_URL?:string;MODERATION_APPEAL_EMAIL?:string}
type Job={id:string;lease:string;kind:'admin'|'receipt'|'decision';message:Record<string,unknown>|null;case:{id:string;number:number;category:string;target_kind:string;target_locator:string;contact_email:string|null};decision:string|null}
export async function deliverModeration(db:UploadRepository,env:ModerationMailEnvironment,options:{fetcher?:typeof fetch;signal?:AbortSignal;log?:(event:{event:'moderation_mail';outcome:string;phase:string})=>void}={}){
 if(env.MODERATION_MAINTENANCE_ENABLED!=='1')return 0
 const log=(outcome:string,phase:string)=>{try{(options.log??console.info)({event:'moderation_mail',outcome,phase})}catch{}}
 const from=env.RESEND_FROM_EMAIL,to=env.GAME_SUBMISSION_NOTIFY_EMAIL,appeal=env.MODERATION_APPEAL_EMAIL
 if(!env.RESEND_API_KEY||![from,to,appeal].every(value=>typeof value==='string'&&/^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(value))){log('configuration_missing','configuration');throw Error('moderation_configuration_missing')}
 let sent=0
 for(let i=0;i<2;i++){
  let job:Job|null=null,phase='claim'
  try{
   options.signal?.throwIfAborted()
   job=await withTimeout(db.call<Job|null>('distribution_moderation_claim_mail',{}),8000)
   if(!job)break
   phase='prepare'
   let message=job.message
   if(!message){
    const adminUrl=new URL('/admin/moderation?id='+encodeURIComponent(job.case.id),env.NEXT_PUBLIC_SITE_URL??'https://chibaskogames.fr')
    if(adminUrl.protocol!=='https:'||adminUrl.username||adminUrl.password)throw Error('moderation_site_invalid')
    const destination=job.kind==='admin'?to:job.case.contact_email
    if(!destination||!/^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(destination))throw Error('moderation_recipient_missing')
    message={from,to:[destination],subject:job.kind==='admin'?'Nouveau signalement sur Chibasko Games':job.kind==='receipt'?'Chibasko Games — signalement reçu':'Chibasko Games — décision sur le signalement',text:job.kind==='admin'
     ?`Dossier #${job.case.number}\nType : ${job.case.target_kind}\nMotif : ${job.case.category}\nConsulter le dossier privé : ${adminUrl.href}`
     :job.kind==='receipt'?`Le signalement #${job.case.number} a été enregistré et sera examiné par Chibasko Games.\nAucune sanction n’est automatique.\nPour compléter le dossier ou contester une décision : ${appeal}, en précisant ce numéro.`
      :`Décision relative au signalement #${job.case.number}\n\n${job.decision??''}\n\nCette réponse concerne le suivi du dossier et n’atteste pas une sanction automatique.\nPour demander un réexamen : ${appeal}, en précisant ce numéro. Les voies judiciaires restent ouvertes ; les autres voies applicables dépendent de la qualification du service.`}
   }
   message=await withTimeout(db.call<Record<string,unknown>>('distribution_moderation_prepare_mail',{p_id:job.id,p_lease:job.lease,p_message:message}),8000)
   phase='send';options.signal?.throwIfAborted()
   const response=await withTimeout((options.fetcher??fetch)('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'moderation/'+job.id},body:JSON.stringify(message),signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000)}),8000)
   const receipt=await withTimeout(response.json().catch(()=>null),8000)
   const success=response.ok&&typeof receipt?.id==='string'&&receipt.id.length>0,permanent=[400,401,403,404,413,422].includes(response.status)||(response.status===409&&receipt?.name==='invalid_idempotent_request')
   phase='ack';options.signal?.throwIfAborted()
   await withTimeout(db.call('distribution_moderation_finish_mail',{p_id:job.id,p_lease:job.lease,p_success:success,p_permanent:permanent}),8000)
   log(success?'sent':permanent?'attention_required':'retry',phase)
   if(success)sent++
  }catch{
   log('failed',phase)
   if(job&&!options.signal?.aborted)try{await withTimeout(db.call('distribution_moderation_finish_mail',{p_id:job.id,p_lease:job.lease,p_success:false}),8000)}catch{}
   if(!job||options.signal?.aborted)break
  }
 }
 return sent
}
