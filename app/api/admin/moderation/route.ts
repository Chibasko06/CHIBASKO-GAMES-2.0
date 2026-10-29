import {moderationRequest} from '@/lib/server/moderationRequest'
export const dynamic='force-dynamic'
export const GET=(request:Request)=>moderationRequest(request,true)
export const POST=(request:Request)=>moderationRequest(request,true)
