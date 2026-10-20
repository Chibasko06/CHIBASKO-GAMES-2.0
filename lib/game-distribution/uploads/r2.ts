import { AwsClient } from 'aws4fetch'
import { DOMParser } from '@xmldom/xmldom'
import { UploadError } from './policy'
import type { Part, StagingStorage } from './contracts'
import type { ImmutableArtifactBucket } from '../storage'

type Body = Uint8Array | ReadableStream<Uint8Array>
type R2Config = { accountId:string; accessKeyId:string; secretAccessKey:string; bucket:string }
export type R2EnvironmentReport={present:string[];missing:string[];invalid:string[]}
export function r2EnvironmentReport(env:Record<string,string|undefined>,bucket:'STAGING'|'ARTIFACTS'):R2EnvironmentReport{
  const names=['GAME_BUILDS_R2_ACCOUNT_ID','GAME_BUILDS_R2_ACCESS_KEY_ID','GAME_BUILDS_R2_SECRET_ACCESS_KEY','GAME_BUILDS_'+bucket+'_BUCKET']
  const missing=names.filter(name=>!env[name]),present=names.filter(name=>!!env[name])
  const invalid=present.filter(name=>name==='GAME_BUILDS_R2_ACCOUNT_ID'?!/^[a-f0-9]{32}$/.test(env[name]!):name.endsWith('_BUCKET')?!/^[a-z0-9][a-z0-9-]{1,62}$/.test(env[name]!):env[name]!.trim()!==env[name])
  return {present,missing,invalid}
}
export class R2ConfigurationError extends UploadError{
  constructor(readonly configuration:R2EnvironmentReport){super('service_unavailable',503)}
}
type R2Action='multipart_create'|'multipart_list'|'multipart_complete'|'multipart_abort'|'multipart_sign'|'object_head'|'object_read'|'object_write'|'object_delete'|'object_list'
export type R2Failure={kind:'signing_error'|'network_error'|'timeout'|'http_error'|'invalid_response';action:R2Action;upstreamStatus?:number;r2Code?:string}
export class R2RequestError extends UploadError{
  constructor(readonly diagnostic:R2Failure){super('storage_error',503)}
}
function actionFor(method:string,query:Record<string,string>):R2Action{
  if(Object.hasOwn(query,'uploads'))return 'multipart_create'
  if(Object.hasOwn(query,'uploadId'))return method==='GET'?'multipart_list':method==='DELETE'?'multipart_abort':'multipart_complete'
  return method==='HEAD'?'object_head':method==='PUT'?'object_write':method==='DELETE'?'object_delete':Object.hasOwn(query,'list-type')?'object_list':'object_read'
}
function safeR2Code(text:string){
  const code=/<Code>\s*([A-Za-z]+)\s*<\/Code>/.exec(text)?.[1]
  return code&&['AccessDenied','InvalidAccessKeyId','SignatureDoesNotMatch','NoSuchBucket','NoSuchUpload','InvalidBucketName','RequestTimeTooSkewed','RequestExpired','InvalidArgument','EntityTooLarge','InternalError','SlowDown','ServiceUnavailable','BadDigest','InvalidDigest'].includes(code)?code:undefined
}
async function boundedText(response:Response,max:number){
  const reader=response.body?.getReader();if(!reader)return ''
  const chunks:Uint8Array[]=[];let size=0
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length
    if(size>max){await reader.cancel();throw Error('Response limit')};chunks.push(value)
  }}finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  return new TextDecoder().decode(bytes)
}
/** Private bucket only. No user-supplied endpoint, key or bucket. */
export class DistributionR2 implements StagingStorage {
  private aws: AwsClient
  constructor(private config: R2Config, private fetcher: typeof fetch = fetch) {
    if (!/^[a-f0-9]{32}$/.test(config.accountId) || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(config.bucket)
      || !config.accessKeyId || !config.secretAccessKey) throw new UploadError('service_unavailable',503)
    this.aws = new AwsClient({...config,service:'s3',region:'auto',retries:0})
  }
  private url(key: string, query: Record<string,string> = {}) {
    const url = new URL(`https://${this.config.accountId}.r2.cloudflarestorage.com/${this.config.bucket}/`+key.split('/').map(encodeURIComponent).join('/'))
    for (const [k,v] of Object.entries(query)) url.searchParams.set(k,v)
    return url
  }
  private async request(key: string, method: string, query: Record<string,string> = {}, body?: BodyInit, headers: HeadersInit = {}, signal?: AbortSignal) {
    const action=actionFor(method,query),requestSignal=signal??AbortSignal.timeout(30_000)
    let signed=false
    try {const request=await this.aws.sign(this.url(key,query),{method,body,headers,signal:requestSignal});signed=true
      return await this.fetcher(request,{redirect:'error',signal:requestSignal})}
    catch {throw new R2RequestError({kind:requestSignal.aborted?'timeout':signed?'network_error':'signing_error',action})}
  }
  private async checkResponse(response:Response,action:R2Action){
    if(response.ok)return
    // Only an allowlisted S3 error code survives; messages, URLs and request identifiers do not.
    const text=await boundedText(response,16_384).catch(()=> '')
    throw new R2RequestError({kind:'http_error',action,upstreamStatus:response.status,r2Code:safeR2Code(text)})
  }
  private async xml(response: Response,action:R2Action) {
    await this.checkResponse(response,action)
    try{
      const text=await boundedText(response,2_000_000)
      if (/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('Unsafe XML')
      const doc=new DOMParser({onError:()=>{throw Error('Invalid XML')}}).parseFromString(text,'application/xml')
      if(doc.getElementsByTagName('Error').length)throw new R2RequestError({kind:'http_error',action,upstreamStatus:response.status,r2Code:safeR2Code(text)})
      return doc
    }catch(error){if(error instanceof R2RequestError)throw error
      throw new R2RequestError({kind:error instanceof Error&&['AbortError','TimeoutError'].includes(error.name)?'timeout':'invalid_response',action,upstreamStatus:response.status})}
  }
  async begin(key: string) {
    const doc = await this.xml(await this.request(key,'POST',{uploads:''}),'multipart_create')
    const id = doc.getElementsByTagName('UploadId')[0]?.textContent
    if (!id) throw new R2RequestError({kind:'invalid_response',action:'multipart_create'})
    return id
  }
  async signPart(key: string, multipart: string, part: number, size: number, seconds: number) {
    const url = this.url(key,{uploadId:multipart,partNumber:String(part),'X-Amz-Expires':String(seconds)})
    try{const signed = await this.aws.sign(url,{method:'PUT',headers:{'Content-Length':String(size)},aws:{signQuery:true,allHeaders:true}})
      return signed.url}catch{throw new R2RequestError({kind:'signing_error',action:'multipart_sign'})}
  }
  async parts(key: string, multipart: string): Promise<Part[]> {
    const parts: Part[] = []; let marker = '0'
    do {
      const doc = await this.xml(await this.request(key,'GET',{uploadId:multipart,'part-number-marker':marker}),'multipart_list')
      for (const node of Array.from(doc.getElementsByTagName('Part'))) parts.push({
        number:Number(node.getElementsByTagName('PartNumber')[0]?.textContent),
        size:Number(node.getElementsByTagName('Size')[0]?.textContent),etag:node.getElementsByTagName('ETag')[0]?.textContent ?? ''})
      if (parts.length > 10_000) throw new UploadError('storage_error',503)
      const next = doc.getElementsByTagName('IsTruncated')[0]?.textContent==='true' ? doc.getElementsByTagName('NextPartNumberMarker')[0]?.textContent : null
      if (next && Number(next)<=Number(marker)) throw new UploadError('storage_error',503)
      marker = next ?? ''
    } while (marker)
    return parts.sort((a,b)=>a.number-b.number)
  }
  async complete(key: string, multipart: string, parts: Part[]) {
    if (parts.some(p=>!/^"?[a-fA-F0-9-]+"?$/.test(p.etag))) throw new UploadError('storage_error',503)
    const xml = '<CompleteMultipartUpload>'+parts.map(p=>`<Part><PartNumber>${p.number}</PartNumber><ETag>${p.etag.replaceAll('"','&quot;')}</ETag></Part>`).join('')+'</CompleteMultipartUpload>'
    await this.xml(await this.request(key,'POST',{uploadId:multipart},xml,{'Content-Type':'application/xml'}),'multipart_complete')
  }
  async head(key: string) {
    const response=await this.request(key,'HEAD')
    if (response.status===404) return null
    await this.checkResponse(response,'object_head')
    return {size:Number(response.headers.get('Content-Length')),etag:response.headers.get('ETag') ?? ''}
  }
  async abort(key: string, multipart: string) {
    const response=await this.request(key,'DELETE',{uploadId:multipart})
    if(response.status!==404)await this.checkResponse(response,'multipart_abort')
  }
  async delete(key: string) {
    const response=await this.request(key,'DELETE')
    await this.checkResponse(response,'object_delete')
  }
  async read(key: string, etag: string, signal: AbortSignal) {
    const response=await this.request(key,'GET',{},undefined,{'If-Match':etag},signal)
    await this.checkResponse(response,'object_read')
    if(!response.body)throw new R2RequestError({kind:'invalid_response',action:'object_read'})
    return response.body
  }
  /** Same conditional port as GD-1, widened to streaming bodies. */
  bucket(signal: AbortSignal): ImmutableArtifactBucket {
    return {put:async(key,body,options)=>{
      const headers=new Headers(options.onlyIf)
      headers.set('Content-Type',options.httpMetadata.contentType)
      headers.set('Cache-Control',options.httpMetadata.cacheControl)
      const length=body instanceof Uint8Array?body.byteLength:Number(options.customMetadata.size)
      if(!Number.isSafeInteger(length) || length<0)throw new UploadError('storage_error',503)
      headers.set('Content-Length',String(length))
      if(options.httpMetadata.contentEncoding)headers.set('Content-Encoding',options.httpMetadata.contentEncoding)
      for(const [k,v] of Object.entries(options.customMetadata))headers.set('x-amz-meta-'+k,v)
      const result=await this.request(key,'PUT',{},body as BodyInit,headers,signal)
      if(result.status===412)return null
      await this.checkResponse(result,'object_write')
      await result.body?.cancel();return {}
    }}
  }
  async metadata(key: string) {
    const response=await this.request(key,'HEAD')
    if(response.status===404)return null
    await this.checkResponse(response,'object_head')
    return {sha256:response.headers.get('x-amz-meta-sha256'),size:Number(response.headers.get('Content-Length'))}
  }
  async *keys(prefix: string) {
    let token=''
    do {
      const doc=await this.xml(await this.request('','GET',{'list-type':'2',prefix,...(token?{'continuation-token':token}:{})}),'object_list')
      for(const key of Array.from(doc.getElementsByTagName('Key'))) {
        const value=key.textContent ?? ''
        if(!value.startsWith(prefix))throw new UploadError('storage_error',503)
        yield value
      }
      token=doc.getElementsByTagName('NextContinuationToken')[0]?.textContent ?? ''
    } while(token)
  }
}
export function r2FromEnvironment(env: Record<string,string | undefined>, bucket: 'STAGING' | 'ARTIFACTS') {
  const configuration=r2EnvironmentReport(env,bucket)
  if(configuration.missing.length||configuration.invalid.length)throw new R2ConfigurationError(configuration)
  return new DistributionR2({accountId:env.GAME_BUILDS_R2_ACCOUNT_ID ?? '',accessKeyId:env.GAME_BUILDS_R2_ACCESS_KEY_ID ?? '',
    secretAccessKey:env.GAME_BUILDS_R2_SECRET_ACCESS_KEY ?? '',bucket:env['GAME_BUILDS_'+bucket+'_BUCKET'] ?? ''})
}
export type ArtifactBody = Body
