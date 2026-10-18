import 'server-only'
import { uploadRepository } from '../game-distribution/uploads/repository'
import { UploadError } from '../game-distribution/uploads/policy'
import { onlineSessionService } from '../online-session/service'
import { OnlineSessionError } from '../online-session/contracts'
import { readJsonObject, InputError } from './inputValidation'
import { adminOriginAllowed } from './adminRequest'

export function onlineService(){return onlineSessionService(uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''))}
export async function onlineRequest(request:Request,launchId?:string,service=onlineService,
 log:(event:{requestId:string;operation:string;status:number;code:string})=>void=event=>console.info(JSON.stringify(event))) {
 const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}
 const requestId=crypto.randomUUID(),operation=launchId?'online_start':'ticket_exchange'
 const record=(status:number,code:string)=>{try{log({requestId,operation,status,code})}catch{/* Logging must not change admission semantics. */}}
 try {
  if(request.method!=='POST')throw new OnlineSessionError('unsupported_method',405)
  if(process.env.GAME_RUNTIME_LAUNCHES_ENABLED!=='1')throw new OnlineSessionError('service_unavailable',503)
  const body=await readJsonObject(request,2048)
  let data:unknown
  if(launchId){
   if(!adminOriginAllowed(request))throw new OnlineSessionError('forbidden',403)
   if(Object.keys(body).sort().join()!=='controlToken,generation' || typeof body.controlToken!=='string' || typeof body.generation!=='string')throw new OnlineSessionError('invalid_launch_request',400)
   data=await service().start(launchId,body.controlToken,body.generation)
  }else{
   if(Object.keys(body).sort().join()!=='requestId,ticket' || typeof body.ticket!=='string' || typeof body.requestId!=='string')throw new OnlineSessionError('invalid_ticket',400)
   const auth=request.headers.get('authorization') ?? ''
   data=await service().exchange(auth.startsWith('Bearer ')?auth.slice(7):'',body.ticket,body.requestId)
  }
  record(200,'ok');return Response.json({data},{headers})
 }catch(error){
  const safe=error instanceof OnlineSessionError || error instanceof UploadError?error:error instanceof InputError?new OnlineSessionError('invalid_request',error.status):new OnlineSessionError('service_unavailable',503)
  record(safe.status,safe.code);return Response.json({error:{code:safe.code}},{status:safe.status,headers})
 }
}
