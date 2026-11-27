import {adminMailSenders,type MailSender} from './adminMail'
import {automaticEmailSender,brandedEmail} from './brandedEmail'
import {developersEmail} from './siteContacts'
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
  notification?:{event:'received'|'correction'|'accepted'|'rejected'|'published';gameId:string;recipient:string;reason:string|null}|null
}

export function submissionEmailMessage(job:SubmissionEmailData,from:string,to:string,site?:string) {
  if(job.notification){
    const n=job.notification
    const titles={received:'Soumission reçue',correction:'Correction demandée',accepted:'Version acceptée',rejected:'Soumission refusée',published:'Jeu publié'}
    if(!Object.hasOwn(titles,n.event)||typeof n.gameId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(n.gameId)||typeof n.recipient!=='string'||!/^[^\s@<>]+@[^\s@<>]+[.][^\s@<>]+$/.test(n.recipient))throw Error('invalid_notification')
    const url=new URL('/developer/games/'+encodeURIComponent(n.gameId),site||'https://chibaskogames.fr')
    if(url.origin!=='https://chibaskogames.fr'||url.username||url.password)throw Error('invalid_site_configuration')
    const subject='Chibasko Games — '+(n.event==='received'&&job.kind==='update'?'Nouvelle version reçue':titles[n.event])
    const text=[titles[n.event],'Jeu : '+job.title,job.externalRevisionId?'Révision URL : '+job.externalRevisionId:'Version : '+job.version,
      job.kind==='update'?'Mise à jour de votre jeu.':'',n.reason??'',
      n.event==='received'?'Votre dépôt a été enregistré. La revue reste manuelle.':n.event==='accepted'?'La version est acceptée. Sa visibilité publique reste une étape distincte.':n.event==='correction'?'Ouvrez le dossier pour préparer une correction. Les versions précédentes sont conservées.':'',url.href].filter(Boolean).join('\n\n')
    return {from:automaticEmailSender(from),to:[n.recipient],reply_to:developersEmail,subject,
      ...brandedEmail({identity:'developers',subject,text,automatic:'reply',action:{url,label:'Ouvrir mon projet'}})}
  }
  const path=job.externalRevisionId?'/admin/game-builds':'/admin/game-builds/'+encodeURIComponent(job.uploadId??'')
  const build=job.externalRevisionId?'Révision URL : '+job.externalRevisionId:'Version : '+job.version
  const url=new URL(path,site||'https://chibaskogames.fr')
  if(url.protocol!=='https:'||url.username||url.password)throw Error('invalid_site_configuration')
  const subject='Nouvelle soumission de jeu sur Chibasko Games'
  const text=['Nouvelle soumission de jeu sur Chibasko Games','', 'Jeu : '+job.title,build,
    'Type : '+(job.kind==='update'?'Mise à jour':'Nouveau jeu'),
    'Développeur : '+job.contact.firstName+' '+job.contact.lastName,'Studio : '+job.studio,
    'E-mail : '+job.contact.contactEmail,'',url.href].join('\n')
  return {from:automaticEmailSender(from),to:[to],subject,text,
    html:brandedEmail({identity:'noreply',subject,text,automatic:'no-reply',action:{url,label:'Ouvrir la revue'}}).html}
}
