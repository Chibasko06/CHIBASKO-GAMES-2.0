'use client'
import {useEffect,useRef,useState,type ReactNode} from 'react'
import {playerSizing,LEGACY_VIEWPORT,type PlayerSizing,type PlayerViewport} from '@/lib/game-runtime/playerSizing'
export type {PlayerViewport,PlayerSizing} from '@/lib/game-runtime/playerSizing'
export const legacyViewport=LEGACY_VIEWPORT
export default function PlayerFrame({children,viewport,sizing}:{children:ReactNode;viewport?:PlayerViewport;sizing?:PlayerSizing}){
 const host=useRef<HTMLDivElement>(null)
 const [size,setSize]=useState({width:0,height:0})
 useEffect(()=>{
  const element=host.current!
  const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}))
  observer.observe(element)
  return()=>observer.disconnect()
 },[])
 const policy=playerSizing(sizing,viewport),fixed=policy.mode==='fixed'?policy.viewport:undefined
 const scale=fixed?Math.min(size.width/fixed.width,size.height/fixed.height):1
 return <div ref={host} data-frame-layout={fixed?'contain':'responsive'} data-player-sizing={policy.mode} style={{position:'absolute',inset:0,overflow:'hidden',background:'#090d16'}}>
  <div data-frame-content style={fixed?{position:'absolute',left:'50%',top:'50%',width:fixed.width,height:fixed.height,transform:'translate(-50%, -50%) scale('+scale+')',transformOrigin:'center'}:{position:'absolute',inset:0}}>{children}</div>
 </div>
}
