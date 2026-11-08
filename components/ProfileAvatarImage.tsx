'use client'
import Image,{type ImageProps} from 'next/image'
import {useState} from 'react'
export default function ProfileAvatarImage({fallback='J',onError,...props}:ImageProps&{fallback?:string}){
 const [failed,setFailed]=useState<ImageProps['src']|null>(null)
 if(failed===props.src)return <span role={props.alt?'img':undefined} aria-label={props.alt||undefined} aria-hidden={!props.alt||undefined} className={(props.className??'')+' flex items-center justify-center bg-cyan-950 font-bold text-cyan-200'} style={{width:props.width,height:props.height}}>{fallback.toUpperCase()}</span>
 return <Image {...props} alt={props.alt} unoptimized referrerPolicy="no-referrer" onError={event=>{setFailed(props.src);onError?.(event)}}/>
}
