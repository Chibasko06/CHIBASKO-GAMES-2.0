'use client'
import {useSyncExternalStore} from 'react'
const key='cg-advice-until',event='chibasko:advice-dismissed'
let dismissedUntil=0
const visible=()=>{
 if(dismissedUntil>Date.now())return false
 try{return !document.cookie.split(';').some(part=>{const [name,value]=part.trim().split('=');return name===key&&Number.isFinite(Number(value))&&Number(value)>Date.now()})}catch{return true}
}
const initial=()=>true
const subscribe=(callback:()=>void)=>{
 window.addEventListener(event,callback);window.addEventListener('pageshow',callback);window.addEventListener('focus',callback)
 return()=>{window.removeEventListener(event,callback);window.removeEventListener('pageshow',callback);window.removeEventListener('focus',callback)}
}
export default function AdComfortMessage(){
 const show=useSyncExternalStore(subscribe,visible,initial)
 if(!show)return null
 function close(){dismissedUntil=Date.now()+30*86400000;try{document.cookie=key+'='+dismissedUntil+'; Path=/; Max-Age=2592000; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'')}catch{}window.dispatchEvent(new Event(event))}
 const link='font-medium text-cyan-300 underline underline-offset-4 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-cyan-300'
 return <aside aria-label="Conseil pour le confort de jeu" className="my-4 flex min-w-0 items-start gap-3 rounded-xl border border-cyan-950 bg-zinc-900/70 px-4 py-3 text-sm leading-6 text-zinc-300">
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mt-1 h-5 w-5 shrink-0 text-cyan-400"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/><path d="m8 12 3 3 5-6"/></svg>
  <p className="min-w-0 flex-1">Les pubs vous empêchent de jouer ? Essayez le navigateur <a href="https://brave.com/fr/download/" target="_blank" rel="noopener noreferrer" className={link}>Brave</a> ou l’extension <a href="https://github.com/gorhill/uBlock#installation" target="_blank" rel="noopener noreferrer" className={link}>uBlock Origin</a> pour une expérience plus confortable.</p>
  <button type="button" onClick={close} aria-label="Masquer ce conseil pendant 30 jours" className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-300"><span aria-hidden="true" className="text-xl">×</span></button>
 </aside>
}
