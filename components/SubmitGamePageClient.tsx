'use client'
import Link from 'next/link'
import {useEffect,useId,useRef,useState} from 'react'
import {useAuth} from '@/components/AuthProvider'
import {SubmissionTabs,ManagedGamePicker,type SubmissionMode,type ManagedGame} from './SubmissionGameChoice'
import {developerJson,putPart,uploadBuild,zipFileAllowed,submissionError,SubmissionError,type UploadDraft} from '@/lib/game-distribution/browser-upload'
import {REVIEW_NOTICE} from '@/lib/game-distribution/review'
import {FormFeedback,HelpText} from './ui/FormFeedback'
import GameIdentityNotice from './GameIdentityNotice'

type Category={id:string;name:string;slug:string}
function restore<T>(key:string):T|null{try{return typeof sessionStorage==='undefined'?null:JSON.parse(sessionStorage.getItem(key)??'null')}catch{return null}}
function remember(key:string,value:unknown){try{if(value===null)sessionStorage.removeItem(key);else sessionStorage.setItem(key,JSON.stringify(value))}catch{/* Persistence is optional; live uploads remain usable. */}}

export default function SubmitGamePageClient({categories}:{categories:Category[]}){
  const {session,loading}=useAuth()
  if(loading)return <main className="mx-auto max-w-3xl p-6"><FormFeedback tone="info" title="Chargement du compte…" announce/></main>
  if(!session)return <main className="mx-auto max-w-3xl space-y-5 p-6"><h1 className="text-3xl font-bold">Publier un jeu</h1><FormFeedback tone="info" title="Connectez-vous pour soumettre un jeu"><p>Un compte est nécessaire pour envoyer un build Web ZIP et suivre sa vérification.</p></FormFeedback><HelpText>{REVIEW_NOTICE}</HelpText><nav className="flex gap-4"><Link href="/login?next=%2Fpublier-un-jeu">Se connecter</Link><Link href="/register?next=%2Fpublier-un-jeu">Créer un compte</Link></nav></main>
  return <Submission key={session.user.id} actor={session.user.id} token={session.access_token} categories={categories}/>
}

