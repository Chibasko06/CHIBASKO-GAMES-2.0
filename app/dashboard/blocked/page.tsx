'use client'

import Link from 'next/link'
import Image from 'next/image'
import {useEffect,useRef,useState} from 'react'
import {useAuth} from '@/components/AuthProvider'
import {fetchJson} from '@/lib/asyncOperation'
import SocialConfirmation from '@/components/SocialConfirmation'
import RoleBadges from '@/components/RoleBadges'
import {readSocialPage,type SocialEntry as Entry,type SocialCursor as Cursor} from '@/lib/social'

async function read(token:string,cursor:Cursor|null){
 return readSocialPage(token,'blocked',cursor)
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
 const [confirmation,setConfirmation]=useState<Entry|null>(null)
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
  finally{if(version===generation.current){locked.current=false;setBusy(false);setConfirmation(null)}}
 }
 return <section className="mx-auto max-w-2xl space-y-5" aria-busy={busy}>
  <Link href="/dashboard" className="text-cyan-300 hover:underline">← Tableau de bord</Link><h1 className="text-2xl font-bold">Comptes bloqués</h1>
  <p className="text-sm text-zinc-400">Le déblocage ne restaure pas l’amitié. Un blocage décidé par l’autre personne reste applicable. Les profils publics restent consultables sans connexion.</p>
  {message&&<p role="status" className="text-sm text-cyan-200">{message}</p>}
  <button disabled={busy} onClick={()=>void refresh()} className="rounded-lg border border-zinc-700 px-4 py-3 disabled:opacity-50">Actualiser</button>
  {ready&&!items.length&&<p>Aucun compte bloqué.</p>}
  <ul className="space-y-2">{items.map(item=><li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 p-3">
   <div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-cyan-950 text-cyan-200">{item.profile.avatar_url?<Image src={item.profile.avatar_url} alt="" width={40} height={40} unoptimized className="h-full w-full object-cover"/>:item.profile.username[0]?.toUpperCase()}</span><div className="min-w-0"><p className="break-all">@{item.profile.username}</p><RoleBadges roles={item.profile.roles}/></div></div><button disabled={busy||!ready} onClick={()=>setConfirmation(item)} className="shrink-0 rounded-lg border border-cyan-800 px-3 py-3 text-cyan-200 disabled:opacity-50">Débloquer <span className="sr-only">@{item.profile.username}</span></button>
  </li>)}</ul>
  {cursor&&<button disabled={busy} onClick={()=>void refresh(cursor)} className="rounded-lg border border-zinc-700 px-4 py-3 disabled:opacity-50">Afficher la suite</button>}
  {confirmation&&<SocialConfirmation title={'Débloquer @'+confirmation.profile.username+' ?'} description="L’amitié ne sera pas rétablie. Si l’autre personne t’a bloqué, son blocage restera actif." busy={busy} onCancel={()=>setConfirmation(null)} onConfirm={()=>void unblock(confirmation.profile.id,confirmation.id)}/>}
 </section>
}
