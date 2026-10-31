'use client'
import Link from 'next/link'
import {useAuth} from '@/components/AuthProvider'
import {useAdminAccess} from '@/components/admin/useAdminAccess'
import AdminShell from './AdminShell'
import ModerationReports from './ModerationReports'
import ModerationMeasures from './ModerationMeasures'
import ModerationHistory from './ModerationHistory'
import {socialButton} from '@/lib/social'

type Props={measuresEnabled?:boolean;view?:'reports'|'measures'|'appeals';measureId?:string;appealId?:string;caseId?:string;initialAction?:string;directTarget?:{id:string;kind:'player'|'game';subject?:string}}
export default function Moderation({measuresEnabled=false,view='reports',measureId,appealId,caseId,initialAction,directTarget}:Props){
 const {session}=useAuth(),access=useAdminAccess()
 if(access.status==='checking')return <p role="status">Vérification des accès…</p>
 if(access.status!=='allowed'||!session)return <div role="alert">Accès administrateur requis. <button className={socialButton} onClick={access.retry}>Réessayer</button></div>
 const selected=directTarget||measureId?'measures':appealId?'appeals':view
 return <AdminShell active="moderation"><div className="space-y-6">
  <nav aria-label="Espaces de modération" className="flex flex-wrap gap-2 border-b border-zinc-800 pb-4">{([['reports','Signalements'],['measures','Sanctions'],['appeals','Recours']] as const).map(([value,label])=><Link key={value} href={'/admin/moderation?view='+value} aria-current={selected===value?'page':undefined} className={socialButton+(selected===value?' border-cyan-400 bg-cyan-950 text-cyan-100':'')}>{label}</Link>)}</nav>
  {directTarget?<><div className="flex flex-wrap gap-3"><Link className={socialButton} href="/admin/moderation?view=measures">Toutes les sanctions</Link>{directTarget.kind==='player'&&<Link className={socialButton} href="/admin?section=users">Retour aux utilisateurs</Link>}{caseId&&<Link className={socialButton} href={'/admin/moderation?id='+caseId}>Retour au signalement</Link>}</div><ModerationMeasures key={session.access_token+directTarget.id} creationEnabled={measuresEnabled} token={session.access_token} target={directTarget.id} kind={directTarget.kind} subject={directTarget.subject} caseId={caseId} initialAction={initialAction}/></>:selected==='reports'?<ModerationReports key={session.access_token} token={session.access_token}/>:<ModerationHistory key={session.access_token+selected+(measureId??appealId??'')} token={session.access_token} view={selected} id={measureId??appealId}/>}
 </div></AdminShell>
}
