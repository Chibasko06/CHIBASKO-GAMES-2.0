'use client'
import {useState} from 'react'
import NotificationFeed from '@/components/NotificationFeed'
import {socialButton} from '@/lib/social'
export default function SharedGames({token,actorId}:{token:string;actorId:string}){
 const [open,setOpen]=useState(false)
 return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Jeux partagés</h2><button type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)} className={socialButton}>{open?'Masquer':'Voir les recommandations'}</button></div>{open?<NotificationFeed token={token} actorId={actorId} kind="shares"/>:<p className="text-sm text-zinc-400">Retrouve les jeux recommandés par tes amis.</p>}</section>
}
