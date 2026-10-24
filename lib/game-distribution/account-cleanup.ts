import type {UploadRepository} from './uploads/contracts'
import type {CleanupTask} from './account-deletion'

type ObjectInfo={key:string;customMetadata?:Record<string,string>}
export type CleanupBucket={
 head(key:string):Promise<ObjectInfo|null>
 delete(key:string|string[]):Promise<void>
 list(options:{prefix:string;cursor?:string;limit:number}):Promise<{objects:ObjectInfo[];truncated:boolean;cursor?:string}>
 resumeMultipartUpload?(key:string,id:string):{abort():Promise<void>}
}
export type CleanupBindings={CHIBASKO_ASSETS?:CleanupBucket;GAME_BUILDS_STAGING?:CleanupBucket;GAME_BUILDS_ARTIFACTS?:CleanupBucket}
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'

export function accountCleanup(db:UploadRepository,bindings:CleanupBindings,signal?:AbortSignal){
 return async(task:CleanupTask)=>{
  signal?.throwIfAborted()
  const staging=task.kind==='staging',artifacts=task.kind==='artifacts'
  const bucket=staging?bindings.GAME_BUILDS_STAGING:artifacts?bindings.GAME_BUILDS_ARTIFACTS:bindings.CHIBASKO_ASSETS
  if(!bucket)throw Error('cleanup_binding_missing')
  if(staging){
   if(!new RegExp('^staging/uploads/'+uuid+'/source[.]zip$').test(task.key))throw Error('invalid_cleanup_scope')
   if(task.multipart){
    if(!bucket.resumeMultipartUpload)throw Error('multipart_cleanup_unavailable')
    try{await bucket.resumeMultipartUpload(task.key,task.multipart).abort()}
    catch(error){if(!(error&&typeof error==='object'&&'code' in error&&error.code==='NoSuchUpload'))throw Error('multipart_cleanup_unavailable')}
   }
   signal?.throwIfAborted();await bucket.delete(task.key)
   return {done:true,cursor:null}
  }
  if(artifacts&&!new RegExp('^games/'+uuid+'/$').test(task.key))throw Error('invalid_cleanup_scope')
  if(task.kind==='avatars'&&(!task.owner||task.key!==`avatars/${task.owner}/`||!new RegExp('^'+uuid+'$').test(task.owner)))throw Error('invalid_cleanup_scope')
  if(task.kind==='cover'&&!new RegExp('^game-thumbnails/'+uuid+'[.](png|jpg|webp|gif|avif|svg|ico)$').test(task.key))throw Error('invalid_cleanup_scope')
  const page=task.kind==='cover'?{objects:[{key:task.key}],truncated:false,cursor:undefined}:
   await bucket.list({prefix:task.key,limit:artifacts?100:8,...(task.cursor?{cursor:task.cursor}:{})})
  if(page.objects.some(object=>!object.key.startsWith(task.key)))throw Error('invalid_cleanup_scope')
  if(artifacts){
   signal?.throwIfAborted();if(page.objects.length)await bucket.delete(page.objects.map(object=>object.key))
   if(page.truncated&&(!page.cursor||page.cursor===task.cursor))throw Error('invalid_cleanup_cursor')
   return {done:!page.truncated,cursor:page.truncated?page.cursor!:null}
  }
  for(const object of page.objects){
   signal?.throwIfAborted()
   if(!object.key.startsWith(task.key))throw Error('invalid_cleanup_scope')
   if(!artifacts){
    if(task.kind==='avatars'&&!new RegExp('^avatars/'+uuid+'/'+uuid+'[.](jpg|png|webp|gif|ico)$').test(object.key))throw Error('invalid_cleanup_scope')
    const info=await bucket.head(object.key)
    if(!info)continue
    const metadata=info.customMetadata
    if(metadata?.application!=='chibasko-games'||metadata.kind!==(task.kind==='avatars'?'avatars':'game-thumbnails')
     ||(task.kind==='avatars'&&metadata.userId!==task.owner))throw Error('unverified_cleanup_object')
    if(!await db.call<boolean>('distribution_account_reserve_asset',{p_task:task.id,p_lease:task.lease,p_key:object.key}))continue
   }
   signal?.throwIfAborted();await bucket.delete(object.key)
  }
  if(page.truncated&&(!page.cursor||page.cursor===task.cursor))throw Error('invalid_cleanup_cursor')
  return {done:!page.truncated,cursor:page.truncated?page.cursor!:null}
 }
}
