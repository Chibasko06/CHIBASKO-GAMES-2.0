import {externalGameLaunchRequest} from '@/lib/server/externalGamePlayer'
export async function GET(request:Request,{params}:{params:Promise<{revisionId:string}>}){
  return externalGameLaunchRequest(request,(await params).revisionId,'private')
}
