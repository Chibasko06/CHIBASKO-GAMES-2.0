'use client'

import Link from 'next/link'
import {useEffect,useRef,useState} from 'react'
import {useAuth} from '@/components/AuthProvider'
import {fetchJson} from '@/lib/asyncOperation'

type Entry={id:string;profile:{id:string;username:string}}
type Cursor={createdAt:string;id:string}
async function read(token:string,cursor:Cursor|null){
 const query=new URLSearchParams({kind:'blocked',...(cursor?{before:cursor.createdAt,cursor:cursor.id}:{})})
 const {response,payload}=await fetchJson('/api/social?'+query,{headers:{Authorization:'Bearer '+token}})
 if(!response.ok)throw new Error('social_read_failed')
 return payload as {items:Entry[];nextCursor:Cursor|null}
}
export default function BlockedAccounts(){
 const {session,loading}=useAuth(),token=session?.access_token
 if(loading)return <p role="status">Chargement du compte…</p>
 if(!token)return <p><Link href="/login?next=/dashboard/blocked" className="text-cyan-300 underline">Connecte-toi pour gérer tes comptes bloqués.</Link></p>
 return <BlockedList key={token} token={token}/>
}
function BlockedList({token}:{token:string}){
 const [items,setItems]=useState<Entry[]>([]),[cursor,setCursor]=useState<Cursor|null>(null)
 const [busy,setBusy]=useState(true),[message,setMessage]=useState(''),[ready,setReady]=useState(false)
 const generation=useRef(0),locked=useRef(true)
 useEffect(()=>{
  const version=++generation.current
  void read(token,null).then(result=>{
   if(version===generation.current){setItems(result.items);setCursor(result.nextCursor);setReady(true)}
  }).catch(()=>{if(version===generation.current)setMessage('Impossible de charger les comptes bloqués. Réessaie.')})
   .finally(()=>{if(version===generation.current){locked.current=false;setBusy(false)}})
  return()=>{generation.current=version+1}
 },[token])
 async function refresh(next:Cursor|null=null){
  if(!token||locked.current)return
  const version=generation.current
  locked.current=true;setBusy(true);setMessage('')
  try{const result=await read(token,next);if(version!==generation.current)return
   setItems(previous=>next?[...previous,...result.items]:result.items);setCursor(result.nextCursor);setReady(true)
  }catch{if(version===generation.current)setMessage('Impossible de charger les comptes bloqués. Réessaie.')}
  finally{if(version===generation.current){locked.current=false;setBusy(false)}}
 }
 async function unblock(id:string,relationId:string){
  if(!token||locked.current||!ready)return
  const version=generation.current
  locked.current=true;setBusy(true);setMessage('');setReady(false)
  let confirmed=false
  try{
   const {response}=await fetchJson('/api/social',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({action:'unblock',target:id,relationId,operationId:crypto.randomUUID()})})
   confirmed=response.ok
  }catch{/* La lecture suivante réconcilie une réponse de mutation incertaine. */}
  if(version!==generation.current)return
  try{
   const result=await read(token,null)
   if(version!==generation.current)return
   setItems(result.items);setCursor(result.nextCursor);setReady(true)
   setMessage(confirmed?'Compte débloqué. L’amitié n’est pas rétablie automatiquement.':'État actualisé après une réponse incertaine. Aucune mutation n’a été répétée.')
  }catch{if(version===generation.current)setMessage('État non confirmé. Actualise la liste avant une nouvelle action.')}
  finally{if(version===generation.current){locked.current=false;setBusy(false)}}
 }
 return <section className="mx-auto max-w-2xl space-y-5" aria-busy={busy}>
  <Link href="/dashboard" className="text-cyan-300 hover:underline">← Tableau de bord</Link><h1 className="text-2xl font-bold">Comptes bloqués</h1>
  <p className="text-sm text-zinc-400">Le déblocage ne restaure pas l’amitié. Un blocage décidé par l’autre personne reste applicable. Les profils publics restent consultables sans connexion.</p>
  {message&&<p role="status" className="text-sm text-cyan-200">{message}</p>}
  <button disabled={busy} onClick={()=>void refresh()} className="rounded-lg border border-zinc-700 px-4 py-3 disabled:opacity-50">Actualiser</button>
  {ready&&!items.length&&<p>Aucun compte bloqué.</p>}
  <ul className="space-y-2">{items.map(item=><li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 p-3">
   <span className="min-w-0 break-all">@{item.profile.username}</span><button disabled={busy||!ready} onClick={()=>void unblock(item.profile.id,item.id)} className="shrink-0 rounded-lg border border-cyan-800 px-3 py-3 text-cyan-200 disabled:opacity-50">Débloquer <span className="sr-only">@{item.profile.username}</span></button>
  </li>)}</ul>
  {cursor&&<button disabled={busy} onClick={()=>void refresh(cursor)} className="rounded-lg border border-zinc-700 px-4 py-3 disabled:opacity-50">Afficher la suite</button>}
 </section>
}
