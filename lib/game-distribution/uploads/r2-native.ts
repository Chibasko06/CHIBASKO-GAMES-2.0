import type {Part,StagingStorage} from './contracts'
import {R2RequestError,type R2Failure} from './r2'

export type StagingR2Bucket={
 createMultipartUpload(key:string):Promise<{uploadId:string}>
 resumeMultipartUpload(key:string,uploadId:string):{
  complete(parts:{partNumber:number;etag:string}[]):Promise<unknown>
  abort():Promise<void>
 }
 head(key:string):Promise<{size:number;httpEtag:string}|null>
 delete(key:string):Promise<void>
}

/** R2 bindings have no ListParts or presigning API; those operations retain the S3 adapter. */
export class NativeStagingR2 implements StagingStorage{
 constructor(private bucket:StagingR2Bucket,private s3:Pick<StagingStorage,'parts'|'signPart'>){}
 private async run<T>(action:R2Failure['action'],operation:()=>Promise<T>):Promise<T>{
  try{return await operation()}catch(error){
   if(error instanceof R2RequestError)throw error
   throw new R2RequestError({kind:'binding_error',action})
  }
 }
 begin(key:string){return this.run('multipart_create',async()=>{
  const result=await this.bucket.createMultipartUpload(key)
  if(!result||typeof result.uploadId!=='string'||!result.uploadId)throw new R2RequestError({kind:'invalid_response',action:'multipart_create'})
  return result.uploadId
 })}
 signPart(key:string,multipart:string,part:number,size:number,seconds:number){return this.s3.signPart(key,multipart,part,size,seconds)}
 parts(key:string,multipart:string){return this.s3.parts(key,multipart)}
 complete(key:string,multipart:string,parts:Part[]){return this.run('multipart_complete',async()=>{
  if(parts.some(p=>typeof p.etag!=='string'||!p.etag||p.etag.length>1024||/[\u0000-\u001f\u007f]/.test(p.etag)))throw new R2RequestError({kind:'invalid_response',action:'multipart_complete'})
  await this.bucket.resumeMultipartUpload(key,multipart).complete(parts.map(p=>({partNumber:p.number,etag:p.etag.replace(/^"|"$/g,'')})))
 })}
 head(key:string){return this.run('object_head',async()=>{
  const object=await this.bucket.head(key)
  if(!object)return null
  if(!Number.isSafeInteger(object.size)||object.size<0||typeof object.httpEtag!=='string'||!object.httpEtag)throw new R2RequestError({kind:'invalid_response',action:'object_head'})
  return {size:object.size,etag:object.httpEtag}
 })}
 abort(key:string,multipart:string){return this.run('multipart_abort',()=>this.bucket.resumeMultipartUpload(key,multipart).abort())}
 delete(key:string){return this.run('object_delete',()=>this.bucket.delete(key))}
}
