import {randomUUID,createHash} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'

export class DiagnosticInputError extends Error {}

const email=/^[a-z0-9_%+!-]+(?:\.[a-z0-9_%+!-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
export function diagnosticOptions(args) {
  const values={},flags=new Set(['--send','--help'])
  for(let index=0;index<args.length;index++){
    const key=args[index]
    if(!['--type','--to','--sender','--mode',...flags].includes(key)||Object.hasOwn(values,key))throw new DiagnosticInputError('Option inconnue ou répétée.')
    if(flags.has(key)){values[key]=true;continue}
    const value=args[++index]
    if(!value||value.startsWith('--'))throw new DiagnosticInputError('Valeur d’option manquante.')
    values[key]=value
  }
  if(values['--help'])return {help:true}
  const to=values['--to']
  if(typeof to!=='string'||to.length>254||to.split('@')[0].length>64||!email.test(to))
    throw new DiagnosticInputError('Une seule adresse destinataire explicite est obligatoire (--to).')
  const type=values['--type']
  if(!['admin','submission'].includes(type))throw new DiagnosticInputError('Choisir --type admin ou submission.')
  if(type==='admin'&&(!['contact','developers'].includes(values['--sender'])||values['--mode']))
    throw new DiagnosticInputError('Pour admin, préciser --sender contact ou developers, sans --mode.')
  if(type==='submission'&&(values['--sender']||!['classic','sdk','external'].includes(values['--mode'])))
    throw new DiagnosticInputError('Pour submission, préciser --mode classic, sdk ou external, sans --sender.')
  return {type,to,sender:values['--sender'],mode:values['--mode'],send:values['--send']===true}
}

export function diagnosticMessage(options,builders,env) {
  const from=env.RESEND_FROM_EMAIL?.trim()
  if(options.type==='submission'&&from!=='noreply@chibaskogames.fr'&&from!=='Chibasko Games <noreply@chibaskogames.fr>')
    throw new DiagnosticInputError('Configurer RESEND_FROM_EMAIL comme sur le portail (noreply@chibaskogames.fr).')
  const site=env.NEXT_PUBLIC_SITE_URL?.trim()||'https://chibaskogames.fr'
  if(!['https://chibaskogames.fr','https://chibaskogames.fr/'].includes(site))
    throw new DiagnosticInputError('Le diagnostic utilise le site public https://chibaskogames.fr.')
  const sample={
    contact:{firstName:'Camille',lastName:'Martin',contactEmail:'createur@example.com',publicName:'Atelier Démo',website:null,otherContact:null},
    title:'Jeu de diagnostic',version:options.mode==='external'?null:'1.0.0',kind:'new',
    uploadId:options.mode==='external'?null:'11111111-1111-4111-8111-111111111111',
    externalRevisionId:options.mode==='external'?'22222222-2222-4222-8222-222222222222':null,
    studio:'Atelier Démo',
  }
  const submission=builders.submissionEmailMessage(sample,from||'noreply@chibaskogames.fr',options.to,site)
  return options.type==='admin'
    ?builders.adminEmailMessage(options.sender,options.to,submission.subject,submission.text)
    :submission
}

export async function runDiagnostic(options,builders,{
  env=process.env,outputRoot=resolve('.distribution/email-diagnostics'),
  fetcher=fetch,confirm=async()=>false,log=console.log,
}={}) {
  const message=diagnosticMessage(options,builders,env)
  const id=randomUUID(),directory=resolve(outputRoot,id)
  const key=(options.type==='admin'?'admin-mail/':'submission-review/')+'diagnostic-'+id
  const urls=[...message.html.matchAll(/(?:href|src)="([^"]+)"/g)].map(match=>match[1])
  urls.push(...[...message.text.matchAll(/https:\/\/[^\s<>"']+/g)].map(match=>match[0]))
  const summary={
    diagnosticId:id,type:options.type,mode:options.mode??null,from:message.from,to:message.to,
    replyTo:message.reply_to,subject:message.subject,
    htmlBytes:Buffer.byteLength(message.html),textBytes:Buffer.byteLength(message.text),
    htmlToTextBytesRatio:Number((Buffer.byteLength(message.html)/Buffer.byteLength(message.text)).toFixed(2)),
    urls:[...new Set(urls)],payloadSha256:createHash('sha256').update(JSON.stringify(message)).digest('hex'),
    endpoint:'https://api.resend.com/emails',method:'POST',
    headers:{'Content-Type':'application/json','Idempotency-Key':key},
    outcome:'preview',resendId:null,sentAt:null,
  }
  await mkdir(directory,{recursive:true})
  await writeFile(resolve(directory,'message.html'),message.html)
  await writeFile(resolve(directory,'message.txt'),message.text)
  await writeFile(resolve(directory,'message.json'),JSON.stringify(message,null,2)+'\n')
  const record=async()=>writeFile(resolve(directory,'result.json'),JSON.stringify(summary,null,2)+'\n')
  await record()
  log(JSON.stringify(summary,null,2))
  log('Aperçu local : '+directory)
  if(!options.send){log('Aperçu uniquement. Ajouter --send pour demander un envoi confirmé.');return summary}
  const apiKey=env.RESEND_API_KEY?.trim()
  if(!apiKey)throw new DiagnosticInputError('RESEND_API_KEY doit être fournie dans l’environnement du processus.')
  const phrase='ENVOYER '+options.to
  if(await confirm('Pour envoyer un seul e-mail, saisir exactement « '+phrase+' » : ')!==phrase){
    summary.outcome='cancelled';await record();log('Envoi annulé.');return summary
  }
  summary.sentAt=new Date().toISOString()
  let timer
  try{
    const timeoutMs=options.type==='admin'?8000:10000
    const response=await Promise.race([
      (async()=>{
        const result=await fetcher(summary.endpoint,{method:'POST',
          headers:{...summary.headers,Authorization:'Bearer '+apiKey},
          body:JSON.stringify(message),signal:AbortSignal.timeout(timeoutMs)})
        const data=await result.json().catch(()=>null)
        return {ok:result.ok,status:result.status,id:data?.id}
      })(),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),timeoutMs+500)}),
    ])
    summary.httpStatus=response.status
    if(response.ok&&typeof response.id==='string'&&/^[a-z0-9-]{1,100}$/i.test(response.id)){
      summary.resendId=response.id
      summary.outcome='accepted'
    }else summary.outcome=response.ok?'unconfirmed':'provider_error'
  }catch{
    summary.outcome='unconfirmed'
  }finally{
    clearTimeout(timer)
  }
  await record()
  log(JSON.stringify({outcome:summary.outcome,resendId:summary.resendId,sentAt:summary.sentAt,httpStatus:summary.httpStatus??null}))
  return summary
}
