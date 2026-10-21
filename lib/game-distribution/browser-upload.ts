export type UploadDraft={requestId:string;gameId:string;version:string;name:string;size:number;lastModified:number;uploadId?:string;mode?:'new'|'update';hashes:Record<string,string>}
export class SubmissionError extends Error {constructor(readonly code:string){super(code)}}
export const uploadFailureMessage=(code:string)=>({invalid_archive_size:'Le ZIP doit être non vide et ne pas dépasser la taille maximale autorisée.',service_unavailable:'Une erreur est survenue lors de la préparation du transfert. Réessayez.',storage_error:'Le transfert n’a pas pu être initialisé. Réessayez sans recréer le jeu.'}[code]??submissionError(code))
export function zipFileAllowed(file:Pick<File,'name'|'size'>,max:number){return /\.zip$/i.test(file.name)&&file.size>0&&file.size<=max}
export const submissionError=(code:string)=>({developer_profile_required:'Complétez votre fiche développeur avant d’envoyer la soumission.',invalid_zip:'Choisir un fichier .zip non vide.',file_too_large:'Le ZIP dépasse la taille maximale autorisée.',version_conflict:'Cette version est déjà utilisée. Choisir une nouvelle version.',invalid_version:'La version doit respecter SemVer, par exemple 1.0.0.',forbidden:'Permissions insuffisantes pour ce jeu.',unauthorized:'Reconnectez-vous pour continuer.',upload_not_found:'Upload introuvable ou accès refusé.',upload_expired:'Upload expiré. Commencer un nouvel envoi.',upload_interrupted:'Envoi interrompu. Sélectionner le même ZIP et reprendre.',finalization_failed:'La finalisation a échoué. Réessayer sans renvoyer les parties déjà reçues.',file_changed:'Le ZIP sélectionné ne correspond pas à cet envoi.',database_error:'Le service de dépôt rencontre un problème technique. Réessayez plus tard.',storage_error:'Le stockage du build est temporairement indisponible. Réessayez sans recréer le jeu.',service_unavailable:'Le dépôt est temporairement indisponible.',quota_exceeded:'Limite de dépôt atteinte. Réessayer plus tard.'}[code]??'Opération impossible. Vérifier les champs puis réessayer.')
export async function developerJson(path:string,token:string,init:RequestInit={}) {
  let response:Response
  try{response=await fetch(path,{...init,cache:'no-store',credentials:'omit',headers:{Authorization:'Bearer '+token,...(init.body instanceof FormData?{}:{'Content-Type':'application/json'}),...init.headers}})}catch{throw new SubmissionError('upload_interrupted')}
  const body=await response.json().catch(()=>null)
  if(!response.ok)throw new SubmissionError(body?.error?.code??'service_unavailable')
  return body
}
export function putPart(url:string,headers:Record<string,string>,body:Blob,progress:(bytes:number)=>void,signal:AbortSignal):Promise<void> {
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest(),abort=()=>xhr.abort()
    xhr.open('PUT',url);xhr.timeout=300000;xhr.withCredentials=false
    for(const [key,value] of Object.entries(headers))if(key.toLowerCase()!=='content-length')xhr.setRequestHeader(key,value)
    const finish=(ok:boolean)=>{signal.removeEventListener('abort',abort);if(ok)resolve();else reject(new SubmissionError('upload_interrupted'))}
    xhr.upload.onprogress=e=>progress(e.loaded);xhr.onload=()=>finish(xhr.status>=200&&xhr.status<300)
    xhr.onerror=xhr.ontimeout=xhr.onabort=()=>finish(false)
    if(signal.aborted){finish(false);return}signal.addEventListener('abort',abort,{once:true});xhr.send(body)
  })
}
type Dependencies={api:(path:string,init?:RequestInit)=>Promise<{data:unknown}>;put:typeof putPart;save:(draft:UploadDraft)=>void|Promise<void>;progress:(bytes:number)=>void}
export async function uploadBuild(file:File,draft:UploadDraft,signal:AbortSignal,deps:Dependencies) {
  if(file.name!==draft.name||file.size!==draft.size)throw new SubmissionError('file_changed')
  // Copying the same ZIP between devices can change mtime. Chunk hashes still govern reuse.
  const json=(method:string,body?:unknown)=>({method,signal,...(body?{body:JSON.stringify(body)}:{})})
  type State={id:string;status:string;upload:{partSize:number}}
  const state=(await deps.api(draft.uploadId?'/api/developer/uploads/'+draft.uploadId:'/api/developer/games/'+draft.gameId+'/uploads',
    draft.uploadId?{signal}:{...json('POST',{version:draft.version,archiveSize:file.size}),headers:{'Idempotency-Key':draft.requestId}})).data as State
  draft.uploadId=state.id;await deps.save(draft)
  if(['queued','validating','completed'].includes(state.status)){deps.progress(file.size);return state.id}
  if(state.status==='expired')throw new SubmissionError('upload_expired')
  if(!['uploading','finalizing'].includes(state.status))throw new SubmissionError('invalid_state')
  if(state.status==='uploading'){
    const parts=(await deps.api('/api/developer/uploads/'+state.id+'/parts',{signal})).data as {parts:{number:number;size:number}[]}
    let sent=0
    for(let number=1,start=0;start<file.size;number++,start+=state.upload.partSize){
      signal.throwIfAborted()
      const chunk=file.slice(start,Math.min(file.size,start+state.upload.partSize))
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await chunk.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('')
      // Remote presence alone cannot prove that a reselected local ZIP has the same bytes.
      if(!parts.parts.some(p=>p.number===number&&p.size===chunk.size&&draft.hashes[String(number)]===digest)){
        const signed=(await deps.api('/api/developer/uploads/'+state.id+'/parts',json('POST',{partNumbers:[number]}))).data as {parts:{url:string;headers:Record<string,string>}[]}
        await deps.put(signed.parts[0].url,signed.parts[0].headers,chunk,n=>deps.progress(sent+n),signal)
        draft.hashes[String(number)]=digest;await deps.save(draft)
      }
      sent+=chunk.size;deps.progress(sent)
    }
  }
  try{await deps.api('/api/developer/uploads/'+state.id+'/finalize',json('POST'))}catch{throw new SubmissionError('finalization_failed')}
  return state.id
}
