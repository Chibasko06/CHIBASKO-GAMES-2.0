'use client'
import {useState} from 'react'
import Link from 'next/link'
import {useAuth} from '@/components/AuthProvider'
import SocialDialog from '@/components/SocialDialog'
import ReportForm from '@/components/ReportForm'
import {socialButton} from '@/lib/social'
import type {ReportKind} from '@/lib/moderation'
export default function ReportButton({kind,target}:{kind:ReportKind;target:string}){
 const {user,loading}=useAuth(),[open,setOpen]=useState(false)
 if(loading||kind==='player'&&user?.id===target)return null
 const label=kind==='player'?'Signaler le joueur':'Signaler le jeu'
 if(!user)return <Link href={'/contact?'+new URLSearchParams({report:kind,target})} className={socialButton+' mt-2 w-full'}>{label}</Link>
 return <><button type="button" className={socialButton+' mt-2 w-full text-amber-200'} onClick={event=>{const menu=event.currentTarget.closest('details');if(menu){menu.open=false;menu.querySelector('summary')?.focus()}setOpen(true)}}>{label}</button>{open&&<SocialDialog title={label} onClose={()=>setOpen(false)}><ReportForm kind={kind} target={target}/></SocialDialog>}</>
}
