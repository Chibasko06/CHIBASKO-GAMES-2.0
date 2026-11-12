import 'server-only'
import { authenticateDeveloper } from './developerIdentity'
import { externalGameUrl } from '../game-distribution/external-game-url'
import { uploadRepository } from '../game-distribution/uploads/repository'
import { assertUploadId, UploadError } from '../game-distribution/uploads/policy'
import type { UploadRepository } from '../game-distribution/uploads/contracts'

type Launch = {kind:'legacy'|'unavailable'} | {kind:'external';revisionId:string;url:string}
const defaults = {
  authenticate: authenticateDeveloper,
  db: ():UploadRepository => uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'',
    (input,init)=>fetch(input,{...init,cache:'no-store'})),
}

function externalLaunch(value:Launch) {
  if(value.kind!=='external')throw new UploadError('game_not_found',404)
  assertUploadId(value.revisionId)
  return {revisionId:value.revisionId,url:externalGameUrl(value.url).url}
}

export async function publicExternalGameKind(gameId:string, db=defaults.db()) {
  const result=await db.call<Launch>('distribution_external_public_launch',{p_game:gameId})
  if(result.kind==='external')externalLaunch(result)
  return result.kind
}

export async function externalGameLaunchRequest(request:Request,id:string,mode:'private'|'public',deps=defaults) {
  const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}
  try{
    const actor=mode==='private'?await deps.authenticate(request):null
    assertUploadId(id)
    const db=deps.db()
    const value=mode==='private'
      ?await db.call<Launch>('distribution_external_preview',{p_actor:actor,p_revision:id})
      :await db.call<Launch>('distribution_external_public_launch',{p_game:id})
    const launch=externalLaunch(value)
    if(mode==='private'&&launch.revisionId!==id)throw new UploadError('game_not_found',404)
    return Response.json({data:launch},{headers})
  }catch(error){
    const safe=error instanceof UploadError?error:new UploadError('service_unavailable',503)
    return Response.json({error:{code:safe.code}},{status:safe.status,headers})
  }
}
