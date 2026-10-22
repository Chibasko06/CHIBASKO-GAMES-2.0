import type {ReactNode} from 'react'

export type DocumentationSection={id:string;title:string;content:ReactNode}
export default function DocumentationPage({title,intro,sections,children}:{title:string;intro:string;sections:DocumentationSection[];children?:ReactNode}){
 return <article className="mx-auto max-w-6xl space-y-8 text-zinc-300">
  <header className="rounded-2xl border border-cyan-900/60 bg-zinc-950 p-5 sm:p-8"><p className="text-xs uppercase tracking-widest text-cyan-300">Chibasko Games</p><h1 className="mt-3 break-words text-3xl font-bold text-white sm:text-4xl">{title}</h1><p className="mt-4 max-w-3xl leading-7">{intro}</p>{children}</header>
  <div className="grid min-w-0 gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
   <nav aria-label="Sommaire" className="self-start rounded-xl border border-zinc-800 p-4 lg:sticky lg:top-24"><h2 className="font-semibold text-white">Sur cette page</h2><ul className="mt-3 space-y-2 text-sm">{sections.map(section=><li key={section.id}><a className="block rounded text-cyan-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-cyan-400" href={'#'+section.id}>{section.title}</a></li>)}</ul></nav>
   <div className="min-w-0 space-y-6">{sections.map(section=><section key={section.id} id={section.id} className="min-w-0 scroll-mt-24 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 leading-7 sm:p-7"><h2 className="text-xl font-semibold text-white">{section.title}</h2>{section.content}</section>)}</div>
  </div>
 </article>
}
export function DocumentationCode({children,label}:{children:string;label:string}){
 return <div className="min-w-0"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</p><pre tabIndex={0} aria-label={label} className="max-w-full overflow-x-auto rounded-xl border border-zinc-700 bg-black p-4 text-sm leading-6 text-cyan-100"><code>{children}</code></pre></div>
}
