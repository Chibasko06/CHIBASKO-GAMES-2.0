import CommunityHub from '@/components/CommunityHub'
import {getViewerProfilesPage} from '@/lib/server/publicProfiles'
import {pageNumber} from '@/lib/pagination'
import Link from 'next/link'
import {redirect} from 'next/navigation'
import {buildPageMetadata} from '@/lib/seo'

export const dynamic='force-dynamic'
export const metadata=buildPageMetadata({title:'Communauté',description:'Retrouvez des joueurs par leur @pseudo et gérez vos amitiés dans votre espace privé sur Chibasko Games.',path:'/players'})
export default async function PlayersPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const query=await searchParams,search=typeof query.search==='string'?query.search.trim().slice(0,80):''
 const normalized=search.replace(/^@/,'').toLowerCase(),valid=/^[a-z0-9][a-z0-9_-]{2,31}$/.test(normalized)
 const page=pageNumber(query.page)
 // Une recherche vide ou trop courte ne déclenche aucune lecture d'annuaire.
 const profiles=valid?await getViewerProfilesPage(normalized,page,'all'):{items:[],total:0}
 const pages=Math.max(1,Math.ceil(profiles.total/24)),href=(number:number)=>'/players?'+new URLSearchParams({search,page:String(number)})
 if(valid&&page>pages)redirect(href(pages))
 return <div className="mx-auto w-full max-w-5xl space-y-6">
  <header className="border-b border-zinc-800 pb-5"><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-cyan-300">Chibasko Games</p><h1 className="text-3xl font-bold">Communauté</h1><p className="mt-2 text-sm text-zinc-400">Retrouve des joueurs et gère tes demandes d’amis.</p></header>
  <form action="/players" className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:flex-row sm:items-end">
   <label className="min-w-0 flex-1 text-sm text-zinc-300">Rechercher par @pseudo<input type="search" name="search" defaultValue={search} minLength={3} maxLength={33} placeholder="@pseudo" aria-describedby="community-search-help" className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 text-white focus-visible:outline-2 focus-visible:outline-cyan-300"/></label>
   <button type="submit" className="min-h-11 rounded-lg bg-cyan-400 px-5 font-semibold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300">Rechercher</button>
  </form>
  <p id="community-search-help" className="text-xs text-zinc-400">Au moins 3 caractères du pseudo, sans espace.</p>
  {search&&!valid&&<p role="alert" className="text-sm text-red-300">Saisis un pseudo de 3 à 32 caractères : lettres sans accent, chiffres, tirets ou underscores.</p>}
  <CommunityHub profiles={profiles.items} searching={valid}>
   {pages>1&&<nav aria-label="Pages des résultats de recherche" className="flex flex-wrap items-center justify-center gap-3 pt-3">{page>1&&<Link href={href(page-1)} className="rounded-lg border border-zinc-700 px-4 py-3 text-sm">Précédent</Link>}<span className="text-sm text-zinc-400">Page {page} sur {pages}</span>{page<pages&&<Link href={href(page+1)} className="rounded-lg border border-zinc-700 px-4 py-3 text-sm">Suivant</Link>}</nav>}
  </CommunityHub>
 </div>
}
