'use client'
import {useEffect,useState} from 'react'
import {developerJson} from '@/lib/game-distribution/browser-upload'
import type {DeveloperContact} from '@/lib/game-distribution/developer-profile'
import {FormFeedback,HelpText} from './ui/FormFeedback'
const empty:DeveloperContact={firstName:'',lastName:'',contactEmail:'',publicName:'',website:null,otherContact:null}
export default function DeveloperContactForm({token,onReady}:{token:string;onReady:(ready:boolean)=>void}){
 const [profile,setProfile]=useState(empty),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState('')
 useEffect(()=>{const abort=new AbortController();developerJson('/api/developer/profile',token,{signal:abort.signal}).then(({data})=>{if(!abort.signal.aborted){if(data)setProfile(data);setSaved(!!data);onReady(!!data);setLoading(false)}}).catch(()=>{if(!abort.signal.aborted){setError('Impossible de charger la fiche développeur.');setLoading(false);onReady(false)}});return()=>abort.abort()},[token,onReady])
 async function save(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{const {data}=await developerJson('/api/developer/profile',token,{method:'PUT',body:JSON.stringify(profile)});setProfile(data);setSaved(true);onReady(true)}catch{setError('Impossible d’enregistrer la fiche. Vérifiez les coordonnées puis réessayez.')}finally{setBusy(false)}}
 const field='mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-zinc-100 focus:border-cyan-400'
 return <section className="space-y-4 rounded-xl border border-cyan-900 bg-zinc-950 p-5" aria-labelledby="developer-contact-heading"><h2 id="developer-contact-heading" className="text-xl font-semibold">Votre fiche développeur</h2>
 <HelpText>Prénom, nom et e-mail de contact restent privés et réservés à la revue admin. Le nom public / studio est destiné à votre présentation professionnelle. Cette fiche est indépendante des brouillons.</HelpText>
 <div id="developer-contact-errors"/>
 {loading?<p role="status">Chargement de la fiche…</p>:<form onSubmit={save} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2">
 {([{key:'firstName',label:'Prénom',max:100},{key:'lastName',label:'Nom',max:100},{key:'contactEmail',label:'E-mail de contact',max:254,type:'email'},{key:'publicName',label:'Nom public / studio',max:160},{key:'website',label:'Portfolio professionnel (HTTPS, facultatif)',max:2048,type:'url'},{key:'otherContact',label:'Autre contact (facultatif)',max:500}] as const).map(f=><label key={f.key} className="text-sm font-medium">{f.label}<input className={field} type={'type'in f?f.type:'text'} maxLength={f.max} required={!['website','otherContact'].includes(f.key)} value={profile[f.key]??''} onChange={e=>{setSaved(false);setProfile(p=>({...p,[f.key]:e.target.value||(['website','otherContact'].includes(f.key)?null:'')}))}}/></label>)}
 </div><button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-cyan-300 px-4 py-2 font-semibold text-zinc-950 disabled:opacity-50">{busy?'Enregistrement…':'Enregistrer la fiche développeur'}</button>
 {saved&&<p role="status" className="text-sm text-emerald-300">Fiche développeur enregistrée.</p>}</form>}
 {error&&<FormFeedback tone="error" title={error} announce/>}
 </section>
}
