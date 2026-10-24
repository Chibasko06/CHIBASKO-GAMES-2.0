'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {useAuth} from '@/components/AuthProvider'
type Job={id:string;state:string;reason:string|null;attentionRequired:boolean}
const labels:Record<string,string>={pending:'Préparation en attente',review_required:'Vérification nécessaire',prepared:'Suppression du compte en attente',cleanup_pending:'Nettoyage des fichiers en attente'}
export default function AccountDeletions(){
 const {session}=useAuth(),token=session?.access_token
 const [jobs,setJobs]=useState<Job[]>([]),[reference,setReference]=useState(''),[checked,setChecked]=useState(false)
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
 const [loaded,setLoaded]=useState(false)
 const lifetime=useRef<AbortController|null>(null),readVersion=useRef(0)
 const call=useCallback(async(path:string,init?:RequestInit)=>{
  const headers=new Headers(init?.headers);headers.set('Authorization','Bearer '+token)
  const response=await fetch('/api/admin/account-deletions'+path,{...init,headers,signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})
  const data=await response.json()
  if(!response.ok)throw Error('Le traitement est indisponible. Rechargez la liste avant de réessayer.')
  return data
 },[token])
 const load=useCallback(async(signal?:AbortSignal)=>{
  const active=signal??lifetime.current?.signal,version=++readVersion.current
  const data=await call('',{signal:active});if(!active?.aborted&&version===readVersion.current){setJobs(data.deletions);setLoaded(true)}
 },[call])
 useEffect(()=>{
  if(!token)return
  const controller=new AbortController()
  lifetime.current=controller
  void load(controller.signal).catch(()=>{if(!controller.signal.aborted)setError('Impossible de charger les demandes.')})
  return ()=>controller.abort()
 },[token,load])
 async function run(job:Job,cancel=false){
  const active=lifetime.current?.signal
  setBusy(true);setError('');setMessage('')
  try{
   const data=await call('/'+job.id,{method:'POST',signal:active,headers:{'Content-Type':'application/json'},body:JSON.stringify(cancel?{cancel:true}:job.state==='review_required'?{reviewReference:reference}:{retry:true})})
   if(active?.aborted)return
   setMessage(cancel?'La demande a été annulée.':data.success?'Le compte et ses fichiers inutiles ont été supprimés.':'La demande reste en cours ; aucune suppression complète n’est annoncée.')
   await load()
  }catch{if(!active?.aborted){setError('Le résultat doit être vérifié dans la liste avant toute nouvelle action.');await load().catch(()=>{})}}
  finally{if(!active?.aborted)setBusy(false)}
 }
 return <section className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
  <h1 className="text-2xl font-bold">Suppressions de comptes</h1>
  <p className="text-sm text-zinc-300">Les jeux déjà publiés gardent leur gestion administrative Chibasko Games. Cela ne transfère aucun droit de propriété intellectuelle.</p>
  <p className="text-sm text-amber-200">Avant de valider une demande concernant des jeux publiés, vérifiez les contrats applicables et les conditions de retrait. La référence ci-dessous consigne cette vérification ; elle ne crée aucune licence.</p>
  <label className="block text-sm">Référence interne du document ou de la décision<input className="mt-2 block w-full rounded border border-zinc-700 bg-black p-3" value={reference} onChange={e=>setReference(e.target.value)} maxLength={160} autoComplete="off"/></label>
  <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>J’ai vérifié les autorisations de distribution et le traitement de cette demande.</label>
  {error&&<p role="alert" className="rounded border border-red-800 bg-red-950/40 p-3 text-red-200">{error}</p>}
  {message&&<p role="status" className="rounded border border-cyan-800 p-3 text-cyan-200">{message}</p>}
  <button type="button" disabled={busy||!token} className="rounded border border-cyan-700 px-4 py-2 disabled:opacity-50" onClick={()=>{setError('');void load().catch(()=>{if(!lifetime.current?.signal.aborted)setError('Impossible de charger les demandes.')})}}>Actualiser la liste</button>
  {!loaded&&!error&&<p role="status" className="text-sm text-zinc-400">Chargement des demandes…</p>}
  {loaded&&!error&&!jobs.length&&<p className="text-sm text-zinc-400">Aucune demande en attente dans cette liste.</p>}
  <ul className="space-y-4">{jobs.map(job=><li key={job.id} className="space-y-2 rounded border border-zinc-800 p-4">
   <p className="font-semibold">{labels[job.state]??'Traitement en cours'}</p><p className="break-all text-xs text-zinc-500">Référence : {job.id}</p>
   {job.reason==='shared_draft'&&<p className="text-sm text-amber-200">Ce brouillon est partagé. La gestion des autres membres doit être résolue avant la suppression.</p>}
   {job.attentionRequired&&<p className="text-sm text-amber-200">La reprise automatique est suspendue après plusieurs échecs. Vérifiez la configuration avant de relancer.</p>}
   <button type="button" disabled={busy||job.reason==='shared_draft'||(job.state==='review_required'&&(!checked||!/^[A-Za-z0-9_./-]{1,160}$/.test(reference)))} className="rounded bg-cyan-400 px-4 py-2 font-semibold text-black disabled:opacity-40" onClick={()=>void run(job)}>{job.state==='review_required'?'Valider la vérification et poursuivre':'Reprendre le traitement'}</button>
   {['pending','review_required'].includes(job.state)&&<button type="button" disabled={busy} onClick={()=>void run(job,true)} className="ml-3 rounded border border-zinc-600 px-4 py-2">Annuler la demande</button>}
  </li>)}</ul>
 </section>
}
