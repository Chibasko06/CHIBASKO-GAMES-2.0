import 'server-only'
import { uploadRepository } from '../game-distribution/uploads/repository'
import { UploadError } from '../game-distribution/uploads/policy'
import { gameplayEndpoint } from '../online-session/service'

export function onlineAvailabilityRepository(url:string,key:string,fetcher:typeof fetch=fetch) {
 const db=uploadRepository(url,key,fetcher)
 return {
  access:(gameId:string,versionId:string,access:'public'|'private')=>db.call<boolean>('distribution_multiplayer_access',{p_game:gameId,p_version:versionId,p_access:access}),
  async deployment(gameId:string,versionId:string){
   const target=new URL('/rest/v1/game_server_deployments',url)
   target.search=new URLSearchParams({select:'endpoint,game_server_deployment_versions!inner(version_id)',game_id:'eq.'+gameId,status:'eq.active','game_server_deployment_versions.version_id':'eq.'+versionId,order:'created_at.asc,id.asc',limit:'1'}).toString()
   try{
    const response=await fetcher(target,{headers:{apikey:key,Authorization:'Bearer '+key},cache:'no-store',signal:AbortSignal.timeout(15000)})
    if(!response.ok)throw new Error('unavailable')
    const rows=await response.json()
    if(!Array.isArray(rows))throw new Error('invalid_response')
    if(!rows.length)return false
    try{gameplayEndpoint(rows[0].endpoint);return true}catch{return false}
   }catch{throw new UploadError('database_error',503)}
  },
 }
}
export async function publishedOnlineAccess(gameId:string,versionId:string,access:'public'|'private',repository=onlineAvailabilityRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'')) {
 return await repository.access(gameId,versionId,access) && await repository.deployment(gameId,versionId)
}
