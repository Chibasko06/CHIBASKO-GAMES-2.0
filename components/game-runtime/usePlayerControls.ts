'use client'
import {useEffect,useRef,useState,type RefObject} from 'react'
import {controlCorners,playerControlCorner,type ControlCorner} from '@/lib/game-runtime/playerControls'

export function usePlayerControls(shell:RefObject<HTMLElement|null>,expanded:boolean){
 const [corner,setCorner]=useState<ControlCorner>('top-left'),manual=useRef<ControlCorner|null>(null)
 useEffect(()=>{
  manual.current=null
  if(!expanded||!shell.current)return
  const element=shell.current,surface=element.querySelector<HTMLElement>('[data-player-surface]')!,win=element.ownerDocument.defaultView!
  let frame=0,stopped=false
  const update=()=>{frame=0;if(stopped||manual.current)return;const content=surface.querySelector<HTMLElement>('[data-frame-content]');setCorner(playerControlCorner(surface.getBoundingClientRect(),content?.getBoundingClientRect()))}
  const queue=()=>{if(!frame)frame=win.requestAnimationFrame(update)}
  const resize=new ResizeObserver(queue),mutation=new MutationObserver(queue)
  resize.observe(surface);mutation.observe(surface,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});queue()
  return()=>{stopped=true;win.cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect()}
 },[expanded,shell])
 function move(){const next=controlCorners[(controlCorners.indexOf(corner)+1)%controlCorners.length];manual.current=next;setCorner(next)}
 return {corner,move}
}
