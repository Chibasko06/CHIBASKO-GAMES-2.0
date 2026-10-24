import type {UploadRepository} from './uploads/contracts'
import type {DeveloperContact} from './developer-profile'
import {withTimeout} from '../asyncOperation'
export type NotificationEnvironment={GAME_SUBMISSION_NOTIFICATIONS_ENABLED?:string;RESEND_API_KEY?:string;RESEND_FROM_EMAIL?:string;GAME_SUBMISSION_NOTIFY_EMAIL?:string;NEXT_PUBLIC_SITE_URL?:string}
type Job={id:string;lease:string;message:Record<string,unknown>|null;contact:DeveloperContact;title:string;version:string;kind:string;uploadId:string;studio:string}
type Log={event:'submission_email_delivery';outcome:'sent'|'failed'|'attention_required'|'configuration_missing';phase:'configuration'|'claim'|'prepare'|'send'|'ack'}
export async function deliverSubmissionNotifications(db:UploadRepository,env:NotificationEnvironment,options:{submissionId?:string;limit?:number;fetcher?:typeof fetch;log?:(entry:Log)=>void;operationMs?:number;signal?:AbortSignal}={}){
 if(env.GAME_SUBMISSION_NOTIFICATIONS_ENABLED==='0')return 0
 const log=(entry:Omit<Log,'event'>)=>{try{(options.log??(e=>console.info(JSON.stringify(e))))({event:'submission_email_delivery',...entry})}catch{/* Une panne de journalisation ne change pas la livraison. */}}
 const apiKey=env.RESEND_API_KEY?.trim(),from=env.RESEND_FROM_EMAIL?.trim(),to=env.GAME_SUBMISSION_NOTIFY_EMAIL?.trim()
 if(!apiKey||!from||/[\r\n]/.test(from)||!to||!/^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(to)){log({phase:'configuration',outcome:'configuration_missing'});return 0}
 if(options.limit!==undefined&&(!Number.isSafeInteger(options.limit)||options.limit<1))throw Error('invalid_notification_limit')
 const limit=Math.min(5,options.limit??1),operationMs=options.operationMs??10_000;let sent=0
 if(!Number.isSafeInteger(operationMs)||operationMs<1||operationMs>10_000)throw Error('invalid_notification_timeout')
 for(let i=0;i<limit;i++){
  let job:Job|null=null,phase:Log['phase']='claim'
  try{
   options.signal?.throwIfAborted()
   job=await withTimeout(db.call<Job|null>('distribution_claim_submission_email',{p_submission:options.submissionId??null}),15_000);if(!job)break
   phase='prepare'
   let message=job.message
   if(!message){
    const url=new URL('/admin/game-builds/'+encodeURIComponent(job.uploadId),env.NEXT_PUBLIC_SITE_URL||'https://chibaskogames.fr')
    if(url.protocol!=='https:'||url.username||url.password)throw Error('invalid_site_configuration')
    message={from,to:[to],reply_to:job.contact.contactEmail,subject:'Nouvelle soumission de jeu sur Chibasko Games',text:
     ['Nouvelle soumission de jeu sur Chibasko Games','', 'Jeu : '+job.title,'Version : '+job.version,'Type : '+(job.kind==='update'?'Mise à jour':'Nouveau jeu'),'Développeur : '+job.contact.firstName+' '+job.contact.lastName,'Studio : '+job.studio,'E-mail : '+job.contact.contactEmail,'',url.href].join('\n')}
   }
   message=await withTimeout(db.call<Record<string,unknown>>('distribution_prepare_submission_email',{p_id:job.id,p_lease:job.lease,p_message:message}),15_000)
   phase='send';options.signal?.throwIfAborted()
   const result=await withTimeout((async()=>{
    const response=await (options.fetcher??fetch)('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':'submission-review/'+job!.id},body:JSON.stringify(message),signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(operationMs)]):AbortSignal.timeout(operationMs)})
    const receipt=await response.json().catch(()=>null)
    const permanent=[400,401,403,404,413,422].includes(response.status)||(response.status===409&&receipt?.name==='invalid_idempotent_request')
    return {ok:response.ok&&typeof receipt?.id==='string'&&!!receipt.id,permanent}
   })(),operationMs)
   options.signal?.throwIfAborted()
   if(result.permanent){phase='ack';await withTimeout(db.call('distribution_reject_submission_email',{p_id:job.id,p_lease:job.lease}),15_000);log({phase,outcome:'attention_required'});continue}
   if(!result.ok)throw Error('delivery_failed')
   phase='ack';await withTimeout(db.call('distribution_finish_submission_email',{p_id:job.id,p_lease:job.lease,p_success:true}),15_000);sent++;log({phase,outcome:'sent'})
  }catch{
   log({phase,outcome:'failed'})
   if(job&&!options.signal?.aborted)try{await withTimeout(db.call('distribution_finish_submission_email',{p_id:job.id,p_lease:job.lease,p_success:false}),15_000)}catch{/* Le lease expiré permet une reprise avec le même message. */}
   if(!job||options.submissionId||options.signal?.aborted)break
  }
 }
 return sent
}
