'use client'
import Link from 'next/link'
import {PublicationError,publicationErrorLocation} from './PublicationError'
import {useEffect,useRef,useState,useSyncExternalStore} from 'react'
import GameIdentityNotice from './GameIdentityNotice'
import {FormFeedback,HelpText} from './ui/FormFeedback'
import {DraftAutosave} from '@/lib/game-distribution/draft-autosave'
import type {DraftMetadata,PublicationDraft} from '@/lib/game-distribution/submission-drafts'
import {developerJson,uploadBuild,putPart,zipFileAllowed,SubmissionError,submissionError,uploadFailureMessage,type UploadDraft} from '@/lib/game-distribution/browser-upload'
export type PublicationCategory={id:string;name:string;slug:string}
export default function NewGameDraftEditor({initial,token,categories,max,onBack}:{initial:PublicationDraft;token:string;categories:PublicationCategory[];max:number;onBack:()=>void}){
 const [live,setLive]=useState(initial),[metadata,setMetadata]=useState<DraftMetadata>(initial.metadata),[version,setVersion]=useState(initial.version)
 const [file,setFile]=useState<File|null>(null),[cover,setCover]=useState<File|null>(null),[ownership,setOwnership]=useState(false)
 const [busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState(0)
 const tokenRef=useRef(token),controller=useRef<AbortController|null>(null)
 const [errorCode,setErrorCode]=useState('')
 function clearError(){setError('');setErrorCode('')}
 const feedback=(location:string)=><PublicationError code={errorCode} message={error} version={version} id="draft-error" location={location}/>
 useEffect(()=>{tokenRef.current=token},[token])
 const [autosave]=useState(()=>new DraftAutosave(initial,async(payload,revision)=>{
   const result=await developerJson('/api/developer/drafts',token,{method:'POST',keepalive:true,body:JSON.stringify({action:'save',gameId:initial.gameId,revision,...payload})})
   return result.data
 }))
 useEffect(()=>{autosave.setWriter(async(payload,revision)=>{const result=await developerJson('/api/developer/drafts',token,{method:'POST',keepalive:true,body:JSON.stringify({action:'save',gameId:initial.gameId,revision,...payload})});return result.data})},[autosave,token,initial.gameId])
 const [now,setNow]=useState(()=>Date.now())
 useEffect(()=>{if(!live.upload)return;const timer=setTimeout(()=>setNow(Date.now()),Math.max(0,Date.parse(live.upload.expiresAt)-Date.now()+1));return()=>clearTimeout(timer)},[live.upload])
 const saveState=useSyncExternalStore(autosave.subscribe,autosave.snapshot,autosave.snapshot)
 useEffect(()=>{if(!initial.submitted)autosave.update({metadata,version})},[autosave,metadata,version,initial.submitted])
 useEffect(()=>{
   autosave.activate()
   const flush=()=>{if(document.visibilityState==='hidden')void autosave.flush().catch(()=>{})}
   const leave=(event:BeforeUnloadEvent)=>{if(autosave.dirty){event.preventDefault();event.returnValue=''}}
   document.addEventListener('visibilitychange',flush);window.addEventListener('beforeunload',leave)
   return()=>{document.removeEventListener('visibilitychange',flush);window.removeEventListener('beforeunload',leave);controller.current?.abort();autosave.dispose()}
 },[autosave])
 const field=(key:keyof DraftMetadata,value:DraftMetadata[keyof DraftMetadata])=>setMetadata(previous=>({...previous,[key]:value}))
 const unavailable=live.upload&&(['failed','expired'].includes(live.upload.status)||['created','uploading','finalizing'].includes(live.upload.status)&&Date.parse(live.upload.expiresAt)<=now)
 const received=live.upload&&['queued','validating','completed'].includes(live.upload.status)
 async function back(){try{await autosave.flush();onBack()}catch{setError('Le brouillon n’a pas été sauvegardé. Réessayez avant de quitter cette vue.')}}
 async function persistUpload(value:UploadDraft){
   const result=await developerJson('/api/developer/drafts',tokenRef.current,{method:'POST',body:JSON.stringify({action:'upload-state',gameId:initial.gameId,requestId:value.requestId,file:{name:value.name,size:value.size,lastModified:value.lastModified},hashes:value.hashes})})
   setLive(result.data)
 }
 async function restart(){setError('');setBusy(true);try{
   await autosave.flush()
   const result=await developerJson('/api/developer/drafts',tokenRef.current,{method:'POST',body:JSON.stringify({action:'restart-upload',gameId:initial.gameId})})
   setLive(result.data);setFile(null);setProgress(0)
 }catch{setError('Impossible de préparer une nouvelle session d’envoi.')}finally{setBusy(false)}}
 async function submit(){
   clearError()
   if(!received&&(!file||!zipFileAllowed(file,max))){const code=file&&file.size>max?'file_too_large':'invalid_zip';setErrorCode(code);setError(submissionError(code));return}
   if(!version||!ownership||!metadata.title.trim()||!metadata.studio.trim()||!metadata.releaseDate||!metadata.description.trim()||!metadata.categories.length||metadata.mobile===null||!metadata.technology.trim()||!cover){setError('Complétez les informations, la couverture et la confirmation des droits.');return}
   if(cover.size>8*1024**2){setError('La couverture dépasse 8 Mio.');return}
   setBusy(true);const abort=new AbortController();controller.current=abort
   try{
     await autosave.flush()
     let uploadId=received?live.upload!.id:null
     if(!uploadId&&file){
       const draft:UploadDraft={requestId:live.requestId,gameId:initial.gameId,version,mode:'new',name:live.file?.name??file.name,size:live.file?.size??file.size,lastModified:file.lastModified,hashes:{...live.hashes},...(!live.upload||live.upload.status==='created'?{}:{uploadId:live.upload.id})}
       await persistUpload(draft)
       uploadId=await uploadBuild(file,draft,abort.signal,{api:(path,init)=>developerJson(path,tokenRef.current,init),put:putPart,save:persistUpload,progress:setProgress})
     }
     const body=new FormData();body.set('metadata',JSON.stringify({uploadId,kind:'new',metadata,ownership}));body.set('cover',cover)
     await developerJson('/api/developer/submissions',tokenRef.current,{method:'POST',body,signal:abort.signal})
     setDone(true)
   }catch(cause){const code=cause instanceof SubmissionError?cause.code:'';setErrorCode(code);setError(code==='draft_conflict'?'Le brouillon a été modifié dans une autre session. Revenez à la liste puis reprenez-le.':code==='invalid_cover'?'Couverture invalide. Choisissez une image valide.':uploadFailureMessage(code))}
   finally{setBusy(false);controller.current=null}
 }
 const input='mt-2 block w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-base focus:border-cyan-500'
 useEffect(()=>{if(error)document.getElementById('draft-error')?.focus()},[error])
 const button='rounded-lg border border-cyan-700 px-4 py-2 disabled:opacity-40'
 if(done)return <FormFeedback tone="success" title="Jeu reçu — vérification sous 24 à 48 h"><p>Le brouillon a été transmis à la revue manuelle. La publication reste une décision admin.</p><Link href="/developer/submissions">Mes soumissions</Link></FormFeedback>
 return <div className="space-y-5">
   <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" className={button} disabled={busy} onClick={back}>Retour aux publications en cours</button>
   {!initial.submitted&&<p role="status" className="text-sm text-zinc-400">{saveState.status==='saved'?'Brouillon enregistré':saveState.status==='saving'?'Enregistrement…':saveState.status==='pending'?'Modifications à enregistrer…':'Échec de l’enregistrement'}</p>}</div>
   {saveState.status==='error'&&<FormFeedback tone="error" title="Brouillon non enregistré"><p>{saveState.code==='draft_conflict'?'Une autre session a modifié le brouillon. Rechargez-le depuis la liste pour éviter un écrasement.':'Vérifiez votre connexion et réessayez. Les modifications affichées ne sont pas encore sauvegardées.'}</p><button type="button" className={button} onClick={()=>{void autosave.flush().catch(()=>{})}}>Réessayer la sauvegarde</button><button type="button" className={button} onClick={onBack}>Recharger depuis la liste</button></FormFeedback>}
   <GameIdentityNotice gameId={initial.gameId} newGame/>
   {initial.submitted&&<FormFeedback tone="info" title="Soumission déjà reçue"><p>Les métadonnées transmises sont en lecture seule pendant la revue.</p><Link href={'/developer/builds/'+live.upload?.id}>Suivre cette soumission</Link></FormFeedback>}
   <form onSubmit={event=>{event.preventDefault();void submit()}} onBlur={()=>{if(!initial.submitted)void autosave.flush().catch(()=>{})}} className="space-y-5">
   <fieldset disabled={busy||initial.submitted} className="space-y-4 [&>label]:block [&>label]:text-sm [&>label]:font-medium"><legend className="text-xl">Informations du nouveau jeu</legend>
     <label>Titre<input className={input} value={metadata.title} maxLength={160} required onChange={e=>field('title',e.target.value)}/></label>
     <label>Développeur / studio<input className={input} value={metadata.studio} maxLength={160} required onChange={e=>field('studio',e.target.value)}/></label>
     <label>Date de sortie<input className={input} type="date" value={metadata.releaseDate} required onChange={e=>field('releaseDate',e.target.value)}/></label>
     <label>Description<textarea className={input} value={metadata.description} maxLength={10000} rows={5} required onChange={e=>field('description',e.target.value)}/></label>
     <fieldset><legend>Catégories (1 à 8)</legend>{categories.map(category=><label className="mr-4 inline-block" key={category.id}><input type="checkbox" checked={metadata.categories.includes(category.id)} disabled={!metadata.categories.includes(category.id)&&metadata.categories.length>=8} onChange={e=>field('categories',e.target.checked?[...metadata.categories,category.id]:metadata.categories.filter(id=>id!==category.id))}/> {category.name}</label>)}</fieldset>
     <div><label htmlFor="draft-mobile">Compatible mobile</label><select id="draft-mobile" className={input} value={metadata.mobile===null?'':metadata.mobile?'yes':'no'} required onChange={e=>field('mobile',e.target.value===''?null:e.target.value==='yes')}><option value="">Choisir</option><option value="yes">Oui</option><option value="no">Non</option></select></div>
     <label>Technologie<input className={input} value={metadata.technology} maxLength={120} required onChange={e=>field('technology',e.target.value)}/></label>
     {initial.coverUrl?<p>Couverture enregistrée : <a href={initial.coverUrl} target="_blank" rel="noopener noreferrer">Voir l’image</a></p>:<><label>Miniature / image de couverture<input className={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/svg+xml" required onChange={e=>setCover(e.target.files?.[0]??null)}/></label><HelpText>La couverture n’est envoyée qu’à la soumission finale. Resélectionnez-la après votre retour. Aucun chemin local n’est conservé. 8 Mio maximum.</HelpText></>}
     <label>Version du build (SemVer)<input className={input} value={version} maxLength={64} required disabled={!!live.upload} aria-invalid={!!error&&publicationErrorLocation(errorCode)==='version'} aria-describedby={error&&publicationErrorLocation(errorCode)==='version'?'draft-error':undefined} onChange={e=>{setVersion(e.target.value);clearError()}}/></label>
     {feedback('version')}
   </fieldset>
   {!initial.submitted&&<>
     <HelpText>Le brouillon enregistré n’est ni soumis à l’administration ni publié. Les statistiques de communauté sont calculées automatiquement.</HelpText>
     {unavailable?<FormFeedback tone="warning" title="Session d’envoi expirée ou échouée"><p>Les métadonnées et le gameId sont conservés.</p><button type="button" className={button} onClick={restart} disabled={busy}>Préparer un nouvel envoi pour ce jeu</button></FormFeedback>:received?<FormFeedback tone="info" title="ZIP déjà reçu"><p>Complétez les métadonnées et la couverture pour terminer la soumission.</p></FormFeedback>:<label className="block">ZIP du build<input className={input} type="file" accept=".zip,application/zip" disabled={busy} aria-invalid={!!error&&publicationErrorLocation(errorCode)==='zip'} aria-describedby={error&&publicationErrorLocation(errorCode)==='zip'?'draft-error':undefined} onChange={e=>{setFile(e.target.files?.[0]??null);clearError()}}/><HelpText>Maximum {max/1024**2} Mio. {live.file||live.upload?'Resélectionnez le même fichier ZIP pour reprendre l’envoi.':'Le fichier ZIP reste sur cet appareil tant que l’envoi n’est pas terminé.'}</HelpText></label>}
     {feedback('zip')}
     {live.upload&&<HelpText>État de l’envoi : {live.upload.status}. Version : {live.upload.version}.</HelpText>}
     <label className="block"><input type="checkbox" checked={ownership} disabled={busy} onChange={e=>setOwnership(e.target.checked)}/> Je dispose des droits nécessaires pour soumettre ce jeu.</label>
     <progress className="w-full" aria-label="Progression de l’envoi" value={progress} max={file?.size||1}/>
     {feedback('profile')}{feedback('upload')}
     <div className="flex flex-wrap gap-3"><button className={button} type="submit" disabled={busy||!!unavailable||!ownership||(!file&&!received)||!max}>{busy?'Envoi…':received?'Terminer la soumission':live.upload||live.file?'Reprendre et finaliser':'Envoyer le build'}</button>{busy&&<button type="button" className={button} onClick={()=>controller.current?.abort()}>Interrompre</button>}</div>
   </>}
   </form>
 </div>
}
