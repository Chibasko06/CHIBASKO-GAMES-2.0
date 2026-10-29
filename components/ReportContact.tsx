'use client'
import {useState} from 'react'
import ReportForm from '@/components/ReportForm'
import type {ReportKind} from '@/lib/moderation'
export default function ReportContact({kind,target,siteKey}:{kind:ReportKind;target:string;siteKey?:string}){
 const [type,setType]=useState(kind)
 return <section className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-8"><h1 className="text-2xl font-bold">Transmettre un signalement</h1><label className="block text-sm">Type de cible<select value={type} onChange={event=>setType(event.target.value as ReportKind)} className="ml-3 min-h-11 rounded border border-zinc-700 bg-black px-3"><option value="player">Joueur</option><option value="game">Jeu</option></select></label><ReportForm key={type} kind={type} target={target} editable siteKey={siteKey}/><a href="/contact" className="inline-block py-3 text-sm text-cyan-200">Autre demande de contact</a></section>
}
