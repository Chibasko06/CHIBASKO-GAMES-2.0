import {adminMailSenders,type MailSender} from './adminMail'
import {automaticEmailSender,brandedEmail} from './brandedEmail'
import type {DeveloperContact} from './game-distribution/developer-profile'

export function adminEmailMessage(sender:MailSender,recipient:string,subject:string,text:string) {
  const identity=adminMailSenders[sender]
  return {from:identity.label+' <'+identity.address+'>',to:[recipient],reply_to:identity.address,
    subject,...brandedEmail({identity:sender,subject,text})}
}

export type SubmissionEmailData = {
  contact:DeveloperContact
  title:string
  version:string|null
  kind:string
  uploadId:string|null
  externalRevisionId?:string|null
  studio:string
}

export function submissionEmailMessage(job:SubmissionEmailData,from:string,to:string,site?:string) {
  const path=job.externalRevisionId?'/admin/game-builds':'/admin/game-builds/'+encodeURIComponent(job.uploadId??'')
  const build=job.externalRevisionId?'Révision URL : '+job.externalRevisionId:'Version : '+job.version
  const url=new URL(path,site||'https://chibaskogames.fr')
  if(url.protocol!=='https:'||url.username||url.password)throw Error('invalid_site_configuration')
  const subject='Nouvelle soumission de jeu sur Chibasko Games'
  const text=['Nouvelle soumission de jeu sur Chibasko Games','', 'Jeu : '+job.title,build,
    'Type : '+(job.kind==='update'?'Mise à jour':'Nouveau jeu'),
    'Développeur : '+job.contact.firstName+' '+job.contact.lastName,'Studio : '+job.studio,
    'E-mail : '+job.contact.contactEmail,'',url.href].join('\n')
  return {from:automaticEmailSender(from),to:[to],reply_to:job.contact.contactEmail,subject,text,
    html:brandedEmail({identity:'noreply',subject,text,automatic:'reply',action:{url,label:'Ouvrir la revue'}}).html}
}
