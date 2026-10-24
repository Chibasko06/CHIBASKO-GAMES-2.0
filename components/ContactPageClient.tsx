'use client'
import {useEffect,useRef,useState,type FormEvent} from 'react'
import FormField from './ui/FormField'
import {FormFeedback} from './ui/FormFeedback'
import {CONTACT_LIMITS,contactErrors,type ContactAttempt,type ContactFields,type ContactMessage} from '@/lib/contact'
import {withTimeout} from '@/lib/asyncOperation'
const empty:ContactMessage={firstName:'',lastName:'',email:'',message:''}
const labels:Record<ContactFields,string>={lastName:'Nom',firstName:'Prénom',email:'Adresse e-mail',message:'Ton message'}
const storageKey='chibasko-contact-attempt'
export default function ContactPageClient(){
 const [form,setForm]=useState(empty),[errors,setErrors]=useState<Partial<Record<ContactFields,string>>>({})
 const [phase,setPhase]=useState<'idle'|'sending'|'accepted'|'unconfirmed'|'error'>('idle')
 const [feedback,setFeedback]=useState(''),[website,setWebsite]=useState('')
 const attempt=useRef<ContactAttempt|null>(null),active=useRef(false),busy=useRef(false),controller=useRef<AbortController|null>(null)
 const element=useRef<HTMLFormElement>(null)
 useEffect(()=>{active.current=true;try{const saved=JSON.parse(sessionStorage.getItem(storageKey)??'null');if(saved&&typeof saved.id==='string'&&typeof saved.createdAt==='number')attempt.current=saved}catch{}return()=>{active.current=false;controller.current?.abort()}},[])
 async function submit(event:FormEvent){
  event.preventDefault();if(busy.current)return
  const invalid=contactErrors(form);setErrors(invalid)
  if(Object.keys(invalid).length){setPhase('error');setFeedback('Vérifie les champs indiqués.');element.current?.querySelector<HTMLElement>(`[name="${Object.keys(invalid)[0]}"]`)?.focus();return}
  if(!attempt.current)attempt.current={id:crypto.randomUUID(),createdAt:Date.now()}
  try{sessionStorage.setItem(storageKey,JSON.stringify(attempt.current))}catch{}
  busy.current=true;setPhase('sending');setFeedback('');controller.current=new AbortController()
  const timer=setTimeout(()=>controller.current?.abort(),20_000)
  try{
   const {response,payload}=await withTimeout((async()=>{const response=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,website,attempt:attempt.current}),signal:controller.current!.signal});return {response,payload:await response.json()}})(),25_000)
   if(!active.current)return
   if(response.ok&&payload.status==='accepted'){
    setPhase('accepted');setFeedback('Ton message a été pris en charge par le service d’envoi.');setForm(empty);attempt.current=null
    try{sessionStorage.removeItem(storageKey)}catch{}
   }else if(response.status===202){setPhase('unconfirmed');setFeedback('L’envoi n’est pas encore confirmé. Attends 30 secondes puis vérifie avec le même message. Ne crée pas un second envoi.')}
   else if(response.status===400&&payload.error?.fields){setErrors(payload.error.fields);setPhase('error');setFeedback('Vérifie les champs indiqués.')}
   else if(response.status===429){setPhase('error');setFeedback('Trop de demandes. Réessaie dans une heure.')}
   else if(response.status===409){setPhase('unconfirmed');setFeedback('Cette demande ne peut plus être vérifiée avec ces informations. Utilise l’adresse de contact directe si nécessaire.')}
   else {setPhase('unconfirmed');setFeedback('Le service est indisponible ou l’envoi n’a pas pu être confirmé. Réessaie avec le même message.')}
  }catch{if(active.current){setPhase('unconfirmed');setFeedback('La connexion a été interrompue. L’envoi n’est pas confirmé ; vérifie avec le même message.')}}
  finally{clearTimeout(timer);busy.current=false;if(active.current)setPhase(current=>current==='sending'?'unconfirmed':current)}
 }
 return <div className="mx-auto max-w-4xl rounded-[28px] border border-cyan-950/80 bg-zinc-950 p-8 md:p-10">
  <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-300/80">Contact</p><h1 className="mt-3 text-4xl font-black uppercase text-white">Nous contacter</h1>
  <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-400">Une question, un bug, une idée de partenariat ou un retour sur un jeu ? Ton message est transmis à l’équipe Chibasko Games par Resend. Le contenu n’est pas enregistré dans la base du site. <a className="text-cyan-300 underline" href="/confidentialite">Confidentialité</a></p>
  <form ref={element} onSubmit={submit} noValidate aria-busy={phase==='sending'} className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
   {(['lastName','firstName','email','message'] as ContactFields[]).map(name=><FormField key={name} label={labels[name]} error={errors[name]} className={name==='email'||name==='message'?'md:col-span-2':''}>
    {name==='message'?<textarea name={name} value={form[name]} required maxLength={CONTACT_LIMITS[name]} readOnly={phase==='sending'||phase==='unconfirmed'} onChange={event=>{setForm(current=>({...current,[name]:event.target.value}));setErrors(current=>({...current,[name]:undefined}))}} className="min-h-48 rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white"/>:
    <input name={name} type={name==='email'?'email':'text'} autoComplete={name==='email'?'email':name==='firstName'?'given-name':'family-name'} required maxLength={CONTACT_LIMITS[name]} value={form[name]} readOnly={phase==='sending'||phase==='unconfirmed'} onChange={event=>{setForm(current=>({...current,[name]:event.target.value}));setErrors(current=>({...current,[name]:undefined}))}} className="rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white"/>}
   </FormField>)}
   <div hidden aria-hidden="true"><label>Site web<input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={event=>setWebsite(event.target.value)}/></label></div>
   {feedback?<div className="md:col-span-2"><FormFeedback tone={phase==='accepted'?'success':phase==='unconfirmed'?'warning':'error'} title={phase==='accepted'?'Message pris en charge':phase==='unconfirmed'?'Envoi non confirmé':'Envoi impossible'} announce>{feedback}</FormFeedback></div>:null}
   <button type="submit" disabled={phase==='sending'} className="rounded-full bg-cyan-400 px-6 py-4 font-black uppercase tracking-[0.2em] text-black disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2">{phase==='sending'?'Envoi en cours…':phase==='unconfirmed'?'Vérifier l’envoi':'Envoyer le message'}</button>
  </form><p className="mt-6 text-sm text-zinc-400">Adresse directe : <a className="text-cyan-300 underline" href="mailto:chibasko06@gmail.com">chibasko06@gmail.com</a></p>
 </div>
}
