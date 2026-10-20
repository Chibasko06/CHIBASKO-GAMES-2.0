import 'server-only'
import {getCloudflareContext} from '@opennextjs/cloudflare'
import {r2FromEnvironment,R2ConfigurationError} from '../game-distribution/uploads/r2'
import {NativeStagingR2,type StagingR2Bucket} from '../game-distribution/uploads/r2-native'

type Context={env?:{GAME_BUILDS_STAGING?:StagingR2Bucket}}
export function uploadStagingStorage(env:Record<string,string|undefined>=process.env,context:()=>Context=getCloudflareContext as ()=>Context){
 let bindings:Context|undefined
 try{bindings=context()}catch{/* Node tools and Next.js development have no Worker context. */}
 if(bindings||env.CHIBASKO_CLOUDFLARE==='1'){
  const bucket=bindings?.env?.GAME_BUILDS_STAGING
  if(!bucket||typeof bucket.createMultipartUpload!=='function'||typeof bucket.resumeMultipartUpload!=='function'||typeof bucket.head!=='function'||typeof bucket.delete!=='function'){
   throw new R2ConfigurationError({present:[],missing:['GAME_BUILDS_STAGING'],invalid:[]})
  }
  return new NativeStagingR2(bucket,r2FromEnvironment(env,'STAGING'))
 }
 return r2FromEnvironment(env,'STAGING')
}
