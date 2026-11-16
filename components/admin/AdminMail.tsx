'use client'

import {useCallback,useEffect,useRef,useState} from 'react'
import {useAuth} from '@/components/AuthProvider'
import {useAdminAccess} from './useAdminAccess'
import AdminShell from './AdminShell'
import {adminMailSenders,mailStatusLabels,type MailEntry,type MailSender,type MailStatus} from '@/lib/adminMail'
import {fetchJson} from '@/lib/asyncOperation'
import {brandedEmail} from '@/lib/brandedEmail'

const field='mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-white'
const dateFormat=new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Paris'})
const emptyDraft={sender:'contact' as MailSender,recipient:'',subject:'',text:''}

export default function AdminMail(){
  const {session}=useAuth()
  const access=useAdminAccess()
  if(access.status==='checking')return <p role="status">Vérification des accès…</p>
  if(access.status!=='allowed'||!session)return <p role="alert">Accès administrateur requis. <button className="admin-action" onClick={access.retry}>Réessayer</button></p>
  return <AdminShell active="mail"><MailWorkspace key={session.user.id} token={session.access_token}/></AdminShell>
}

function MailWorkspace({token}:{token:string}){
  const [draft,setDraft]=useState(emptyDraft)
  const [preview,setPreview]=useState<string|null>(null)
  const [attempted,setAttempted]=useState(false)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const [index,setIndex]=useState(0)
  const [revision,setRevision]=useState(0)
  const [history,setHistory]=useState<{rows:MailEntry[];more:boolean}|null>(null)
  const [historyError,setHistoryError]=useState('')
  const sending=useRef(false)
  const historyRead=useCallback(async(page:number)=>{
    const {response,payload}=await fetchJson('/api/admin/mail?page='+page,{headers:{Authorization:'Bearer '+token}})
    if(!response.ok)throw Error()
    return payload as {rows:MailEntry[];more:boolean}
  },[token])
  useEffect(()=>{
    let current=true
    void historyRead(index).then(data=>{if(current){setHistory(data);setHistoryError('')}}).catch(()=>{if(current)setHistoryError('Impossible de charger l’historique.')})
    return ()=>{current=false}
  },[historyRead,index,revision])

  async function send(){
    if(!preview||sending.current)return
    sending.current=true
    setBusy(true)
    setAttempted(true)
    setError('')
    setNotice('')
    try {
      const {response,payload}=await fetchJson('/api/admin/mail',{method:'POST',
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({...draft,id:preview})})
      if(!response.ok){setError(payload.error??'Résultat indisponible. Vérifie l’historique.');return}
      const status=payload.status as MailStatus
      setNotice(mailStatusLabels[status]+'.')
      if(status==='accepted'){setDraft({...emptyDraft,sender:draft.sender});setPreview(null);setAttempted(false)}
      if(status==='rejected'){setPreview(null);setAttempted(false)}
    }catch{
      setError('Résultat indisponible. Vérifie l’historique.')
    }finally{
      sending.current=false
      setBusy(false)
      setIndex(0)
      setRevision(value=>value+1)
    }
  }
  const sender=adminMailSenders[draft.sender]
  return <>
    <form className="space-y-4 rounded-xl border border-zinc-800 p-4 sm:p-6" onSubmit={event=>{
      event.preventDefault()
      setDraft({...draft,recipient:draft.recipient.trim(),subject:draft.subject.trim()})
      setPreview(crypto.randomUUID())
      setError('')
      setNotice('')
    }}>
      {!preview?<><div className="grid gap-4 md:grid-cols-2">
        <label>Expéditeur<select className={field} value={draft.sender} onChange={event=>setDraft({...draft,sender:event.target.value as MailSender})}>
          <option value="contact">Contact général · {adminMailSenders.contact.address}</option>
          <option value="developers">Relations développeurs · {adminMailSenders.developers.address}</option>
        </select></label>
        <label>Destinataire<input className={field} type="email" required maxLength={254} value={draft.recipient} onChange={event=>setDraft({...draft,recipient:event.target.value})}/></label>
      </div>
      <label className="block">Objet<input className={field} required maxLength={150} value={draft.subject} onChange={event=>setDraft({...draft,subject:event.target.value})}/></label>
      <label className="block">Message<textarea className={field} rows={10} required maxLength={8000} value={draft.text} onChange={event=>setDraft({...draft,text:event.target.value})}/></label>
      <p className="text-sm text-zinc-400">Les paragraphes, retours à la ligne et listes saisies en texte sont conservés.</p>
      <button className="admin-action" disabled={!draft.subject.trim()||!draft.text.trim()}>Prévisualiser</button></>:
      <section aria-label="Aperçu du message" className="space-y-3 break-words">
        <h2 className="text-lg font-semibold">Aperçu du message</h2>
        <p>De {sender.label} ({sender.address})</p>
        <p>À {draft.recipient}</p>
        <p className="font-semibold">{draft.subject}</p>
        <iframe title="Rendu HTML de l’e-mail" sandbox="" referrerPolicy="no-referrer"
          className="h-[32rem] w-full rounded-lg border border-zinc-800 bg-white"
          srcDoc={brandedEmail({identity:draft.sender,subject:draft.subject,text:draft.text}).html}/>
        {attempted&&<p className="text-sm text-zinc-400">Vérifie le résultat avant de composer un autre message au même destinataire.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="admin-action" disabled={busy} onClick={()=>void send()}>{busy?'Traitement…':attempted?'Reprendre la même demande':'Confirmer et envoyer'}</button>
          <button type="button" className="admin-action" disabled={busy} onClick={()=>{
            if(attempted&&!window.confirm('Quitter cet aperçu ? Vérifie l’historique avant tout nouvel envoi.'))return
            if(attempted)setDraft({...emptyDraft,sender:draft.sender})
            setPreview(null);setAttempted(false);setError('');setNotice('')
          }}>{attempted?'Quitter l’aperçu':'Modifier le message'}</button>
        </div>
      </section>}
      {notice&&<p role="status">{notice}</p>}
      {error&&<p role="alert" className="text-red-300">{error}</p>}
    </form>
    <section className="space-y-3 rounded-xl border border-zinc-800 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Historique des envois</h2>
        <button className="admin-action" onClick={()=>setRevision(value=>value+1)}>Actualiser</button></div>
      <p className="text-sm text-zinc-400">L’acceptation par Resend ne confirme pas la livraison au destinataire.</p>
      {historyError&&<p role="alert">{historyError}</p>}
      {!history&&!historyError&&<p role="status">Chargement…</p>}
      {history?.rows.length===0&&<p>Aucun envoi sur cette page.</p>}
      <ul className="divide-y divide-zinc-800">{history?.rows.map(row=><li key={row.id} className="space-y-1 break-words py-3">
        <p className="font-semibold">{row.subject}</p>
        <p className="text-sm text-zinc-300">{adminMailSenders[row.sender].address} → {row.recipient}</p>
        <p className="text-sm text-zinc-400"><time dateTime={row.created_at}>{dateFormat.format(new Date(row.created_at))}</time>
          {' · '+mailStatusLabels[row.status]}{row.status!=='accepted'&&row.provider_status?' (HTTP '+row.provider_status+')':''}</p>
      </li>)}</ul>
      <div className="flex gap-2">
        <button className="admin-action" disabled={!history||index===0} onClick={()=>{setHistory(null);setIndex(index-1)}}>Précédente</button>
        <button className="admin-action" disabled={!history?.more} onClick={()=>{setHistory(null);setIndex(index+1)}}>Suivante</button>
      </div>
    </section>
  </>
}
