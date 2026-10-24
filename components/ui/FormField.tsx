'use client'
import {cloneElement,useId,type ReactElement} from 'react'

type Control={id?:string;'aria-describedby'?:string;'aria-invalid'?:boolean}
export default function FormField({label,children,error,descriptionId,className=''}:{label:string;children:ReactElement<Control>;error?:string;descriptionId?:string;className?:string}){
 const generated=useId(),id=children.props.id??generated,errorId=id+'-error'
 const described=[children.props['aria-describedby'],descriptionId,error?errorId:undefined].filter(Boolean).join(' ')||undefined
 return <div className={`grid min-w-0 gap-2 ${className}`}>
  <label htmlFor={id} className="text-sm font-semibold text-zinc-300">{label}</label>
  {cloneElement(children,{id,'aria-describedby':described,'aria-invalid':error?true:children.props['aria-invalid']})}
  {error?<p id={errorId} className="text-sm text-red-300">{error}</p>:null}
 </div>
}
