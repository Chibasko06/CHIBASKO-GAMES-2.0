import { artifactReader, type ArtifactBucketBinding } from './artifact-reader'
import { createArtifactGateway } from '../lib/game-distribution/gateway/gateway'
import { uploadRepository } from '../lib/game-distribution/uploads/repository'

type Environment={GAME_ARTIFACT_GATEWAY_ENABLED?:string;ARTIFACTS:ArtifactBucketBinding;SUPABASE_URL:string;SUPABASE_SERVICE_ROLE_KEY:string;
  GAME_CONTENT_PUBLIC_BASE:string;GAME_CONTENT_PREVIEW_BASE:string;GAME_CONTENT_BASE_DOMAIN?:string;GAME_PORTAL_ORIGINS:string}
const worker={
  async fetch(request:Request,env:Environment) {
    try {
      if(env.GAME_ARTIFACT_GATEWAY_ENABLED!=='1')throw new Error()
      return await createArtifactGateway({publicBase:env.GAME_CONTENT_PUBLIC_BASE,previewBase:env.GAME_CONTENT_PREVIEW_BASE,contentBase:env.GAME_CONTENT_BASE_DOMAIN,
        portalOrigins:env.GAME_PORTAL_ORIGINS.split(',').map(s=>s.trim())},
      {db:uploadRepository(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY),storage:artifactReader(env.ARTIFACTS),log:event=>console.log(JSON.stringify(event))})(request)
    }catch{
      const headers={'Cache-Control':'private, no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff',
        'Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"}
      return new Response(request.method==='HEAD'?null:JSON.stringify({error:{code:'service_unavailable'}}),{status:503,headers})
    }
  },
  async scheduled(_event:unknown,env:Environment) {
    if(env.GAME_ARTIFACT_GATEWAY_ENABLED==='1') {
      const db=uploadRepository(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY)
      await db.call('distribution_cleanup_previews',{})
      if(env.GAME_CONTENT_BASE_DOMAIN)await db.call('distribution_cleanup_launches',{})
    }
  },
}
export default worker
