import {moderationMeasuresRequest} from '@/lib/server/moderationMeasures'
export const dynamic='force-dynamic'
export const GET=(request:Request)=>moderationMeasuresRequest(request,'admin')
export const POST=(request:Request)=>moderationMeasuresRequest(request,'admin')
