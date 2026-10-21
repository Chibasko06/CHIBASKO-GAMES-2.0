'use client'
import {Children,useEffect,useId,useRef,useState,type ReactNode} from 'react'
import styles from './HorizontalScroller.module.css'
export default function HorizontalScroller({children,label,className=''}:{children:ReactNode;label:string;className?:string}){
 const track=useRef<HTMLDivElement>(null),id=useId()
 const [edges,setEdges]=useState({overflow:false,start:true,end:true})
 useEffect(()=>{
  const element=track.current!
  const sync=()=>{
   const next={overflow:element.scrollWidth>element.clientWidth+1,start:element.scrollLeft<=1,end:element.scrollLeft+element.clientWidth>=element.scrollWidth-1}
   setEdges(previous=>previous.overflow===next.overflow && previous.start===next.start && previous.end===next.end?previous:next)
  }
  const observer=new ResizeObserver(sync)
  observer.observe(element)
  for(const child of element.children)observer.observe(child)
  sync();element.addEventListener('scroll',sync,{passive:true})
  return()=>{observer.disconnect();element.removeEventListener('scroll',sync)}
 },[children])
 const move=(direction:number)=>{const element=track.current!;element.scrollBy({left:direction*element.clientWidth*.85,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}
 return <div className={styles.rail+' '+className}>
  <div ref={track} id={id} className={styles.track} data-horizontal-items role="region" aria-label={label} tabIndex={edges.overflow?0:undefined}>
   {Children.toArray(children).map((child,index)=><div className={styles.item} key={index}>{child}</div>)}
  </div>
  {edges.overflow?<div className={styles.controls} role="group" aria-label={'Défilement : '+label}>
   <button type="button" onClick={()=>move(-1)} disabled={edges.start} aria-label={'Précédents : '+label} aria-controls={id}><span aria-hidden="true">‹</span></button>
   <button type="button" onClick={()=>move(1)} disabled={edges.end} aria-label={'Suivants : '+label} aria-controls={id}><span aria-hidden="true">›</span></button>
  </div>:null}
 </div>
}
