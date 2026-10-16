import { AwsClient } from 'aws4fetch'
import { DOMParser } from '@xmldom/xmldom'
import { UploadError } from './policy'
import type { Part, StagingStorage } from './contracts'
import type { ImmutableArtifactBucket } from '../storage'

type Body = Uint8Array | ReadableStream<Uint8Array>
type R2Config = { accountId:string; accessKeyId:string; secretAccessKey:string; bucket:string }
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
    const signed = await this.aws.sign(this.url(key,query),{method,body,headers,signal:signal ?? AbortSignal.timeout(30_000)})
    try {return await this.fetcher(signed,{redirect:'error'})}
    catch {throw new UploadError('storage_error',503)}
  }
  private async xml(response: Response) {
    if (!response.ok) { await response.body?.cancel(); throw new UploadError('storage_error',503) }
    const text = await response.text()
    if (text.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(text)) throw new UploadError('storage_error',503)
    const doc = new DOMParser({onError:()=>{throw new UploadError('storage_error',503)}}).parseFromString(text,'application/xml')
    if (doc.getElementsByTagName('Error').length) throw new UploadError('storage_error',503)
    return doc
  }
  async begin(key: string) {
    const doc = await this.xml(await this.request(key,'POST',{uploads:''}))
    const id = doc.getElementsByTagName('UploadId')[0]?.textContent
    if (!id) throw new UploadError('storage_error',503)
    return id
  }
  async signPart(key: string, multipart: string, part: number, size: number, seconds: number) {
    const url = this.url(key,{uploadId:multipart,partNumber:String(part),'X-Amz-Expires':String(seconds)})
    const signed = await this.aws.sign(url,{method:'PUT',headers:{'Content-Length':String(size)},aws:{signQuery:true,allHeaders:true}})
    return signed.url
  }
  async parts(key: string, multipart: string): Promise<Part[]> {
    const parts: Part[] = []; let marker = '0'
    do {
      const doc = await this.xml(await this.request(key,'GET',{uploadId:multipart,'part-number-marker':marker}))
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
    await this.xml(await this.request(key,'POST',{uploadId:multipart},xml,{'Content-Type':'application/xml'}))
  }
  async head(key: string) {
    const response=await this.request(key,'HEAD')
    if (response.status===404) return null
    if (!response.ok) throw new UploadError('storage_error',503)
    return {size:Number(response.headers.get('Content-Length')),etag:response.headers.get('ETag') ?? ''}
  }
  async abort(key: string, multipart: string) {
    const response=await this.request(key,'DELETE',{uploadId:multipart})
    if (!response.ok && response.status!==404) throw new UploadError('storage_error',503)
  }
  async delete(key: string) {
    const response=await this.request(key,'DELETE')
    if (!response.ok) throw new UploadError('storage_error',503)
  }
  async read(key: string, etag: string, signal: AbortSignal) {
    const response=await this.request(key,'GET',{},undefined,{'If-Match':etag},signal)
    if (!response.ok || !response.body) throw new UploadError('storage_error',503)
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
      if(!result.ok)throw new UploadError('storage_error',503)
      await result.body?.cancel();return {}
    }}
  }
  async metadata(key: string) {
    const response=await this.request(key,'HEAD')
    if(response.status===404)return null
    if(!response.ok)throw new UploadError('storage_error',503)
    return {sha256:response.headers.get('x-amz-meta-sha256'),size:Number(response.headers.get('Content-Length'))}
  }
  async *keys(prefix: string) {
    let token=''
    do {
      const doc=await this.xml(await this.request('','GET',{'list-type':'2',prefix,...(token?{'continuation-token':token}:{})}))
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
  return new DistributionR2({accountId:env.GAME_BUILDS_R2_ACCOUNT_ID ?? '',accessKeyId:env.GAME_BUILDS_R2_ACCESS_KEY_ID ?? '',
    secretAccessKey:env.GAME_BUILDS_R2_SECRET_ACCESS_KEY ?? '',bucket:env['GAME_BUILDS_'+bucket+'_BUCKET'] ?? ''})
}
export type ArtifactBody = Body
