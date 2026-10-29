'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import ProfileCard from '@/components/ProfileCard'
import ProfileSocialActions from '@/components/ProfileSocialActions'
import type {PublicProfile} from '@/lib/queries/profiles'
import {useAuth} from '@/components/AuthProvider'

export default function PublicProfileView({profile}:{profile:PublicProfile}){
 const {user}=useAuth()
 return <View key={user?.id??'guest'} profile={profile}/>
}
function View({profile}:{profile:PublicProfile}){
 const [hidden,setHidden]=useState(false)
 const message=useRef<HTMLDivElement>(null)
 useEffect(()=>{if(hidden)message.current?.focus()},[hidden])
 if(hidden)return <div ref={message} tabIndex={-1} role="status" className="rounded-xl border border-zinc-800 p-6"><p>Ce profil n’est plus accessible dans ton espace.</p><Link href={'/contact?report=player&target='+profile.id} className="mt-3 block py-3 text-amber-200">Signaler ce compte</Link><Link href="/players" className="mt-3 inline-block py-3 text-cyan-300">Retour à la Communauté</Link></div>
 return <><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Profil public</p><ProfileSocialActions target={profile.id} username={profile.username} onChanged={({relation})=>{if(['blocked','unavailable'].includes(relation.state))setHidden(true)}}/></div><ProfileCard profile={profile} heading="h1"/></>
}
