import type {Metadata} from 'next'
import StorageDiagnostic from '@/components/game-runtime/StorageDiagnostic'
import {validateGatewayConfiguration} from '@/lib/game-distribution/gateway/resolver'
import {storageProbeHost} from '@/lib/game-distribution/gateway/storage-probe'

export const dynamic='force-dynamic'
export const metadata:Metadata={title:'Diagnostic du stockage | Chibasko Games',robots:{index:false,follow:false}}

export default function GameStorageDiagnosticPage(){
 let origin:string|null=null
 try{
  const base=process.env.GAME_CONTENT_BASE_DOMAIN??'',portal=new URL(process.env.NEXT_PUBLIC_SITE_URL??'https://chibaskogames.fr').origin
  validateGatewayConfiguration({publicBase:base,previewBase:base,portalOrigins:[portal]})
  origin='https://'+storageProbeHost(base)
 }catch{}
 return <main className="mx-auto max-w-3xl rounded-2xl border border-cyan-950 bg-zinc-950 p-5 md:p-8">{origin?<StorageDiagnostic origin={origin}/>:<p role="alert" className="text-sm text-amber-200">Le diagnostic du stockage n’est pas configuré sur cet environnement.</p>}</main>
}
