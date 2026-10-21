'use client'
import {useEffect,useRef,useState,type ReactNode} from 'react'
export type PlayerViewport={width:number;height:number}
export const legacyViewport:PlayerViewport={width:1280,height:720}
export default function PlayerFrame({children,viewport}:{children:ReactNode;viewport?:PlayerViewport}){
 const host=useRef<HTMLDivElement>(null)
 const [size,setSize]=useState({width:0,height:0})
 useEffect(()=>{
  const element=host.current!
  const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}))
  observer.observe(element)
  return()=>observer.disconnect()
 },[])
 const fixed=viewport && Number.isFinite(viewport.width) && Number.isFinite(viewport.height) && viewport.width>0 && viewport.height>0?viewport:undefined
 const scale=fixed?Math.min(size.width/fixed.width,size.height/fixed.height):1
 return <div ref={host} data-frame-layout={fixed?'contain':'responsive'} style={{position:'absolute',inset:0,overflow:'hidden',background:'#090d16'}}>
  <div style={fixed?{position:'absolute',left:'50%',top:'50%',width:fixed.width,height:fixed.height,transform:'translate(-50%, -50%) scale('+scale+')',transformOrigin:'center'}:{position:'absolute',inset:0}}>{children}</div>
 </div>
}
