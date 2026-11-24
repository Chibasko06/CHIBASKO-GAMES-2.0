'use client'
import {useCallback} from 'react'
import {useAuth} from '@/components/AuthProvider'
import AuthRequired from '@/components/AuthRequired'
import DeveloperContactForm from '@/components/DeveloperContactForm'
import {PageHeader} from '@/components/developer/DeveloperUI'
import styles from '@/components/developer/developer.module.css'
export default function Page(){const {session,loading}=useAuth(),ready=useCallback(()=>{},[]);if(loading)return <p role="status">Chargement…</p>;if(!session)return <AuthRequired/>;return <section className={styles.page}><PageHeader title="Mon profil développeur" description="Vos coordonnées professionnelles et l’adresse vérifiée utilisée pour le suivi de vos jeux." action={false}/><DeveloperContactForm key={session.access_token} token={session.access_token} onReady={ready}/></section>}
