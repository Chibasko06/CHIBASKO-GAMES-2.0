import type {UploadRepository} from './uploads/contracts'
import type {DeveloperContact} from './developer-profile'
export type NotificationEnvironment={RESEND_API_KEY?:string;RESEND_FROM_EMAIL?:string;GAME_SUBMISSION_NOTIFY_EMAIL?:string;NEXT_PUBLIC_SITE_URL?:string}
type Job={id:string;lease:string;message:Record<string,unknown>|null;contact:DeveloperContact;title:string;version:string;kind:string;uploadId:string;studio:string}
type Log={event:'submission_email_delivery';outcome:'sent'|'failed'|'configuration_missing';phase:'configuration'|'claim'|'prepare'|'send'|'ack'}
export async function deliverSubmissionNotifications(db:UploadRepository,env:NotificationEnvironment,options:{submissionId?:string;limit?:number;fetcher?:typeof fetch;log?:(entry:Log)=>void}={}){
 const log=(entry:Omit<Log,'event'>)=>{try{(options.log??(e=>console.info(JSON.stringify(e))))({event:'submission_email_delivery',...entry})}catch{/* Logging never changes delivery. */}}
 const apiKey=env.RESEND_API_KEY?.trim(),from=env.RESEND_FROM_EMAIL?.trim(),to=env.GAME_SUBMISSION_NOTIFY_EMAIL?.trim()
 if(!apiKey||!from||/[\r\n]/.test(from)||!to||!/^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(to)){log({phase:'configuration',outcome:'configuration_missing'});return 0}
 const limit=Math.min(5,Math.max(1,options.limit??1));let sent=0
 for(let i=0;i<limit;i++){
  let job:Job|null=null,phase:Log['phase']='claim'
  try{
   job=await db.call<Job|null>('distribution_claim_submission_email',{p_submission:options.submissionId??null});if(!job)break
   phase='prepare'
   let message=job.message
   if(!message){
    const url=new URL('/admin/game-builds/'+encodeURIComponent(job.uploadId),env.NEXT_PUBLIC_SITE_URL||'https://chibaskogames.fr')
    if(url.protocol!=='https:'||url.username||url.password)throw Error('invalid_site_configuration')
    message={from,to:[to],reply_to:job.contact.contactEmail,subject:'Nouvelle soumission de jeu sur Chibasko Games',text:
     ['Nouvelle soumission de jeu sur Chibasko Games','', 'Jeu : '+job.title,'Version : '+job.version,'Type : '+(job.kind==='update'?'Mise à jour':'Nouveau jeu'),'Développeur : '+job.contact.firstName+' '+job.contact.lastName,'Studio : '+job.studio,'E-mail : '+job.contact.contactEmail,'',url.href].join('\n')}
   }
   message=await db.call<Record<string,unknown>>('distribution_prepare_submission_email',{p_id:job.id,p_lease:job.lease,p_message:message})
   phase='send'
   const response=await (options.fetcher??fetch)('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':'submission-review/'+job.id},body:JSON.stringify(message),signal:AbortSignal.timeout(10000)})
   if(!response.ok)throw Error('delivery_failed')
   const receipt=await response.json();if(!receipt||typeof receipt.id!=='string'||!receipt.id)throw Error('invalid_receipt')
   phase='ack';await db.call('distribution_finish_submission_email',{p_id:job.id,p_lease:job.lease,p_success:true});sent++;log({phase,outcome:'sent'})
  }catch{
   log({phase,outcome:'failed'})
   if(job)try{await db.call('distribution_finish_submission_email',{p_id:job.id,p_lease:job.lease,p_success:false})}catch{/* The lease expires and the persisted message is reused. */}
   break
  }
 }
 return sent
}
