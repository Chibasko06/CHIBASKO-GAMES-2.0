import 'server-only'
import {InputError} from './inputValidation'
import {UploadError,assertUploadId} from '../game-distribution/uploads/policy'

export function catalogueInput(body:Record<string,unknown>) {
  if(Object.keys(body).some(k=>!['uploadId','kind','metadata','ownership'].includes(k)) || body.ownership!==true)throw new UploadError('invalid_request')
  assertUploadId(String(body.uploadId))
  if(!['new','update'].includes(String(body.kind)) || !body.metadata || typeof body.metadata!=='object' || Array.isArray(body.metadata))throw new UploadError('invalid_request')
  const data=body.metadata as Record<string,unknown>
  if(body.kind==='update'){
    if(Object.keys(data).length)throw new UploadError('invalid_request')
  }else{
    if(Object.keys(data).some(k=>!['title','studio','releaseDate','description','categories','mobile','technology'].includes(k)))throw new UploadError('invalid_request')
    for(const [key,max] of [['title',160],['studio',160],['description',10000],['technology',120]] as const){
      if(typeof data[key]!=='string'||!data[key].trim()||data[key].length>max)throw new UploadError('invalid_request')
    }
    if(typeof data.mobile!=='boolean'||typeof data.releaseDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(data.releaseDate)
      ||!Number.isFinite(Date.parse(data.releaseDate))||new Date(data.releaseDate).toISOString().slice(0,10)!==data.releaseDate)throw new UploadError('invalid_request')
    if(!Array.isArray(data.categories)||data.categories.length<1||data.categories.length>8||new Set(data.categories).size!==data.categories.length)throw new UploadError('invalid_request')
    data.categories.forEach(v=>assertUploadId(String(v)))
  }
  return {p_upload:body.uploadId as string,p_kind:body.kind as 'new'|'update',p_metadata:data}
}

export async function readCatalogueForm(request:Request):Promise<{body:Record<string,unknown>;cover:File|null}> {
  const max=8*1024**2+32*1024
  if(Number(request.headers.get('content-length'))>max)throw new InputError('Image trop volumineuse.',413)
  const reader=request.body?.getReader();if(!reader)throw new InputError()
  const chunks:Uint8Array[]=[];let size=0
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length
    if(size>max){await reader.cancel();throw new InputError('Image trop volumineuse.',413)}chunks.push(value)
  }}finally{reader.releaseLock()}
  try{
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
    const form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')??''}}).formData()
    if([...form.keys()].some(k=>!['metadata','cover'].includes(k))||form.getAll('metadata').length!==1||form.getAll('cover').length>1)throw new InputError()
    const value=form.get('metadata');if(typeof value!=='string'||value.length>20000)throw new InputError()
    const body:unknown=JSON.parse(value),cover=form.get('cover')
    if(!body||typeof body!=='object'||Array.isArray(body)||cover!==null&&!(cover instanceof File))throw new InputError()
    return {body:body as Record<string,unknown>,cover:cover as File|null}
  }catch(error){if(error instanceof InputError)throw error;throw new InputError()}
}
