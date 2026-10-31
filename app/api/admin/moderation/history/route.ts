import {moderationBrowseRequest} from '@/lib/server/moderationMeasures'
export const dynamic='force-dynamic'
export const GET=(request:Request)=>moderationBrowseRequest(request)
