'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {developerJson} from '@/lib/game-distribution/browser-upload'
import type {DeveloperContact} from '@/lib/game-distribution/developer-profile'
import type {DeveloperEmailStatus} from '@/lib/server/developerEmail'

export default function DeveloperContactSummary({token,onReady}:{token:string;onReady:(ready:boolean)=>void}){
 const [profile,setProfile]=useState<DeveloperContact|null>(null),[verified,setVerified]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(false)
 useEffect(()=>{const controller=new AbortController();let current=0
  async function refresh(){const request=++current;try{const [contact,email]=await Promise.all([developerJson('/api/developer/profile',token,{signal:controller.signal}),developerJson('/api/developer/profile/email',token,{signal:controller.signal})]);if(controller.signal.aborted||request!==current)return;const status=email.data as DeveloperEmailStatus;setProfile(contact.data);setVerified(status.verified);setError(false);onReady(!!contact.data&&status.verified)}catch{if(!controller.signal.aborted&&request===current){setError(true);onReady(false)}}finally{if(!controller.signal.aborted&&request===current)setLoading(false)}}
  void refresh();const update=()=>{void refresh()};window.addEventListener('focus',update);window.addEventListener('chibasko:developer-email',update);return()=>{controller.abort();window.removeEventListener('focus',update);window.removeEventListener('chibasko:developer-email',update)}
 },[token,onReady])
 return <section aria-labelledby="developer-summary-heading" className="space-y-3 rounded-xl border border-cyan-900 bg-zinc-950 p-5"><h2 id="developer-summary-heading" className="font-semibold">Profil développeur</h2>
  {loading?<p role="status">Chargement de votre fiche…</p>:error?<p role="alert">Impossible de vérifier votre fiche. Rechargez la page avant de soumettre.</p>:profile?<><p className="break-words text-sm text-zinc-200">{profile.publicName} · {profile.contactEmail}</p><p role="status" className={'text-sm '+(verified?'text-emerald-300':'text-amber-200')}>{verified?'Adresse professionnelle vérifiée.':'Vérifiez votre adresse professionnelle avant un dépôt ou une correction. Votre historique reste accessible.'}</p></>:<p>Créez votre fiche développeur et vérifiez votre adresse professionnelle avant votre première soumission.</p>}
  <div id="developer-contact-errors"/>
  <Link className="inline-flex min-h-11 items-center text-sm text-cyan-300 underline" href="/developer/profile">{!loading&&!error&&!profile?'Créer mon profil développeur':!loading&&!error&&!verified?'Vérifier mon adresse professionnelle':'Consulter mon profil développeur'}</Link>
 </section>
}
