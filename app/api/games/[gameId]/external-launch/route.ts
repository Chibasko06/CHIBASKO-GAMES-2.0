import {externalGameLaunchRequest} from '@/lib/server/externalGamePlayer'
export async function GET(request:Request,{params}:{params:Promise<{gameId:string}>}){
  return externalGameLaunchRequest(request,(await params).gameId,'public')
}
