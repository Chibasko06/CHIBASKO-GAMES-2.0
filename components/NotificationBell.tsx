'use client'
import {useState} from 'react'
import SocialDialog from '@/components/SocialDialog'
import NotificationFeed from '@/components/NotificationFeed'
export default function NotificationBell({token,actorId,count,onCount}:{token:string;actorId:string;count:number|null;onCount:(count:number,observedAt:number)=>void}){
 const [open,setOpen]=useState(false)
 return <>
  <button type="button" aria-label={'Notifications'+(count===null?' — compteur indisponible':count>0?`, ${count>9?'plus de 9':count} non lues`:', aucune non lue')} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)} className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-cyan-200 hover:border-cyan-500 focus-visible:outline-2 focus-visible:outline-cyan-300">
   <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>
   {count!==null&&count>0&&<span aria-hidden="true" className="absolute -right-1 -top-1 min-w-5 rounded-full bg-cyan-300 px-1 text-xs font-bold leading-5 text-black">{count>9?'9+':count}</span>}
  </button>
  {open&&<SocialDialog title="Notifications" onClose={()=>setOpen(false)}><NotificationFeed token={token} actorId={actorId} onCount={onCount}/></SocialDialog>}
 </>
}
