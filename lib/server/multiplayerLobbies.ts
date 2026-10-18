import 'server-only'
import { multiplayerLobbyService } from '../multiplayer-lobby/service'
import { LobbyError, type LobbyAccess } from '../multiplayer-lobby/contracts'
import { uploadRepository } from '../game-distribution/uploads/repository'
import { UploadError } from '../game-distribution/uploads/policy'
import { createUserAuthClient } from './adminAuthorization'
import { adminOriginAllowed } from './adminRequest'
import { readJsonObject, InputError } from './inputValidation'

export const multiplayerDependencies={
 async actor(request:Request) {
  const header=request.headers.get('authorization')??''
  if(!header.startsWith('Bearer ') || header.length>8192)throw new LobbyError('unauthorized',401)
  const token=header.slice(7),{data,error}=await createUserAuthClient(token).auth.getUser(token)
  if(error || !data.user)throw new LobbyError('unauthorized',401)
  return data.user.id
 },
 service(){return multiplayerLobbyService(uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??''))},
}
export async function multiplayerRequest(request:Request,segments:string[],deps=multiplayerDependencies) {
 const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}
 try {
  if(!['GET','POST'].includes(request.method))throw new LobbyError('unsupported_method',405)
  if(request.method==='POST' && !adminOriginAllowed(request))throw new LobbyError('forbidden',403)
  const actor=await deps.actor(request),service=deps.service(),url=new URL(request.url)
  let result:unknown
  if(request.method==='GET') {
   if(segments.length===3 && segments[0]==='games' && segments[2]==='lobbies')result=await service.list(actor,segments[1],url.searchParams.get('after')??undefined)
   else if(segments.length===2 && segments[0]==='lobbies')result=await service.get(actor,segments[1])
   else throw new LobbyError('invalid_request')
  }else {
   const body=await readJsonObject(request,1024)
   const exact=(keys:string[])=>{if(Object.keys(body).length!==keys.length || !keys.every(k=>Object.hasOwn(body,k)))throw new LobbyError('invalid_request')}
   if(segments.length===1 && segments[0]==='lobbies') {
    exact(['gameId','access','requestId']);result=await service.create(actor,body.gameId as string,body.access as LobbyAccess,body.requestId as string)
   }else if(segments.length===2 && segments[0]==='lobbies' && segments[1]==='join-code') {
    exact(['gameId','code']);result=await service.joinCode(actor,body.gameId as string,body.code as string)
   }else if(segments.length===3 && segments[0]==='lobbies' && ['join','leave','ready','start','replay'].includes(segments[2])) {
    exact(segments[2]==='ready'?['ready']:[])
    result=await service.mutate(actor,segments[1],segments[2] as 'join'|'leave'|'ready'|'start'|'replay',body.ready as boolean|undefined)
   }else throw new LobbyError('invalid_request')
  }
  return Response.json({data:result},{headers})
 }catch(error) {
  const safe=error instanceof LobbyError || error instanceof UploadError?error:error instanceof InputError?new LobbyError('invalid_request',error.status):new LobbyError('service_unavailable',503)
  return Response.json({error:{code:safe.code}},{status:safe.status,headers})
 }
}