function Submission({actor,token,categories}:{actor:string;token:string;categories:Category[]}){
  const key='cg-build-upload:'+actor,reservationKey='cg-game-registration:'+actor
  const [restored]=useState(()=>restore<UploadDraft>(key))
  const [reserved,setReserved]=useState(()=>restore<{id:string;title:string}>(reservationKey))
  const [mode,setMode]=useState<SubmissionMode>(restored?.mode??'new')
  const [games,setGames]=useState<ManagedGame[]>([]),[offset,setOffset]=useState(0),[max,setMax]=useState(0),[loadingGames,setLoadingGames]=useState(true)
  const [game,setGame]=useState(restored?.gameId??''),[title,setTitle]=useState(reserved?.title??''),[version,setVersion]=useState(restored?.version??'')
  const [studio,setStudio]=useState(''),[releaseDate,setReleaseDate]=useState(''),[description,setDescription]=useState(''),[website,setWebsite]=useState(''),[technology,setTechnology]=useState(''),[mobile,setMobile]=useState('')
  const [selected,setSelected]=useState<string[]>([]),[ownership,setOwnership]=useState(false),[file,setFile]=useState<File|null>(null),[cover,setCover]=useState<File|null>(null)
  const [draft,setDraft]=useState<UploadDraft|null>(restored),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState(''),[done,setDone]=useState(false)
  const [editorialUpload,setEditorialUpload]=useState<string|null>(null)
  const stop=useRef<AbortController|null>(null),registration=useRef<string|null>(null)
  const errorId=useId()
  const gameId=mode==='new'?(draft?.gameId??reserved?.id??''):game
  useEffect(()=>()=>stop.current?.abort(),[])
  useEffect(()=>{if(error){const notice=document.getElementById(errorId);notice?.focus({preventScroll:true});notice?.scrollIntoView({block:'nearest'})}},[error,errorId])
  useEffect(()=>{
    const id=new URLSearchParams(window.location.search).get('upload');if(!id)return
    const controller=new AbortController()
    developerJson('/api/developer/submissions?uploadId='+encodeURIComponent(id),token,{signal:controller.signal}).then(({data})=>{
      if(!controller.signal.aborted){setEditorialUpload(id);setMode(data.kind);setGame(data.gameId);setVersion(data.version)
        if(data.kind==='new'){const value={id:data.gameId,title:''};setReserved(value);remember(reservationKey,value)}
      }
    }).catch(()=>{if(!controller.signal.aborted)setError('Soumission introuvable ou accès refusé.')})
    return()=>controller.abort()
  },[token,reservationKey])
  useEffect(()=>{
    const controller=new AbortController()
    developerJson('/api/developer/games?offset='+offset,token,{signal:controller.signal}).then(body=>{
      if(!controller.signal.aborted){setGames(body.data);setMax(body.maxArchiveBytes);setLoadingGames(false)}
    }).catch(()=>{if(!controller.signal.aborted){setError('Impossible de charger les jeux gérés.');setLoadingGames(false)}})
    return()=>controller.abort()
  },[token,offset])
  const save=(value:UploadDraft)=>{setDraft({...value});remember(key,value)}
  async function createGame(){
    setBusy(true);setError('')
    try{
      registration.current??=crypto.randomUUID()
      const body=await developerJson('/api/developer/games',token,{method:'POST',headers:{'Idempotency-Key':registration.current},body:JSON.stringify({title})})
      const value={id:body.data.gameId,title};setReserved(value);remember(reservationKey,value)
      registration.current=null
    }catch(cause){setError(submissionError(cause instanceof SubmissionError?cause.code:''))}finally{setBusy(false)}
  }
  async function send(){
    setError('');setDone(false)
    if(!editorialUpload&&(!file||!zipFileAllowed(file,max))){setError(submissionError(file&&file.size>max?'file_too_large':'invalid_zip'));return}
    if(!gameId||!version||!ownership){setError('Sélectionner le jeu, saisir la version et confirmer les droits.');return}
    if(mode==='new'&&(!title.trim()||!studio.trim()||!releaseDate||!description.trim()||!selected.length||!mobile||!technology.trim()||!cover)){
      setError('Compléter les informations du nouveau jeu et choisir une couverture.');return
    }
    if(cover&&cover.size>8*1024**2){setError('La couverture dépasse 8 Mio.');return}
    setBusy(true);const controller=new AbortController();stop.current=controller
    try{
      let uploadId=editorialUpload
      if(!uploadId&&file){
        const value=draft??{requestId:crypto.randomUUID(),gameId,version,mode,name:file.name,size:file.size,lastModified:file.lastModified,hashes:{}}
        save(value);uploadId=await uploadBuild(file,value,controller.signal,{api:(path,init)=>developerJson(path,token,init),put:putPart,save,progress:setProgress})
      }
      const metadata=mode==='new'?{title,studio,releaseDate,description,categories:selected,mobile:mobile==='yes',technology,website}:{}
      const body=new FormData();body.set('metadata',JSON.stringify({uploadId,kind:mode,metadata,ownership}))
      if(mode==='new'&&cover)body.set('cover',cover)
      await developerJson('/api/developer/submissions',token,{method:'POST',signal:controller.signal,body})
      setDone(true);remember(key,null);setDraft(null)
      if(mode==='new'){remember(reservationKey,null);setReserved(null)}
    }catch(cause){
      const code=cause instanceof SubmissionError?cause.code:'upload_interrupted'
      setError(code==='invalid_cover'?'Couverture invalide : choisir une image JPG, PNG, WEBP, GIF, AVIF ou SVG statique valide.':submissionError(code))
      if(['invalid_version','version_conflict','invalid_request'].includes(code)&&!draft?.uploadId){setDraft(null);remember(key,null)}
    }finally{setBusy(false);stop.current=null}
  }
  const input='mt-2 block w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-base placeholder:text-zinc-500 focus:border-cyan-500 focus:outline-cyan-500'
  const button='max-w-full rounded-lg border border-cyan-700 px-4 py-2 disabled:opacity-40'
  const fields='space-y-4 [&>label]:block [&>label]:text-sm [&>label]:font-medium'
  return <main className="mx-auto max-w-3xl space-y-6 p-6"><h1 className="text-3xl font-bold">Publier un jeu Web</h1>
    <HelpText>Envoyez un ZIP autonome contenant <code>chibasko.json</code> à sa racine.</HelpText>
    <FormFeedback tone="warning" title="Chaque version fait l’objet d’une revue"><p>{REVIEW_NOTICE} Chibasko Games peut refuser un jeu.</p></FormFeedback>
    <Link className="inline-block text-cyan-300 underline underline-offset-4" href="/developer/submissions">Mes soumissions</Link>
    {error&&<FormFeedback id={errorId} tone="error" title="Impossible de terminer cette action"><p>{error}</p></FormFeedback>}
    {done?<FormFeedback tone="success" title="Jeu reçu — vérification sous 24 à 48 h"><p>La publication nécessite une décision admin après vérification.</p><Link className="underline underline-offset-4" href="/developer/submissions">Suivre ma soumission</Link></FormFeedback>:<>
      <SubmissionTabs mode={mode} disabled={busy||!!draft||!!editorialUpload} onChange={value=>{setMode(value);setError('');setFile(null);setProgress(0)}}/>
      <form role="tabpanel" id="submission-panel" aria-labelledby={'tab-'+mode} className="space-y-5" onSubmit={event=>{event.preventDefault();void send()}}>
        {mode==='new'?<fieldset disabled={busy} className={fields}><legend className="text-xl">Informations du nouveau jeu</legend>
          <label>Titre<input className={input} maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} required/></label>
          {!gameId&&<><FormFeedback tone="info" title="Réserver l’identité du jeu"><p>Obtenez son gameId avant de construire le ZIP. Cette réservation ne publie pas le jeu.</p></FormFeedback><button type="button" className={button} disabled={!title.trim()} onClick={createGame}>{busy?'Création…':'Créer le jeu privé et obtenir son gameId'}</button></>}
          {gameId&&<GameIdentityNotice key={gameId} gameId={gameId} newGame/>}
          <label>Développeur / studio<input className={input} maxLength={160} value={studio} onChange={e=>setStudio(e.target.value)} required/></label>
          <label>Date de sortie<input className={input} type="date" value={releaseDate} onChange={e=>setReleaseDate(e.target.value)} required/></label>
          <label>Description<textarea className={input} maxLength={10000} rows={5} value={description} onChange={e=>setDescription(e.target.value)} required/></label>
          <fieldset><legend>Catégories (1 à 8)</legend>{categories.map(category=><label key={category.id} className="mr-4 inline-block"><input type="checkbox" checked={selected.includes(category.id)} disabled={!selected.includes(category.id)&&selected.length>=8} onChange={e=>setSelected(previous=>e.target.checked?[...previous,category.id]:previous.filter(id=>id!==category.id))}/> {category.name}</label>)}</fieldset>
          <div><label htmlFor="mobile-compatible">Compatible mobile</label><select id="mobile-compatible" className={input} value={mobile} onChange={e=>setMobile(e.target.value)} required><option value="">Choisir</option><option value="yes">Oui</option><option value="no">Non</option></select></div>
          <label>Technologie<input className={input} maxLength={120} placeholder="HTML/JS, Unity WebGL, Godot, Phaser…" value={technology} onChange={e=>setTechnology(e.target.value)} required/></label>
          <label>Site développeur (HTTPS, facultatif)<input className={input} type="url" maxLength={2048} value={website} onChange={e=>setWebsite(e.target.value)}/></label>
          <label>Miniature / image de couverture<input className={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/svg+xml" aria-describedby="cover-help" onChange={e=>setCover(e.target.files?.[0]??null)} required/></label>
          <HelpText id="cover-help">8 Mio maximum. Image JPG, PNG, WEBP, GIF, AVIF ou SVG statique valide.</HelpText>
          <HelpText>Ces informations éditoriales sont examinées par l’administration. Le contact utilise l’adresse du compte. Les statistiques de communauté sont calculées par Chibasko Games.</HelpText>
        </fieldset>:<fieldset disabled={busy||!!draft||!!editorialUpload} className="space-y-4"><legend className="text-xl">Version d’un jeu existant</legend>
          <ManagedGamePicker games={games} value={game} loading={loadingGames} onChange={setGame}/>
          <div className="flex gap-3"><button type="button" className={button} disabled={!offset} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Jeux précédents</button><button type="button" className={button} disabled={games.length<50} onClick={()=>setOffset(n=>n+50)}>Jeux suivants</button></div>
          <FormFeedback tone="info" title="Mise à jour du build uniquement"><p>La fiche catalogue reste inchangée ; ses modifications restent gérées par la revue admin.</p></FormFeedback>
        </fieldset>}
        {mode==='update'&&gameId&&<GameIdentityNotice key={gameId} gameId={gameId} newGame={false}/>}
        <fieldset disabled={busy} className={fields}><legend className="text-xl">Build Web</legend>
          <label>Version du build (SemVer)<input className={input} placeholder="1.0.0" maxLength={64} value={version} disabled={!!draft||!!editorialUpload} onChange={e=>setVersion(e.target.value)} required/></label>
          {editorialUpload?<FormFeedback tone="info" title="ZIP déjà reçu"><p>Complétez uniquement la soumission, sans renvoyer le build.</p></FormFeedback>:<><label>ZIP du build<input className={input} type="file" accept=".zip,application/zip" aria-describedby="zip-help" onChange={e=>setFile(e.target.files?.[0]??null)}/></label><HelpText id="zip-help">Maximum {max?(max/1024**2)+' Mio':'en cours de chargement'}. Le manifeste chibasko.json doit être à la racine du ZIP.</HelpText></>}
          <label className="block"><input type="checkbox" checked={ownership} onChange={e=>setOwnership(e.target.checked)}/> Je dispose des droits nécessaires pour soumettre ce jeu.</label>
        </fieldset>
        {draft&&<FormFeedback tone="info" title="Envoi mémorisé"><p>{draft.name}. Pour reprendre, sélectionnez le même ZIP ; les parties reçues sont vérifiées avant réutilisation.</p></FormFeedback>}
        {busy&&<p role="status" className="text-sm font-medium text-cyan-200">Traitement en cours…</p>}
        <progress className="w-full" aria-label="Progression de l’envoi" value={progress} max={file?.size||1}/>
        <div className="flex flex-wrap gap-3"><button type="submit" className={button} disabled={busy||!max||!gameId||(!file&&!editorialUpload)||!ownership}>{busy?'Envoi…':editorialUpload?'Terminer la soumission':draft?'Reprendre et finaliser':'Envoyer le build'}</button>
          {busy&&<button type="button" className={button} onClick={()=>stop.current?.abort()}>Interrompre</button>}
          {draft&&!busy&&<button type="button" className={button} onClick={()=>{remember(key,null);setDraft(null);setProgress(0)}}>Nouvel envoi (l’ancien reste suivi)</button>}
        </div>
      </form>
    </>}
  </main>
}
