import type {ReactNode} from 'react'

type Tone='error'|'success'|'warning'|'info'
const tones:Record<Tone,{style:string;symbol:string}>={
  error:{style:'border-rose-500/50 bg-rose-950/25 text-rose-100',symbol:'!'},
  success:{style:'border-emerald-500/40 bg-emerald-950/20 text-emerald-100',symbol:'✓'},
  warning:{style:'border-amber-500/35 bg-amber-950/15 text-amber-100',symbol:'!'},
  info:{style:'border-cyan-600/40 bg-cyan-950/20 text-cyan-100',symbol:'i'},
}
export function FormFeedback({tone,title,children,id,announce=false}:{tone:Tone;title:string;children?:ReactNode;id?:string;announce?:boolean}){
  const role=tone==='error'?'alert':announce||tone==='success'?'status':undefined
  return <section id={id} role={role} tabIndex={tone==='error'?-1:undefined}
    className={'rounded-xl border p-4 sm:p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 '+tones[tone].style}>
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full border border-current text-sm font-bold">{tones[tone].symbol}</span>
      <div className="min-w-0 flex-1"><h2 className="font-semibold leading-6">{title}</h2>
        {children&&<div className="mt-2 space-y-2 text-sm leading-6">{children}</div>}
      </div>
    </div>
  </section>
}
export function HelpText({children,id}:{children:ReactNode;id?:string}){
  return <p id={id} className="text-sm leading-6 text-zinc-400">{children}</p>
}
