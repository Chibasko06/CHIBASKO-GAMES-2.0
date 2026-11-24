'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {useAuth} from '@/components/AuthProvider'
import {developerJson} from '@/lib/game-distribution/browser-upload'
import type {DeveloperEmailStatus} from '@/lib/server/developerEmail'
import styles from './developer.module.css'
export default function ProfessionalEmailNotice(){const {session}=useAuth();return session?<Notice key={session.access_token} token={session.access_token}/>:null}
function Notice({token}:{token:string}){
 const [status,setStatus]=useState<DeveloperEmailStatus|null>(null),[failed,setFailed]=useState(false)
 useEffect(()=>{const c=new AbortController();const read=()=>{void developerJson('/api/developer/profile/email',token,{signal:c.signal}).then(({data})=>{if(!c.signal.aborted){setStatus(data);setFailed(false)}}).catch(()=>{if(!c.signal.aborted)setFailed(true)})};read();window.addEventListener('chibasko:developer-email',read);return()=>{c.abort();window.removeEventListener('chibasko:developer-email',read)}},[token])
 if(status?.verified&&!failed)return null
 if(!status&&!failed)return <p role="status" className={styles.small}>Vérification du profil développeur…</p>
 return <aside className={styles.notice} data-tone="warning" aria-label="Adresse professionnelle du développeur"><strong>{failed?'Vérification de l’adresse indisponible':status?.profileRequired?'Complétez votre profil développeur':'Votre adresse professionnelle reste à vérifier.'}</strong><p>{failed?'Le statut n’a pas pu être chargé. Les dépôts restent soumis au contrôle serveur.':'Une adresse professionnelle vérifiée est nécessaire pour tout nouveau dépôt ou correction. Votre historique reste accessible.'}</p><Link className={`${styles.secondary} mt-3`} href="/developer/profile">{status?.profileRequired?'Créer mon profil développeur':'Vérifier mon adresse professionnelle'}</Link></aside>
}
