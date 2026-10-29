'use client'
import {useEffect,useId,useRef} from 'react'
import {socialButton} from '@/lib/social'

export default function SocialConfirmation({title,description,busy,onCancel,onConfirm}:{title:string;description:string;busy:boolean;onCancel:()=>void;onConfirm:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),cancel=useRef<HTMLButtonElement>(null),id=useId()
 useEffect(()=>{const node=dialog.current;node?.showModal();cancel.current?.focus();return()=>node?.close()},[])
 return <dialog ref={dialog} aria-labelledby={id} aria-describedby={id+'-description'} onCancel={event=>{event.preventDefault();if(!busy)onCancel()}}
  className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-zinc-700 bg-zinc-950 p-6 text-white shadow-2xl backdrop:bg-black/75">
  <h2 id={id} className="text-lg font-bold">{title}</h2><p id={id+'-description'} className="mt-3 text-sm leading-6 text-zinc-300">{description}</p>
  <div className="mt-6 flex flex-wrap justify-end gap-2"><button ref={cancel} type="button" disabled={busy} className={socialButton} onClick={onCancel}>Annuler</button>
   <button type="button" disabled={busy} className={socialButton+' border-cyan-700 text-cyan-200'} onClick={onConfirm}>{busy?'Traitement…':'Confirmer'}</button></div>
 </dialog>
}
