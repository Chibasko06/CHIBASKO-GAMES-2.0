'use client'
import {useEffect,useId,useRef,useState} from 'react'
import Image from 'next/image'
import {useRouter} from 'next/navigation'
import {publicProfilePath} from '@/lib/publicUsername'

type Suggestion={username:string;avatar_url:string|null}
export default function PlayerSearch({initialSearch}:{initialSearch:string}){
 const [value,setValue]=useState(initialSearch),[items,setItems]=useState<Suggestion[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[active,setActive]=useState(-1)
 const id=useId(),epoch=useRef(0),interacted=useRef(false),router=useRouter()
 useEffect(()=>{
  const version=++epoch.current,controller=new AbortController()
  let cancelled=false
  if(!interacted.current)return
  const search=value.trim().replace(/^@/,'').toLowerCase()
  if(!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(search))return()=>controller.abort()
  const timer=setTimeout(async()=>{
   setBusy(true);setError('')
   const timeout=setTimeout(()=>controller.abort(),15000)
   try{
    const response=await fetch('/api/players/suggestions?'+new URLSearchParams({search}),{signal:controller.signal,cache:'no-store'})
    if(!response.ok)throw Error('search_unavailable')
    const data=await response.json()
    if(!Array.isArray(data.items)||data.items.length>5||data.items.some((item:Suggestion)=>!item||typeof item.username!=='string'||(item.avatar_url!==null&&typeof item.avatar_url!=='string')))throw Error('search_invalid')
    if(!cancelled&&version===epoch.current){setItems(data.items);setOpen(true);setActive(-1)}
   }catch{if(!cancelled&&version===epoch.current){setError('Suggestions indisponibles. Tu peux lancer la recherche complète.');setOpen(true)}}
   finally{clearTimeout(timeout);if(!cancelled&&version===epoch.current)setBusy(false)}
  },250)
  return()=>{cancelled=true;clearTimeout(timer);controller.abort()}
 },[value])
 function dismiss(){++epoch.current;setOpen(false);setActive(-1);setBusy(false)}
 return <form action="/players" onSubmit={dismiss} className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:flex-row sm:items-start">
  <div className="relative min-w-0 flex-1" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))dismiss()}}>
   <label htmlFor={id} className="text-sm text-zinc-300">Rechercher par @pseudo</label>
   <input id={id} role="combobox" type="search" name="search" value={value} minLength={3} maxLength={33} autoComplete="off" placeholder="@pseudo" aria-describedby="community-search-help" aria-autocomplete="list" aria-expanded={open} aria-controls={id+'-list'} aria-activedescendant={open&&active>=0?id+'-'+active:undefined}
    onChange={event=>{interacted.current=true;++epoch.current;setValue(event.target.value);setItems([]);setActive(-1);setOpen(false);setBusy(false);setError('')}}
    onKeyDown={event=>{
     if(event.key==='Escape'){event.preventDefault();dismiss()}
     if((event.key==='ArrowDown'||event.key==='ArrowUp')&&items.length){event.preventDefault();setOpen(true);setActive(previous=>event.key==='ArrowDown'?(previous+1)%items.length:(previous<=0?items.length-1:previous-1))}
     if(event.key==='Enter'&&open&&active>=0&&items[active]){event.preventDefault();dismiss();router.push(publicProfilePath(items[active].username))}
    }} className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 text-white focus-visible:outline-2 focus-visible:outline-cyan-300"/>
   {busy&&<p role="status" className="mt-1 text-xs text-zinc-400">Recherche…</p>}
   {open&&<div className="absolute z-30 mt-1 w-full rounded-xl border border-cyan-900 bg-zinc-950 p-2 shadow-xl">
    <ul id={id+'-list'} role="listbox" aria-label="Suggestions de joueurs">{items.map((item,index)=><li key={item.username} id={id+'-'+index} role="option" aria-selected={active===index} onPointerDown={event=>event.preventDefault()} onClick={()=>{dismiss();router.push(publicProfilePath(item.username))}} className={'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg p-2 '+(active===index?'bg-cyan-950 text-cyan-200':'hover:bg-zinc-800')}>
     {item.avatar_url?<Image src={item.avatar_url} width={32} height={32} unoptimized alt="" className="h-8 w-8 rounded-full object-cover"/>:<span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-950">{item.username[0]?.toUpperCase()}</span>}<span className="truncate">@{item.username}</span>
    </li>)}</ul>
    {!items.length&&<p role="status" className="p-2 text-xs text-zinc-400">{error||'Aucun joueur accessible avec ce pseudo.'}</p>}
   </div>}
  </div>
  <button type="submit" className="min-h-11 rounded-lg bg-cyan-400 px-5 font-semibold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 sm:mt-7">Rechercher</button>
 </form>
}
