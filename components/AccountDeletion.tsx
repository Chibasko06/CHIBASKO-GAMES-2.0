'use client'

import {useEffect,useId,useRef,useState} from 'react'
import {withTimeout} from '@/lib/asyncOperation'

type Props={accessToken:string;onAccountRemoved:()=>Promise<unknown>}
const messages:Record<string,string>={
 review_required:'Demande enregistrée. Une vérification administrative est nécessaire avant de poursuivre, notamment pour les jeux publiés ou les brouillons partagés.',
 pending:'Demande enregistrée. La préparation sera reprise automatiquement.',
 prepared:'La suppression est en cours. Le service reprendra les étapes restantes automatiquement.',
 cleanup_pending:'Le compte a été supprimé. Le nettoyage des fichiers inutiles se poursuit automatiquement.',
 completed:'Le compte et les fichiers inutiles ont été supprimés.',
}

export default function AccountDeletion({accessToken,onAccountRemoved}:Props){
 const field=useId(),active=useRef(false),locked=useRef(false)
 const [confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false)
 const [attempted,setAttempted]=useState(false),[state,setState]=useState(''),[error,setError]=useState(''),[reference,setReference]=useState('')
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 const removed=state==='completed'||state==='cleanup_pending'
 async function submit(){
  if(locked.current||removed||confirmation!=='SUPPRIMER')return
  locked.current=true;setBusy(true);setError('');setAttempted(true)
  try{
   // Une reprise utilise la même demande idempotente, sans créer de nouvelle cible.
   const response=await withTimeout(fetch('/api/account',{method:'DELETE',headers:{Authorization:'Bearer '+accessToken},signal:AbortSignal.timeout(30_000)}),30_000)
   const body=await withTimeout(response.json(),5000)
   if(!active.current)return
   if(!response.ok){
    if(response.status===503)setError('La suppression est temporairement indisponible ou son résultat doit encore être vérifié. Réessayez plus tard.')
    else if(response.status===409)setError('La suppression nécessite une intervention administrative. Contactez Chibasko Games.')
    else setError('Impossible de vérifier la demande. Reconnectez-vous si nécessaire ou contactez Chibasko Games.')
    return
   }
   const next=body?.deletion?.state
   if(typeof next!=='string'||!Object.hasOwn(messages,next))throw Error('invalid_deletion_response')
   if(typeof body.deletion.id==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(body.deletion.id))setReference(body.deletion.id)
   setState(next)
   if(next==='cleanup_pending'||next==='completed'){
    // Une déconnexion locale ne remet pas en cause une suppression Auth confirmée.
    try{await withTimeout(onAccountRemoved(),5000)}catch{}
   }
  }catch{if(active.current)setError('Le résultat de la demande est incertain. Vérifiez son état avant toute autre action ; une expiration du délai ne signifie pas que la suppression a échoué.')}
  finally{locked.current=false;if(active.current)setBusy(false)}
 }
 return <section className="mt-8 space-y-4 rounded-2xl border border-red-900/60 bg-zinc-950 p-5" aria-labelledby={field+'-title'}>
  <h2 id={field+'-title'} className="text-xl font-bold">Supprimer mon compte</h2>
  <p className="text-sm text-zinc-300">Cette opération est irréversible après son traitement. Votre profil, vos données personnelles concernées et vos brouillons non publiés seront supprimés. Les jeux déjà publiés nécessitent une vérification administrative de leur conservation et de leur gestion par Chibasko Games ; aucun droit de propriété intellectuelle n’est transféré.</p>
  {!removed&&<><label htmlFor={field} className="block text-sm">Saisissez SUPPRIMER pour confirmer</label>
   <input id={field} value={confirmation} onChange={event=>setConfirmation(event.target.value)} autoComplete="off" disabled={busy} className="w-full rounded border border-zinc-600 bg-black p-3"/>
   <button type="button" disabled={busy||confirmation!=='SUPPRIMER'} onClick={()=>void submit()} className="rounded border border-red-700 px-4 py-3 text-red-200 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-40">{busy?'Vérification en cours…':attempted?'Vérifier ou reprendre la demande':'Demander la suppression du compte'}</button></>}
  {state&&<p role="status" className="text-sm text-zinc-200">{messages[state]}</p>}
  {reference&&<p className="break-all text-xs text-zinc-400">Référence de suivi : {reference}</p>}
  {error&&<p role="alert" className="text-sm text-red-200">{error}</p>}
 </section>
}
