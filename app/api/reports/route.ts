import {moderationRequest} from '@/lib/server/moderationRequest'
export const dynamic='force-dynamic'
export const POST=(request:Request)=>moderationRequest(request)
