'use client'
import Link from 'next/link'
import {PublicationError,publicationErrorLocation} from './PublicationError'
import {useEffect,useRef,useState} from 'react'
import {developerJson,uploadBuild,putPart,zipFileAllowed,submissionError,uploadFailureMessage,SubmissionError,type UploadDraft} from '@/lib/game-distribution/browser-upload'
import {ManagedGamePicker,type ManagedGame} from './SubmissionGameChoice'
import {FormFeedback,HelpText} from './ui/FormFeedback'
import GameIdentityNotice from './GameIdentityNotice'
function restore(key:string){try{const value=JSON.parse(sessionStorage.getItem(key)??'null') as UploadDraft|null;return value?.mode==='update'?value:null}catch{return null}}
export default function UpdateGamePublication({actor,token}:{actor:string;token:string}){
 const key='cg-build-upload:'+actor
 const [draft,setDraft]=useState<UploadDraft|null>(()=>typeof sessionStorage==='undefined'?null:restore(key))
 const [games,setGames]=useState<ManagedGame[]>([]),[offset,setOffset]=useState(0),[loading,setLoading]=useState(true),[max,setMax]=useState(0)
 const [game,setGame]=useState(draft?.gameId??''),[version,setVersion]=useState(draft?.version??''),[file,setFile]=useState<File|null>(null),[ownership,setOwnership]=useState(false)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false),[progress,setProgress]=useState(0),[received,setReceived]=useState<string|null>(null)
 const controller=useRef<AbortController|null>(null)
 const [errorCode,setErrorCode]=useState('')
 function clearError(){setError('');setErrorCode('')}
 const feedback=(location:string)=><PublicationError code={errorCode} message={error} version={version} id="update-error" location={location}/>
 useEffect(()=>()=>controller.current?.abort(),[])
 useEffect(()=>{const abort=new AbortController();developerJson('/api/developer/games?offset='+offset,token,{signal:abort.signal}).then(body=>{if(!abort.signal.aborted){setGames(body.data);setMax(body.maxArchiveBytes);setLoading(false)}}).catch(()=>{if(!abort.signal.aborted){setError('Impossible de charger les jeux gérés.');setLoading(false)}});return()=>abort.abort()},[token,offset])
 useEffect(()=>{const upload=new URLSearchParams(window.location.search).get('upload');if(!upload)return;const abort=new AbortController();developerJson('/api/developer/submissions?uploadId='+encodeURIComponent(upload),token,{signal:abort.signal}).then(({data})=>{if(!abort.signal.aborted&&data.kind==='update'){setGame(data.gameId);setVersion(data.version);setReceived(upload)}}).catch(()=>{if(!abort.signal.aborted)setError('Envoi introuvable ou accès refusé.')});return()=>abort.abort()},[token])
 function save(value:UploadDraft){setDraft({...value});try{sessionStorage.setItem(key,JSON.stringify(value))}catch{}}
 async function send(){clearError();if(!received&&(!file||!zipFileAllowed(file,max))){const code=file&&file.size>max?'file_too_large':'invalid_zip';setErrorCode(code);setError(submissionError(code));return}
   if(!game||!version||!ownership)return
   setBusy(true);const abort=new AbortController();controller.current=abort
   try{
     let uploadId=received
     if(!uploadId&&file){const value=draft??{requestId:crypto.randomUUID(),gameId:game,version,mode:'update' as const,name:file.name,size:file.size,lastModified:file.lastModified,hashes:{}};save(value);uploadId=await uploadBuild(file,value,abort.signal,{api:(path,init)=>developerJson(path,token,init),put:putPart,save,progress:setProgress})}
     await developerJson('/api/developer/submissions',token,{method:'POST',body:JSON.stringify({uploadId,kind:'update',metadata:{},ownership}),signal:abort.signal})
     setDone(true);try{sessionStorage.removeItem(key)}catch{}
   }catch(cause){const code=cause instanceof SubmissionError?cause.code:'';setErrorCode(code);setError(uploadFailureMessage(code))}finally{setBusy(false);controller.current=null}
 }
 useEffect(()=>{if(error)document.getElementById('update-error')?.focus()},[error])
 const button='rounded-lg border border-cyan-700 px-4 py-2 disabled:opacity-40'
 if(done)return <FormFeedback tone="success" title="Jeu reçu — vérification sous 24 à 48 h"><Link href="/developer/submissions">Mes soumissions</Link></FormFeedback>
 return <form className="space-y-5" onSubmit={event=>{event.preventDefault();void send()}}>
   <fieldset disabled={busy||!!draft?.uploadId||!!received} className="space-y-4"><legend className="text-xl">Version d’un jeu existant</legend><ManagedGamePicker games={games} value={game} loading={loading} onChange={value=>{setGame(value);if(draft&&!draft.uploadId){setDraft(null);try{sessionStorage.removeItem(key)}catch{}}clearError()}}/>
   <div className="flex gap-3"><button type="button" className={button} disabled={!offset} onClick={()=>setOffset(value=>Math.max(0,value-50))}>Jeux précédents</button><button type="button" className={button} disabled={games.length<50} onClick={()=>setOffset(value=>value+50)}>Jeux suivants</button></div></fieldset>
   <FormFeedback tone="info" title="Mise à jour du build uniquement"><p>La fiche catalogue reste inchangée.</p></FormFeedback>
   {game&&<GameIdentityNotice key={game} gameId={game} newGame={false}/>}
   <label className="block">Version du build (SemVer)<input className="mt-2 block w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3" value={version} maxLength={64} required disabled={busy||!!draft?.uploadId||!!received} aria-invalid={!!error&&publicationErrorLocation(errorCode)==='version'} aria-describedby={error&&publicationErrorLocation(errorCode)==='version'?'update-error':undefined} onChange={e=>{setVersion(e.target.value);if(draft&&!draft.uploadId){setDraft(null);try{sessionStorage.removeItem(key)}catch{}}clearError()}}/></label>
   {feedback('version')}
   {received?<FormFeedback tone="info" title="ZIP déjà reçu"><p>Terminez la soumission sans renvoyer le build.</p></FormFeedback>:<><label className="block">ZIP du build<input className="mt-2 block w-full" type="file" accept=".zip,application/zip" disabled={busy} aria-invalid={!!error&&publicationErrorLocation(errorCode)==='zip'} aria-describedby={error&&publicationErrorLocation(errorCode)==='zip'?'update-error':undefined} onChange={e=>{setFile(e.target.files?.[0]??null);clearError()}}/></label><HelpText>Maximum {max/1024**2} Mio. {draft&&'Resélectionnez le même fichier ZIP pour reprendre l’envoi.'}</HelpText></>}
   {feedback('zip')}
   <label className="block"><input type="checkbox" checked={ownership} disabled={busy} onChange={e=>setOwnership(e.target.checked)}/> Je dispose des droits nécessaires pour soumettre ce jeu.</label>
   <progress className="w-full" aria-label="Progression de l’envoi" value={progress} max={file?.size||1}/>
   {feedback('profile')}{feedback('upload')}
   <div className="flex flex-wrap gap-3"><button type="submit" className={button} disabled={busy||!max||!game||!ownership||(!file&&!received)}>{busy?'Envoi…':received?'Terminer la soumission':draft?'Reprendre et finaliser':'Envoyer le build'}</button>{busy&&<button type="button" className={button} onClick={()=>controller.current?.abort()}>Interrompre</button>}{draft&&!busy&&<button type="button" className={button} onClick={()=>{try{sessionStorage.removeItem(key)}catch{}setDraft(null);clearError()}}>Nouvel envoi</button>}</div>
 </form>
}
