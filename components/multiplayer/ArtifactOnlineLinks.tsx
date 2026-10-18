import Link from 'next/link'
import { publishedOnlineAccess } from '@/lib/server/publishedOnlineAccess'
export default async function ArtifactOnlineLinks({gameId,versionId,slug}:{gameId:string;versionId:string;slug:string}) {
 const access=await Promise.all((['public','private'] as const).map(async mode=>({mode,available:await publishedOnlineAccess(gameId,versionId,mode)})))
 return <section aria-label="Modes multijoueur" className="flex flex-wrap gap-4 rounded-2xl border border-cyan-900 p-5">
  {access.filter(option=>option.available).map(({mode})=><Link key={mode} href={`/games/${slug}/${mode==='public'?'online':'private'}`} className="rounded-xl border border-cyan-700 px-5 py-3 font-bold text-cyan-100">{mode==='public'?'Jouer en ligne':'Partie privée'}</Link>)}
 </section>
}
