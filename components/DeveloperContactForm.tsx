'use client'
import {useEffect,useRef,useState} from 'react'
import {developerJson} from '@/lib/game-distribution/browser-upload'
import type {DeveloperContact} from '@/lib/game-distribution/developer-profile'
import {FormFeedback,HelpText} from './ui/FormFeedback'
import DeveloperEmailVerification from './DeveloperEmailVerification'
const empty:DeveloperContact={firstName:'',lastName:'',contactEmail:'',publicName:'',website:null,otherContact:null}
const fields=[{key:'firstName',label:'Prénom',max:100},{key:'lastName',label:'Nom',max:100},{key:'contactEmail',label:'E-mail de contact',max:254,type:'email'},{key:'publicName',label:'Nom public / studio',max:160},{key:'website',label:'Portfolio professionnel (HTTPS, facultatif)',max:2048,type:'url'},{key:'otherContact',label:'Autre contact (facultatif)',max:500}] as const
const normalize=(email:string)=>email.trim().toLowerCase()
export default function DeveloperContactForm({token,onReady}:{token:string;onReady:(ready:boolean)=>void}){
 const [profile,setProfile]=useState<DeveloperContact|null>(null),[draft,setDraft]=useState(empty),[loading,setLoading]=useState(true),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[verified,setVerified]=useState(false),[reload,setReload]=useState(0)
 const editButton=useRef<HTMLButtonElement>(null),firstField=useRef<HTMLInputElement>(null),lock=useRef(false)
 useEffect(()=>{onReady(!!profile&&verified)},[profile,verified,onReady])
 useEffect(()=>{const abort=new AbortController();developerJson('/api/developer/profile',token,{signal:abort.signal}).then(({data})=>{if(!abort.signal.aborted){setProfile(data);setDraft(data??empty);setEditing(!data);setLoading(false)}}).catch(()=>{if(!abort.signal.aborted){setError('Impossible de charger la fiche développeur.');setLoading(false);onReady(false)}});return()=>abort.abort()},[token,onReady,reload])
 useEffect(()=>{if(editing)firstField.current?.focus()},[editing])
 const emailChanged=!!profile&&normalize(profile.contactEmail)!==normalize(draft.contactEmail)
 function cancel(){setDraft(profile??empty);setEditing(false);setError('');setNotice('');requestAnimationFrame(()=>editButton.current?.focus())}
 async function save(event:React.FormEvent){
  event.preventDefault();if(lock.current)return
  if(emailChanged&&!window.confirm('Cette nouvelle adresse devra être vérifiée avec un nouveau code. Les dépôts et corrections seront indisponibles jusqu’à sa confirmation. Enregistrer ce changement ?'))return
  lock.current=true;setBusy(true);setError('');setNotice('')
  try{const {data}=await developerJson('/api/developer/profile',token,{method:'PUT',body:JSON.stringify(draft)});if(!profile||normalize(profile.contactEmail)!==normalize(data.contactEmail))setVerified(false);setProfile(data);setDraft(data);setEditing(false);setNotice('Fiche développeur enregistrée.');window.dispatchEvent(new Event('chibasko:developer-email'));requestAnimationFrame(()=>editButton.current?.focus())}
  catch{setError('Impossible d’enregistrer la fiche. Vérifiez les coordonnées ; si un envoi est en cours, attendez sa fin avant de modifier l’adresse.')}
  finally{lock.current=false;setBusy(false)}
 }
 const field='mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-zinc-100 focus:border-cyan-400'
 return <section className="space-y-4 rounded-xl border border-cyan-900 bg-zinc-950 p-5" aria-labelledby="developer-contact-heading">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="developer-contact-heading" className="text-xl font-semibold">Votre fiche développeur</h2>{!loading&&profile&&!editing&&<button ref={editButton} type="button" className="min-h-11 rounded-lg border border-zinc-700 px-3 text-sm text-cyan-200" onClick={()=>{setDraft(profile);setNotice('');setEditing(true)}}>Modifier</button>}</div>
  <HelpText>Prénom, nom et adresse professionnelle restent privés. Le nom public / studio apparaît dans votre présentation. Cette fiche est distincte de votre compte de connexion.</HelpText>
  {loading?<p role="status">Chargement de la fiche…</p>:editing?<form onSubmit={save} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2">{fields.map((f,i)=><label key={f.key} className="min-w-0 text-sm font-medium">{f.label}<input ref={i===0?firstField:undefined} className={field} type={'type'in f?f.type:'text'} maxLength={f.max} required={!['website','otherContact'].includes(f.key)} disabled={busy} value={draft[f.key]??''} onChange={e=>setDraft(p=>({...p,[f.key]:e.target.value||(['website','otherContact'].includes(f.key)?null:'')}))}/></label>)}</div>
   {emailChanged&&<FormFeedback tone="warning" title="Nouvelle vérification nécessaire"><p>Enregistrer cette adresse annule sa vérification actuelle. Un nouveau code sera nécessaire avant tout dépôt ou correction de build. Les autres modifications conservent la vérification.</p></FormFeedback>}
   <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-cyan-300 px-4 py-2 font-semibold text-zinc-950 disabled:opacity-50">{busy?'Enregistrement…':'Enregistrer'}</button><button type="button" disabled={busy} className="min-h-11 rounded-lg border border-zinc-700 px-4 py-2" onClick={cancel}>Annuler</button></div>
  </form>:profile?<dl className="grid gap-4 sm:grid-cols-2">{fields.map(f=><div key={f.key} className="min-w-0"><dt className="text-sm text-zinc-400">{f.label}</dt><dd className="mt-1 break-words text-zinc-100">{profile[f.key]||'Non renseigné'}</dd></div>)}</dl>:!error?<><p>Créez votre fiche, puis vérifiez votre adresse professionnelle avant votre première soumission.</p><button type="button" className="min-h-11 text-cyan-200 underline" onClick={()=>setEditing(true)}>Créer ma fiche développeur</button></>:null}
  {error&&<FormFeedback tone="error" title={error} announce/>}{!profile&&!editing&&error&&<button type="button" className="min-h-11 text-cyan-200 underline" onClick={()=>{setError('');setLoading(true);setReload(n=>n+1)}}>Réessayer le chargement</button>}
  {notice&&<p role="status" className="text-sm text-emerald-300">{notice}</p>}
  {!loading&&profile&&!editing&&<DeveloperEmailVerification key={token+':'+normalize(profile.contactEmail)} token={token} canVerify onVerified={setVerified}/>}
 </section>
}
