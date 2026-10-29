'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {useAuth} from '@/components/AuthProvider'
import ReportButton from '@/components/ReportButton'
import SocialDialog from '@/components/SocialDialog'
import {socialButton,type SocialPage} from '@/lib/social'
import {readShareFriends,notificationCall} from '@/lib/socialNotifications'

export default function GameSharingMenu({gameId,title,url}:{gameId:string;title:string;url:string}){
 const {user,session}=useAuth(),[open,setOpen]=useState(false),[notice,setNotice]=useState(''),[fallback,setFallback]=useState(false)
 const menu=useRef<HTMLDetailsElement>(null),sharing=useRef(false)
 async function publicShare(){
  if(sharing.current)return
  sharing.current=true;setNotice('');setFallback(false)
  try{
   if(navigator.share){try{await navigator.share({title,text:'Essaie ce jeu sur Chibasko Games !',url});setNotice('Lien partagé.');return}catch(error){if(error instanceof DOMException&&error.name==='AbortError')return}}
   try{await navigator.clipboard.writeText(url);setNotice('Lien copié.')}catch{setFallback(true);setNotice('Copie le lien ci-dessous pour le partager.')}
  }finally{sharing.current=false}
 }
 return <div className="relative shrink-0">
  <details ref={menu} onKeyDown={event=>{if(event.key==='Escape'&&menu.current){menu.current.open=false;menu.current.querySelector('summary')?.focus()}}}>
   <summary className={socialButton+' cursor-pointer list-none px-4'} aria-label="Partager ce jeu">···</summary>
   <div className="absolute right-0 z-30 mt-2 w-60 rounded-xl border border-zinc-700 bg-zinc-950 p-2 shadow-xl">
    {user&&session?<button className={socialButton+' w-full'} onClick={()=>{if(menu.current){menu.current.open=false;menu.current.querySelector('summary')?.focus()}setOpen(true)}}>Partager à un ami</button>:<Link href="/login" className={socialButton+' w-full'}>Se connecter pour partager à un ami</Link>}
    <button className={socialButton+' mt-2 w-full'} onClick={()=>void publicShare()}>Partager un lien</button>
    <ReportButton kind="game" target={gameId}/>
   </div>
  </details>
  {notice&&<p role="status" className="mt-2 max-w-60 text-sm text-cyan-200">{notice}</p>}
  {fallback&&<label className="mt-2 block text-sm">Lien du jeu<input readOnly value={url} onFocus={event=>event.currentTarget.select()} className="mt-1 w-full rounded border border-zinc-700 bg-black p-2"/></label>}
  {open&&user&&session&&<SocialDialog title="Partager à un ami" onClose={()=>setOpen(false)}><FriendPicker key={session.access_token+gameId} token={session.access_token} gameId={gameId}/></SocialDialog>}
 </div>
}
function FriendPicker({token,gameId}:{token:string;gameId:string}){
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[revision,setRevision]=useState(0),[page,setPage]=useState<SocialPage|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[sentIds,setSentIds]=useState<string[]>([])
 const alive=useRef(true),epoch=useRef(0),lock=useRef(false),operations=useRef(new Map<string,string>()),sent=useRef(new Set<string>())
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>{
  let cancelled=false;const version=++epoch.current;lock.current=true
  void readShareFriends(token,query).then(result=>{if(!cancelled&&alive.current&&version===epoch.current){setPage(result);setError('')}})
   .catch(()=>{if(!cancelled&&alive.current&&version===epoch.current)setError('Impossible de charger tes amis.')})
   .finally(()=>{if(!cancelled&&alive.current&&version===epoch.current){setBusy(false);lock.current=false}})
  return()=>{cancelled=true}
 },[token,query,revision])
 async function more(){
  if(lock.current||!page?.nextCursor)return
  lock.current=true;setBusy(true);const version=++epoch.current
  try{const next=await readShareFriends(token,query,page.nextCursor);if(alive.current&&version===epoch.current)setPage(previous=>({...next,items:[...(previous?.items??[]),...next.items].filter((item,index,all)=>all.findIndex(other=>other.id===item.id)===index)}))}
  catch{if(alive.current&&version===epoch.current)setError('Impossible de charger la suite.')}
  finally{if(alive.current&&version===epoch.current){lock.current=false;setBusy(false)}}
 }
 async function send(target:string){
  if(lock.current||sent.current.has(target))return
  lock.current=true;setBusy(true);setError('');setNotice('');const version=++epoch.current
  const operationId=operations.current.get(target)??crypto.randomUUID();operations.current.set(target,operationId)
  try{const result=await notificationCall(token,'all',{action:'share',target,gameId,operationId});if(!result||typeof result!=='object'||!('sent' in result)||result.sent!==true||!('replayed' in result)||typeof result.replayed!=='boolean')throw Error('Envoi non confirmé. Réessaie avec la même demande.');sent.current.add(target);if(alive.current&&version===epoch.current){setSentIds(previous=>[...previous,target]);setNotice(result.replayed?'Ce partage a déjà été enregistré. Aucun nouvel envoi.':'Jeu partagé avec ton ami.')}}
  catch(error){if(alive.current&&version===epoch.current)setError(error instanceof Error?error.message:'Envoi non confirmé. Une nouvelle tentative réutilisera la même demande.')}
  finally{if(alive.current&&version===epoch.current){lock.current=false;setBusy(false)}}
 }
 return <div className="space-y-3" aria-busy={busy}>
  <form onSubmit={event=>{event.preventDefault();if(!lock.current){setBusy(true);setQuery(search.trim());setRevision(value=>value+1)}}} className="flex flex-wrap gap-2"><label className="min-w-0 flex-1 text-sm">Rechercher parmi mes amis<input value={search} maxLength={32} onChange={event=>setSearch(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3" placeholder="@pseudo"/></label><button disabled={busy} className={socialButton}>Rechercher</button></form>
  {busy&&<p role="status">Chargement…</p>}{error&&<p role="alert" className="text-sm text-red-300">{error}</p>}{notice&&<p role="status" className="text-sm text-cyan-200">{notice}</p>}
  {!busy&&page&&!page.items.length&&<p className="text-sm text-zinc-400">Aucun ami correspondant. Les jeux se partagent uniquement entre amis.</p>}
  <ul className="space-y-2">{page?.items.map(item=><li key={item.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-zinc-800 p-3"><span className="truncate">@{item.profile.username}</span><button disabled={busy||sentIds.includes(item.profile.id)} onClick={()=>void send(item.profile.id)} className={socialButton}>{sentIds.includes(item.profile.id)?'Envoyé':'Partager'}</button></li>)}</ul>
  {page?.nextCursor&&<button disabled={busy} className={socialButton} onClick={()=>void more()}>Afficher 20 amis de plus</button>}
 </div>
}
