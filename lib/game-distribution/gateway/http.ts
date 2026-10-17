import { assertArtifactPath } from '../paths'
import { GatewayError } from './contracts'
import type { ArtifactRange } from '../storage'

/** URL parsers normalize dot segments. Check the available raw path BEFORE URL(). */
export function artifactRequestPath(url:string) {
  const raw=/^https:\/\/[^/?#]+(\/[^?#]*)?(?:\?[^#]*)?$/.exec(url)
  if(!raw)throw new GatewayError('invalid_artifact_path',400)
  const path=(raw[1] ?? '/').slice(1)
  if(/%(?:2e|2f|5c|25|00)/i.test(path))throw new GatewayError('invalid_artifact_path',400)
  let decoded:string
  try{decoded=decodeURIComponent(path)}catch{throw new GatewayError('invalid_artifact_path',400)}
  try{assertArtifactPath(decoded)}catch{throw new GatewayError('invalid_artifact_path',400)}
  return decoded
}
export function parseByteRange(value:string|null,size:number):ArtifactRange|undefined {
  if(value===null)return
  const match=/^bytes=(\d*)-(\d*)$/.exec(value)
  if(!match || (!match[1] && !match[2]) || size===0)throw new GatewayError('invalid_range',416)
  if(!match[1]) {
    const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix) || suffix<=0)throw new GatewayError('invalid_range',416)
    const length=Math.min(size,suffix);return {offset:size-length,length}
  }
  const start=Number(match[1]),end=match[2]?Number(match[2]):size-1
  if(!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start>=size || end<start)throw new GatewayError('invalid_range',416)
  return {offset:start,length:Math.min(end,size-1)-start+1}
}
export function previewCookieValue(header:string|null,name:string) {
  const values=(header ?? '').split(';').map(p=>p.trim()).filter(p=>p.startsWith(name+'='))
  if(values.length!==1)throw new GatewayError('preview_expired',403)
  return values[0].slice(name.length+1)
}
