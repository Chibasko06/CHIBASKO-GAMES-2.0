'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {readNotifications,notificationCall,parseUnread,notificationReadTime,emitSocialUpdate,type NotificationPage,type NotificationItem} from '@/lib/socialNotifications'
import {changeSocialRelation,readSocialRelation,socialButton} from '@/lib/social'
import {publicProfilePath} from '@/lib/publicUsername'

export default function NotificationFeed({token,actorId,kind='all',onCount}:{token:string;actorId:string;kind?:'all'|'shares';onCount?:(count:number,observedAt:number)=>void}){
 const [page,setPage]=useState<NotificationPage|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false)
 const alive=useRef(true),epoch=useRef(0),lock=useRef(false),countHandler=useRef(onCount)
 const publishCount=useCallback((count:number,observedAt=notificationReadTime())=>{if(countHandler.current)countHandler.current(count,observedAt);else window.dispatchEvent(new CustomEvent('chibasko:notification-count',{detail:{actorId,count,observedAt}}))},[actorId])
 useEffect(()=>{countHandler.current=onCount},[onCount])
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>{
  let cancelled=false;const observedAt=notificationReadTime(),version=++epoch.current;lock.current=true
  void readNotifications(token,kind).then(result=>{if(!cancelled&&alive.current&&version===epoch.current){setPage(result);publishCount(result.unreadCount,observedAt)}})
   .catch(()=>{if(!cancelled&&alive.current&&version===epoch.current)setError('Impossible de charger les notifications.')})
   .finally(()=>{if(!cancelled&&alive.current&&version===epoch.current){setBusy(false);lock.current=false}})
  return()=>{cancelled=true}
 },[token,kind,publishCount])
 async function load(more=false){
  if(lock.current)return
  lock.current=true;setBusy(true);setError('');const observedAt=notificationReadTime(),version=++epoch.current
  try{const next=await readNotifications(token,kind,more?page?.nextCursor:null)
   if(alive.current&&version===epoch.current){setUncertain(false);setPage(previous=>more&&previous?{...next,items:[...previous.items,...next.items].filter((item,index,all)=>all.findIndex(other=>other.id===item.id)===index)}:next);publishCount(next.unreadCount,observedAt)}
  }catch{if(alive.current&&version===epoch.current)setError('Impossible de charger les notifications. Réessaie.')}
  finally{if(alive.current&&version===epoch.current){lock.current=false;setBusy(false)}}
 }
 async function mark(ids:string[]){
  if(lock.current||!ids.length)return
  lock.current=true;setBusy(true);setError('');const version=++epoch.current
  try{const count=parseUnread(await notificationCall(token,'all',{action:'read',ids}))
   if(alive.current&&version===epoch.current){setPage(previous=>previous?{...previous,unreadCount:count,readIds:previous.readIds.filter(id=>!ids.includes(id)),items:previous.items.map(item=>ids.includes(item.id)?{...item,read:true}:item)}:null);publishCount(count)}
  }catch{if(alive.current&&version===epoch.current)setError('Lecture non confirmée. Actualise avant de réessayer.')}
  finally{if(alive.current&&version===epoch.current){lock.current=false;setBusy(false)}}
 }
 async function decide(item:NotificationItem,action:'accept'|'reject'){
  if(lock.current||uncertain||!item.actionable||!item.relationId)return
  lock.current=true;setBusy(true);setError('');const version=++epoch.current
  try{
   let relation
   try{relation=await changeSocialRelation(token,item.sender.id,action,item.relationId)}
   catch{if(!alive.current||version!==epoch.current)return;relation=await readSocialRelation(token,item.sender.id);if(relation.state==='incoming'&&relation.relationId===item.relationId)throw Error('mutation_not_confirmed')}
   if(!alive.current||version!==epoch.current)return
   emitSocialUpdate({actorId,source:'bell',change:{action,target:item.sender.id,relation}})
   const observedAt=notificationReadTime(),next=await readNotifications(token,kind)
   if(alive.current&&version===epoch.current){setUncertain(false);setPage(next);publishCount(next.unreadCount,observedAt)}
  }catch{if(alive.current&&version===epoch.current){setUncertain(true);setError('Impossible de confirmer l’état actualisé. Actualise la liste avant une nouvelle décision.')}}
  finally{if(alive.current&&version===epoch.current){lock.current=false;setBusy(false)}}
 }
 return <div className="space-y-3" aria-busy={busy}>
  <div className="flex flex-wrap gap-2"><button disabled={busy} className={socialButton} onClick={()=>void load()}>Actualiser</button>{kind==='all'&&<button disabled={busy||!page?.readIds.length} className={socialButton} onClick={()=>void mark(page!.readIds)}>Tout marquer comme lu</button>}</div>
  {busy&&<p role="status" className="text-sm text-zinc-400">Chargement…</p>}{error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
  {!busy&&page&&!page.items.length&&<p className="rounded-xl border border-dashed border-zinc-700 p-5 text-sm text-zinc-400">{kind==='shares'?'Aucun jeu partagé pour le moment.':'Aucune notification pour le moment.'}</p>}
  <ul className="space-y-2">{page?.items.map(item=><li key={item.id} className={'rounded-xl border p-4 '+(item.read?'border-zinc-800 bg-zinc-900/30':'border-cyan-900 bg-cyan-950/30')}>
   <div className="flex justify-between gap-2"><Link href={publicProfilePath(item.sender.username)} className="break-all font-semibold text-cyan-200 underline-offset-4 hover:underline">@{item.sender.username}</Link>{!item.read&&<span className="text-xs text-cyan-300">Non lue</span>}</div>
   <p className="mt-1 text-sm text-zinc-300">{item.kind==='game_shared'?'te recommande un jeu.':item.kind==='friend_accepted'?'a accepté ta demande d’ami.':item.actionable?'souhaite t’ajouter en ami.':'Demande terminée.'}</p>
   {item.kind==='game_shared'&&(item.game?<Link href={'/games/'+encodeURIComponent(item.game.slug)} className="mt-2 block break-words text-sm font-medium text-cyan-200 underline">{item.game.title}</Link>:<p className="mt-2 text-sm text-zinc-500">Jeu indisponible</p>)}
   <time dateTime={item.createdAt} className="mt-2 block text-xs text-zinc-500">{new Date(item.createdAt).toLocaleDateString('fr-FR')}</time>
   <div className="mt-2 flex flex-wrap gap-2">{item.actionable&&<><button disabled={busy||uncertain} className={socialButton} onClick={()=>void decide(item,'accept')}>Accepter</button><button disabled={busy||uncertain} className={socialButton} onClick={()=>void decide(item,'reject')}>Refuser</button></>}{!item.read&&<button disabled={busy} className={socialButton} onClick={()=>void mark([item.id])}>Marquer comme lue</button>}</div>
  </li>)}</ul>
  {page?.nextCursor&&<button disabled={busy} className={socialButton} onClick={()=>void load(true)}>Afficher les notifications suivantes</button>}
 </div>
}
