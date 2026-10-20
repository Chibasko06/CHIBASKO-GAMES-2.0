'use client'
import {useEffect,useRef,useState} from 'react'
import {developerJson,SubmissionError,submissionError} from '@/lib/game-distribution/browser-upload'
import {publicationDraftLabel,type PublicationDraft} from '@/lib/game-distribution/submission-drafts'
import NewGameDraftEditor,{type PublicationCategory} from './NewGameDraftEditor'
import {FormFeedback,HelpText} from './ui/FormFeedback'
export default function NewGamePublication({token,categories,onEditingChange}:{token:string;categories:PublicationCategory[];onEditingChange?:(editing:boolean)=>void}){
 const [rows,setRows]=useState<PublicationDraft[]>([]),[active,setActive]=useState<PublicationDraft|null>(null),[generation,setGeneration]=useState(0)
 const [title,setTitle]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[max,setMax]=useState(0),[offset,setOffset]=useState(0),[reload,setReload]=useState(0)
 useEffect(()=>{onEditingChange?.(!!active);return()=>onEditingChange?.(false)},[active,onEditingChange])
 const registration=useRef<string|null>(null),restored=useRef(false)
 useEffect(()=>{
   const controller=new AbortController()
   developerJson('/api/developer/drafts?offset='+offset,token,{signal:controller.signal}).then(body=>{
     if(!controller.signal.aborted){setRows(body.data);setMax(body.maxArchiveBytes);setLoading(false)}
   }).catch(()=>{if(!controller.signal.aborted){setLoading(false);setError('Impossible de charger les publications en cours.')}})
   return()=>controller.abort()
 },[token,offset,reload])
 useEffect(()=>{
   const query=new URLSearchParams(window.location.search),id=query.get('draft'),upload=query.get('upload')
   if((!id&&!upload)||restored.current)return
   const controller=new AbortController()
   async function load(){
     let game=id
     if(!game&&upload){const context=await developerJson('/api/developer/submissions?uploadId='+encodeURIComponent(upload),token,{signal:controller.signal});if(context.data.kind!=='new')return;game=context.data.gameId}
     const body=await developerJson('/api/developer/drafts?gameId='+encodeURIComponent(game!),token,{signal:controller.signal})
     if(!controller.signal.aborted){restored.current=true;setActive(body.data);setMax(body.maxArchiveBytes);setGeneration(value=>value+1)}
   }
   load().catch(()=>{if(!controller.signal.aborted)setError('Brouillon introuvable ou accès refusé.')})
   return()=>controller.abort()
 },[token])
 async function resume(id:string){
   setError('');setBusy(true)
   try{const body=await developerJson('/api/developer/drafts?gameId='+encodeURIComponent(id),token)
     setActive(body.data);setMax(body.maxArchiveBytes);setGeneration(value=>value+1)
     const url=new URL(window.location.href);url.searchParams.delete('upload');url.searchParams.set('draft',id);window.history.replaceState(null,'',url);return true
   }catch{setError('Brouillon introuvable ou accès refusé.');return false}finally{setBusy(false)}
 }
 async function create(){
   setError('');setBusy(true)
   try{registration.current??=crypto.randomUUID()
     const body=await developerJson('/api/developer/games',token,{method:'POST',headers:{'Idempotency-Key':registration.current},body:JSON.stringify({title})})
     if(await resume(body.data.gameId)){registration.current=null;setReload(value=>value+1)}
   }catch(cause){setError(submissionError(cause instanceof SubmissionError?cause.code:''))}finally{setBusy(false)}
 }
 function back(){setActive(null);setReload(value=>value+1);const url=new URL(window.location.href);url.searchParams.delete('draft');url.searchParams.delete('upload');window.history.replaceState(null,'',url)}
 useEffect(()=>{if(error)document.getElementById('publication-error')?.focus()},[error])
 const button='rounded-lg border border-cyan-700 px-4 py-2 disabled:opacity-40'
 return <div className="space-y-5">
   {error&&<FormFeedback id="publication-error" tone="error" title="Impossible de terminer cette action"><p>{error}</p></FormFeedback>}
   {active?<NewGameDraftEditor key={active.gameId+':'+generation} initial={active} token={token} categories={categories} max={max} onBack={back}/>:<>
     <section className="space-y-4 rounded-xl border border-zinc-700 p-4"><h2 className="text-xl font-semibold">Publications en cours</h2>
       <HelpText>Vos brouillons privés sont enregistrés sur votre compte. Reprendre conserve leur gameId.</HelpText>
       {loading?<p role="status">Chargement des brouillons…</p>:!rows.length?<HelpText>Aucune publication en cours sur cette page.</HelpText>:<ul className="space-y-3">{rows.map(row=><li key={row.gameId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 p-3"><div><h3 className="font-medium">{row.title}</h3><HelpText>{publicationDraftLabel(row)}{row.version?' · '+row.version:''}</HelpText></div><button type="button" className={button} disabled={busy} onClick={()=>resume(row.gameId)}>{row.submitted?'Consulter':'Reprendre'}</button></li>)}</ul>}
       <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={!offset||busy} onClick={()=>setOffset(value=>Math.max(0,value-50))}>Brouillons précédents</button><button type="button" className={button} disabled={rows.length<50||busy} onClick={()=>setOffset(value=>value+50)}>Brouillons suivants</button><button type="button" className={button} onClick={()=>setReload(value=>value+1)}>Actualiser</button></div>
     </section>
     <section className="space-y-4"><h2 className="text-xl font-semibold">Commencer une nouvelle publication</h2>
       <label className="block text-sm font-medium">Titre<input className="mt-2 block w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-base" value={title} maxLength={160} onChange={e=>setTitle(e.target.value)} disabled={busy}/></label>
       <HelpText>Si le jeu figure déjà dans vos publications en cours, utilisez Reprendre. La création réserve une nouvelle identité privée et ne publie rien.</HelpText>
       <button type="button" className={button} disabled={busy||!title.trim()} onClick={create}>{busy?'Préparation…':'Créer le jeu privé et obtenir son gameId'}</button>
     </section>
   </>}
 </div>
}
