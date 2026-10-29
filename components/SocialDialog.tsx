'use client'
import {useEffect,useId,useRef} from 'react'
import {createPortal} from 'react-dom'
export default function SocialDialog({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null),titleId=useId()
 useEffect(()=>{const element=dialog.current,previous=document.activeElement;element?.showModal();return()=>{element?.close();if(previous instanceof HTMLElement)previous.focus()}},[])
 return typeof document==='undefined'?null:createPortal(<dialog ref={dialog} aria-labelledby={titleId} onCancel={event=>{event.preventDefault();onClose()}} className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 text-zinc-100 backdrop:bg-black/75">
  <div className="mb-4 flex items-center justify-between gap-3"><h2 id={titleId} className="text-lg font-bold">{title}</h2><button autoFocus type="button" onClick={onClose} className="min-h-11 rounded-lg px-3 text-sm text-zinc-300 focus-visible:outline-2 focus-visible:outline-cyan-300">Fermer</button></div>{children}
 </dialog>,document.body)
}
