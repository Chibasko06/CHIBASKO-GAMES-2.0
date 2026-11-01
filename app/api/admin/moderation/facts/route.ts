import {moderationFactsRequest} from '@/lib/server/moderationMeasures'
export const dynamic='force-dynamic'
export const GET=(request:Request)=>moderationFactsRequest(request)
export const POST=(request:Request)=>moderationFactsRequest(request)
