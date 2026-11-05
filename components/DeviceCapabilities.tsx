'use client'
import {useEffect} from 'react'
import {capabilityDevice} from '@/lib/gameCompatibility'

export default function DeviceCapabilities(){
 useEffect(()=>{
  if(/bot|crawler|spider/i.test(navigator.userAgent))return
  const coarse=matchMedia('(pointer: coarse)'),fine=matchMedia('(any-pointer: fine)')
  // La préférence sert aux navigations suivantes, sans recharger ni déplacer le rendu initial.
  const save=()=>{
   const device=capabilityDevice({coarse:coarse.matches,fine:fine.matches,touchPoints:navigator.maxTouchPoints,shortSide:Math.min(screen.width,screen.height)})
   document.cookie='cg-device='+device+'; Path=/; Max-Age=2592000; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'')
  }
  save();coarse.addEventListener('change',save);fine.addEventListener('change',save)
  return()=>{coarse.removeEventListener('change',save);fine.removeEventListener('change',save)}
 },[])
 return null
}
