'use client'
import {useEffect,useRef,useState} from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {useAuth} from '@/components/AuthProvider'
import SharedGames from '@/components/SharedGames'
import {type SocialUpdate} from '@/lib/socialNotifications'
import RoleBadges from '@/components/RoleBadges'
import ProfileSocialActions from '@/components/ProfileSocialActions'
import {publicProfilePath} from '@/lib/publicUsername'
import type {PublicProfile} from '@/lib/queries/profiles'
import {readSocialPage,socialButton,type SocialKind,type SocialPage,type SocialChange,type Relation} from '@/lib/social'

type Kind=Exclude<SocialKind,'blocked'>
const sections:Record<Kind,{title:string;empty:string;description:string}>={
 friends:{title:'Mes amis',empty:'Pas encore d’ami',description:'Recherche un @pseudo pour retrouver un joueur et lui envoyer une demande.'},
 incoming:{title:'Demandes reçues',empty:'Aucune demande reçue',description:'Tes nouvelles demandes d’amis apparaîtront ici.'},
 outgoing:{title:'Demandes envoyées',empty:'Aucune demande envoyée',description:'Les demandes en attente de réponse apparaîtront ici.'},
}
export default function CommunityHub({profiles,searching,children}:{profiles:PublicProfile[];searching:boolean;children?:React.ReactNode}){
 const {user,session,loading}=useAuth()
 return <Hub key={session?.access_token??'guest'} token={session?.access_token} loading={loading} userId={user?.id} profiles={profiles} searching={searching}>{children}</Hub>
}
function Hub({token,userId,loading,profiles,searching,children}:{token?:string;userId?:string;loading:boolean;profiles:PublicProfile[];searching:boolean;children?:React.ReactNode}){
 const [hidden,setHidden]=useState<string[]>([]),[states,setStates]=useState<Record<string,Relation>>({})
 const [notice,setNotice]=useState('')
 const [revisions,setRevisions]=useState<Record<Kind,number>>({friends:0,incoming:0,outgoing:0})
 function changed(event:SocialChange){
  setStates(previous=>({...previous,[event.target]:event.relation}))
  setNotice(event.relation.state==='friends'?'Vous êtes maintenant amis.':event.relation.state==='outgoing'?'Demande envoyée.':event.relation.state==='blocked'?'Compte bloqué.':event.action==='cancel'?'Demande annulée.':event.action==='reject'?'Demande refusée.':event.action==='remove'?'Amitié supprimée.':'Relation actualisée.')
  if(['blocked','unavailable'].includes(event.relation.state))setHidden(previous=>[...new Set([...previous,event.target])])
  const affected:Kind[]=event.action==='request'?['outgoing','incoming']:event.action==='accept'?['friends','incoming']:event.action==='reject'?['incoming']:event.action==='cancel'?['outgoing']:event.action==='remove'?['friends']:['friends','incoming','outgoing']
  setRevisions(previous=>Object.fromEntries((Object.keys(previous) as Kind[]).map(key=>[key,previous[key]+(affected.includes(key)?1:0)])) as Record<Kind,number>)
 }
 const changeHandler=useRef(changed)
 useEffect(()=>{changeHandler.current=changed})
 useEffect(()=>{
  const receive=(event:Event)=>{const detail=(event as CustomEvent<SocialUpdate>).detail;if(detail?.actorId===userId&&detail.source==='bell')changeHandler.current(detail.change)}
  window.addEventListener('chibasko:social-change',receive)
  return()=>window.removeEventListener('chibasko:social-change',receive)
 },[userId])
 const found=profiles.filter(profile=>!hidden.includes(profile.id))
 return <div className="space-y-7">
  {notice&&<p role="status" className="text-sm text-cyan-200">{notice}</p>}
  {searching&&<section aria-labelledby="search-results-title" className="space-y-3">
   <h2 id="search-results-title" className="text-lg font-semibold">Résultats de recherche</h2>
   {!found.length?<p role="status" className="rounded-xl border border-dashed border-zinc-700 p-5 text-sm text-zinc-400">Aucun joueur accessible avec ce pseudo. Essaie un autre identifiant.</p>:<ul className="grid gap-3 md:grid-cols-2">{found.map(profile=><li key={profile.id} className="flex min-w-0 items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
    <MemberLink profile={profile}/><ProfileSocialActions target={profile.id} username={profile.username} initial={states[profile.id]} onChanged={changed}/>
   </li>)}</ul>}{children}
  </section>}
  {loading?<p role="status" className="text-sm text-zinc-400">Chargement de ton espace…</p>:token&&userId?<SocialLists key={userId} token={token} revisions={revisions} hidden={hidden} onChanged={changed}/>:<section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-5">
   <div><h2 className="font-semibold">Retrouve tes amis sur Chibasko Games</h2><p className="mt-1 text-sm text-zinc-400">Connecte-toi pour envoyer des demandes et retrouver tes amis dans un espace privé.</p></div>
   <Link href="/login?next=/players" className={socialButton+' border-cyan-700 text-cyan-200'}>Se connecter</Link>
  </section>}
  {token&&userId&&<SharedGames token={token} actorId={userId}/>}
 </div>
}
function MemberLink({profile}:{profile:{username:string;avatar_url?:string|null;bio?:string|null;roles?:PublicProfile['roles']}}){
 return <Link href={publicProfilePath(profile.username)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-cyan-300">
  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-cyan-950 font-bold text-cyan-200">{profile.avatar_url?<Image src={profile.avatar_url} alt="" width={44} height={44} unoptimized className="h-full w-full object-cover"/>:profile.username[0]?.toUpperCase()}</span>
  <span className="min-w-0"><span className="block truncate font-semibold text-white">@{profile.username}</span><RoleBadges roles={profile.roles}/>{profile.bio&&<span className="mt-1 block truncate text-xs text-zinc-400">{profile.bio}</span>}</span>
 </Link>
}
function SocialLists({token,revisions,hidden,onChanged}:{token:string;revisions:Record<Kind,number>;hidden:string[];onChanged:(event:SocialChange)=>void}){
 const [kind,setKind]=useState<Kind>('friends'),[page,setPage]=useState<SocialPage|null>(null)
 const [busy,setBusy]=useState(true),[error,setError]=useState('')
 const cache=useRef<Partial<Record<Kind,{revision:number;page:SocialPage}>>>({}),epoch=useRef(0),locked=useRef(false),mounted=useRef(true)
 const currentRevision=revisions[kind]
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 useEffect(()=>{
  let cancelled=false
  const version=++epoch.current;locked.current=true
  const cached=cache.current[kind]
  void Promise.resolve().then(()=>{
   if(!cancelled&&mounted.current&&version===epoch.current)setBusy(true)
   return cached?.revision===currentRevision?cached.page:readSocialPage(token,kind)
  }).then(result=>{if(!cancelled&&mounted.current&&version===epoch.current){cache.current[kind]={revision:currentRevision,page:result};setPage(result);setError('')}})
   .catch(()=>{if(!cancelled&&mounted.current&&version===epoch.current){setPage(null);setError('Impossible de charger cette liste. Réessaie.')}})
   .finally(()=>{if(!cancelled&&mounted.current&&version===epoch.current){locked.current=false;setBusy(false)}})
  return()=>{cancelled=true}
 },[token,kind,currentRevision])
 function select(next:Kind){
  if(next===kind)return
  ++epoch.current;setPage(cache.current[next]?.page??null);setKind(next);setBusy(true);setError('')
 }
 async function readMore(reset=false){
  if(locked.current||(!reset&&!page?.nextCursor))return
  const version=++epoch.current;locked.current=true;setBusy(true);setError('')
  try{const next=await readSocialPage(token,kind,reset?null:page!.nextCursor)
   if(!mounted.current||version!==epoch.current)return
   const value=reset?next:{...next,items:[...(page?.items??[]),...next.items].filter((item,index,all)=>all.findIndex(other=>other.id===item.id)===index)}
   cache.current[kind]={revision:currentRevision,page:value};setPage(value)
  }catch{if(mounted.current&&version===epoch.current)setError('Impossible de charger cette liste. Réessaie.')}
  finally{if(mounted.current&&version===epoch.current){locked.current=false;setBusy(false)}}
 }
 function changed(event:SocialChange){
  cache.current={};setBusy(true);setPage(previous=>previous?{...previous,items:previous.items.filter(item=>item.profile.id!==event.target)}:null)
  onChanged(event)
 }
 const visible=page?.items.filter(item=>!hidden.includes(item.profile.id))??[]
 return <section aria-labelledby="social-list-title" className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="social-list-title" className="text-xl font-bold">Ton espace amis</h2><Link href="/dashboard/blocked" className="rounded px-2 py-3 text-sm text-zinc-400 hover:text-cyan-300">Comptes bloqués ↗</Link></div>
  <div className="flex flex-wrap gap-2" aria-label="Listes d’amis">{(Object.keys(sections) as Kind[]).map(value=><button key={value} type="button" aria-pressed={kind===value} onClick={()=>select(value)} className={socialButton+(kind===value?' border-cyan-600 bg-cyan-950/50 text-cyan-200':'')}>{sections[value].title}</button>)}<button disabled={busy} className={socialButton+' sm:ml-auto'} onClick={()=>void readMore(true)}>Actualiser la liste</button></div>
  <div aria-busy={busy}>
   {busy&&<p role="status" className="mb-3 text-sm text-zinc-400">Chargement de la liste…</p>}
   {error&&<div role="alert" className="mb-3 flex flex-wrap items-center gap-3 text-sm text-red-300">{error}<button disabled={busy} className={socialButton} onClick={()=>void readMore(true)}>Réessayer</button></div>}
   {!busy&&page&&!visible.length&&<div className="rounded-xl border border-dashed border-zinc-700 p-6"><h3 className="font-semibold">{sections[kind].empty}</h3><p className="mt-2 text-sm text-zinc-400">{sections[kind].description}</p></div>}
   {page&&<ul inert={busy} className="grid gap-3 md:grid-cols-2">{visible.map(item=><li key={item.id} className="flex min-w-0 items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4"><MemberLink profile={item.profile}/><ProfileSocialActions target={item.profile.id} username={item.profile.username} initial={{state:kind==='friends'?'friends':kind,relationId:item.id}} onChanged={changed}/></li>)}</ul>}
   {page?.nextCursor&&<button disabled={busy} onClick={()=>void readMore()} className={socialButton+' mt-4'}>Afficher 20 joueurs de plus</button>}
  </div>
 </section>
}
