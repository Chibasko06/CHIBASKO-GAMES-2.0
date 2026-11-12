'use client'
import {developersEmail,developersMailto} from '@/lib/siteContacts'
import DeveloperContactForm from './DeveloperContactForm'
import Link from 'next/link'
import {useSearchParams} from 'next/navigation'
import {useEffect,useState} from 'react'
import {useAuth} from '@/components/AuthProvider'
import {SubmissionTabs,type SubmissionMode} from './SubmissionGameChoice'
import {FormFeedback,HelpText} from './ui/FormFeedback'
import {REVIEW_NOTICE} from '@/lib/game-distribution/review'
import {developerJson} from '@/lib/game-distribution/browser-upload'
import NewGamePublication from './NewGamePublication'
import ExternalSubmissions from './ExternalSubmissions'
import UpdateGamePublication from './UpdateGamePublication'
import type {PublicationCategory} from './NewGameDraftEditor'
const developerContact=<p className="text-sm text-zinc-300">Questions sur la publication ou l’intégration ? <a className="text-cyan-300 underline break-words" href={developersMailto}>{developersEmail}</a>.</p>

export default function SubmitGamePageClient({categories}:{categories:PublicationCategory[]}){
 const {session,loading}=useAuth()
 if(loading)return <div className="mx-auto max-w-3xl p-6"><FormFeedback tone="info" title="Chargement du compte…" announce/></div>
 if(!session)return <div className="mx-auto max-w-3xl space-y-5 p-6"><h1 className="text-3xl font-bold">Publier un jeu</h1><Link className="text-cyan-300 underline" href="/developpeurs">Consulter le guide développeur</Link><FormFeedback tone="info" title="Connectez-vous pour soumettre un jeu"><p>Un compte est nécessaire pour envoyer un build Web ZIP et suivre sa vérification.</p></FormFeedback><HelpText>{REVIEW_NOTICE}</HelpText><nav className="flex gap-4"><Link href="/login?next=%2Fpublier-un-jeu">Se connecter</Link><Link href="/register?next=%2Fpublier-un-jeu">Créer un compte</Link></nav>{developerContact}</div>
 return <Workspace key={session.user.id} actor={session.user.id} token={session.access_token} categories={categories}/>
}
function Workspace({actor,token,categories}:{actor:string;token:string;categories:PublicationCategory[]}){
 const [profileReady,setProfileReady]=useState(false)
 const query=useSearchParams()
 const [mode,setMode]=useState<SubmissionMode>(()=>query.get('mode')==='update'?'update':'new')
 const [external,setExternal]=useState(()=>query.get('hosting')==='external')
 const [editing,setEditing]=useState(false)
 useEffect(()=>{const query=new URLSearchParams(window.location.search);const upload=query.get('upload');if(!upload)return;const controller=new AbortController();developerJson('/api/developer/submissions?uploadId='+encodeURIComponent(upload),token,{signal:controller.signal}).then(({data})=>{if(!controller.signal.aborted)setMode(data.kind)}).catch(()=>{});return()=>controller.abort()},[token])
 return <div className="mx-auto max-w-3xl space-y-6 p-6"><h1 className="text-3xl font-bold">Publier un jeu Web</h1>
   <Link className="inline-block text-cyan-300 underline underline-offset-4" href="/developpeurs">Consulter le guide développeur</Link>
   <fieldset disabled={editing} className="space-y-2">
     <legend className="font-semibold">Hébergement du jeu</legend>
     <label className="block"><input type="radio" name="hosting" checked={!external} onChange={()=>setExternal(false)}/> Envoyer un jeu HTML5 par ZIP</label>
     <label className="block"><input type="radio" name="hosting" checked={external} onChange={()=>setExternal(true)}/> Fournir une URL HTTPS</label>
   </fieldset>
   {developerContact}
   <HelpText>{external?'Jeu HTML5 classique hébergé chez vous. Vérifiez que votre hébergeur autorise les iframes.':<>Envoyez un ZIP autonome contenant <code>chibasko.json</code> à sa racine.</>}</HelpText>
   <FormFeedback tone="warning" title="Chaque version fait l’objet d’une revue"><p>{REVIEW_NOTICE} Chibasko Games peut refuser un jeu.</p></FormFeedback>
   <Link className="inline-block text-cyan-300 underline underline-offset-4" href="/developer/submissions">Mes soumissions</Link>
   <DeveloperContactForm token={token} onReady={setProfileReady}/>
   {!profileReady&&<FormFeedback tone="info" title="Complétez votre fiche développeur avant d’envoyer une soumission"><p>Les coordonnées sont conservées pour les prochaines soumissions. Vos brouillons restent privés et enregistrés séparément.</p></FormFeedback>}
   <SubmissionTabs mode={mode} disabled={editing} onChange={setMode}/>
   <fieldset disabled={!profileReady} className="min-w-0 border-0 p-0"><legend className="sr-only">Soumission du build</legend><section role="tabpanel" id="submission-panel" aria-labelledby={'tab-'+mode}>
     {mode==='new'?<NewGamePublication token={token} categories={categories} onEditingChange={setEditing} external={external}/>:external?<ExternalSubmissions token={token} updatesOnly/>:<UpdateGamePublication actor={actor} token={token}/>}
   </section></fieldset>
 </div>
}
