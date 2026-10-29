'use client'
import {useEffect,useRef,useState} from 'react'
import {useAuth} from '@/components/AuthProvider'
import SocialConfirmation from '@/components/SocialConfirmation'
import {changeSocialRelation,readSocialRelation,socialButton,SocialApiError,type Relation,type SocialAction,type SocialChange} from '@/lib/social'

type Props={target:string;username:string;initial?:Relation;onChanged?:(change:SocialChange)=>void}
export default function ProfileSocialActions(props:Props){
 const {session,user,loading}=useAuth()
 if(loading||!session||!user||user.id===props.target)return null
 return <Actions key={session.access_token+props.target+(props.initial?.state??'')+(props.initial?.relationId??'')} {...props} token={session.access_token}/>
}
function Actions({target,username,initial,onChanged,token}:Props&{token:string}){
 const [relation,setRelation]=useState<Relation|null>(initial??null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [confirmation,setConfirmation]=useState<SocialAction|null>(null),[uncertain,setUncertain]=useState(false)
 const alive=useRef(true),locked=useRef(false),menu=useRef<HTMLDetailsElement>(null)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 async function load(){
  if(locked.current)return
  locked.current=true;setBusy(true);setError('')
  try{const value=await readSocialRelation(token,target);if(alive.current){setRelation(value);setUncertain(false);if(value.state==='unavailable'||(relation&&(value.state!==relation.state||value.relationId!==relation.relationId)))onChanged?.({action:'refresh',target,relation:value})}}
  catch{if(alive.current)setError('Impossible de vérifier cette relation. Réessaie.')}
  finally{if(alive.current){locked.current=false;setBusy(false)}}
 }
 async function mutate(action:SocialAction){
  if(locked.current||!relation||uncertain)return
  locked.current=true;setBusy(true);setError('');setNotice('')
  let result:Relation|null=null
  let confirmed=false
  try{result=await changeSocialRelation(token,target,action,relation.relationId);confirmed=true}
  catch(cause){
   if(!alive.current)return
   setError(cause instanceof SocialApiError?cause.message:'Réponse incertaine. La mutation ne sera pas répétée automatiquement.')
   try{result=await readSocialRelation(token,target)}catch{if(alive.current)setUncertain(true)}
  }
  finally{if(alive.current){locked.current=false;setBusy(false);setConfirmation(null)}}
  if(!alive.current)return
  if(result){
   setRelation(result)
   if(confirmed||result.state!==relation.state||result.relationId!==relation.relationId){
    onChanged?.({action:confirmed?action:'refresh',target,relation:result});setNotice('Relation actualisée.');if(menu.current)menu.current.open=false
   }
  }
 }
 const available=relation?.state!=='self'&&relation?.state!=='unavailable'&&relation?.state!=='blocked'
 return <div className="relative shrink-0 text-sm">
  <details ref={menu} onKeyDown={event=>{if(event.key==='Escape'&&menu.current){menu.current.open=false;menu.current.querySelector('summary')?.focus()}}} onToggle={event=>{if(event.currentTarget.open&&!relation&&!error)void load()}}>
   <summary aria-label={'Actions pour @'+username} className={socialButton+' list-none cursor-pointer px-4'}>···</summary>
   <div className="absolute right-0 z-30 mt-2 w-64 max-w-[calc(100vw-3rem)] rounded-xl border border-zinc-700 bg-zinc-950 p-2 shadow-xl">
    {busy&&<p role="status" className="p-2 text-zinc-400">Traitement…</p>}
    {!relation&&!busy&&<button className={socialButton+' w-full'} onClick={()=>void load()}>Réessayer</button>}
    {uncertain&&<button className={socialButton+' w-full'} onClick={()=>void load()}>Actualiser la relation</button>}
    {available&&relation&&<>
     {relation.state==='none'&&<button disabled={busy||uncertain} className={socialButton+' w-full'} onClick={()=>void mutate('request')}>Ajouter en ami</button>}
     {relation.state==='outgoing'&&<button disabled={busy||uncertain} className={socialButton+' w-full'} onClick={()=>void mutate('cancel')}>Annuler la demande</button>}
     {relation.state==='incoming'&&<div className="grid gap-1"><button disabled={busy||uncertain} className={socialButton} onClick={()=>void mutate('accept')}>Accepter la demande</button><button disabled={busy||uncertain} className={socialButton} onClick={()=>void mutate('reject')}>Refuser la demande</button></div>}
     {relation.state==='friends'&&<button disabled={busy||uncertain} className={socialButton+' w-full'} onClick={()=>setConfirmation('remove')}>Supprimer des amis</button>}
     <button disabled={busy||uncertain} className={socialButton+' mt-2 w-full text-red-300'} onClick={()=>setConfirmation('block')}>Bloquer le joueur</button>
    </>}
    {relation&&!available&&<p className="p-2 text-zinc-400">Ce profil n’est plus accessible.</p>}
   </div>
  </details>
  {error&&<p role="alert" className="mt-2 max-w-64 text-xs text-red-300">{error}</p>}
  {notice&&<p role="status" className="sr-only">{notice}</p>}
  {confirmation&&<SocialConfirmation title={confirmation==='block'?'Bloquer @'+username+' ?':'Supprimer @'+username+' des amis ?'} description={confirmation==='block'?'Les demandes et l’amitié seront supprimées. Vos profils seront masqués l’un pour l’autre lorsque vous êtes connectés.':'Vous ne serez plus amis. Une nouvelle demande sera nécessaire pour rétablir la relation.'} busy={busy} onCancel={()=>setConfirmation(null)} onConfirm={()=>void mutate(confirmation)}/>}
 </div>
}
