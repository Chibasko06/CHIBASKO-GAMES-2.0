import {moderationFactsRequest} from '@/lib/server/moderationMeasures'
export const dynamic='force-dynamic'
export const POST=(request:Request)=>moderationFactsRequest(request,true)
