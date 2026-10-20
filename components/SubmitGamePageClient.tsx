'use client'
import Link from 'next/link'
import {useEffect,useState} from 'react'
import {useAuth} from '@/components/AuthProvider'
import {SubmissionTabs,type SubmissionMode} from './SubmissionGameChoice'
import {FormFeedback,HelpText} from './ui/FormFeedback'
import {REVIEW_NOTICE} from '@/lib/game-distribution/review'
import {developerJson} from '@/lib/game-distribution/browser-upload'
import NewGamePublication from './NewGamePublication'
import UpdateGamePublication from './UpdateGamePublication'
import type {PublicationCategory} from './NewGameDraftEditor'
export default function SubmitGamePageClient({categories}:{categories:PublicationCategory[]}){
 const {session,loading}=useAuth()
 if(loading)return <main className="mx-auto max-w-3xl p-6"><FormFeedback tone="info" title="Chargement du compte…" announce/></main>
 if(!session)return <main className="mx-auto max-w-3xl space-y-5 p-6"><h1 className="text-3xl font-bold">Publier un jeu</h1><FormFeedback tone="info" title="Connectez-vous pour soumettre un jeu"><p>Un compte est nécessaire pour envoyer un build Web ZIP et suivre sa vérification.</p></FormFeedback><HelpText>{REVIEW_NOTICE}</HelpText><nav className="flex gap-4"><Link href="/login?next=%2Fpublier-un-jeu">Se connecter</Link><Link href="/register?next=%2Fpublier-un-jeu">Créer un compte</Link></nav></main>
 return <Workspace key={session.user.id} actor={session.user.id} token={session.access_token} categories={categories}/>
}
function Workspace({actor,token,categories}:{actor:string;token:string;categories:PublicationCategory[]}){
 const [mode,setMode]=useState<SubmissionMode>('new')
 const [editing,setEditing]=useState(false)
 useEffect(()=>{const upload=new URLSearchParams(window.location.search).get('upload');if(!upload)return;const controller=new AbortController();developerJson('/api/developer/submissions?uploadId='+encodeURIComponent(upload),token,{signal:controller.signal}).then(({data})=>{if(!controller.signal.aborted)setMode(data.kind)}).catch(()=>{});return()=>controller.abort()},[token])
 return <main className="mx-auto max-w-3xl space-y-6 p-6"><h1 className="text-3xl font-bold">Publier un jeu Web</h1>
   <HelpText>Envoyez un ZIP autonome contenant <code>chibasko.json</code> à sa racine.</HelpText>
   <FormFeedback tone="warning" title="Chaque version fait l’objet d’une revue"><p>{REVIEW_NOTICE} Chibasko Games peut refuser un jeu.</p></FormFeedback>
   <Link className="inline-block text-cyan-300 underline underline-offset-4" href="/developer/submissions">Mes soumissions</Link>
   <SubmissionTabs mode={mode} disabled={editing} onChange={setMode}/>
   <section role="tabpanel" id="submission-panel" aria-labelledby={'tab-'+mode}>
     {mode==='new'?<NewGamePublication token={token} categories={categories} onEditingChange={setEditing}/>:<UpdateGamePublication actor={actor} token={token}/>}
   </section>
 </main>
}
