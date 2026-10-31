import {moderationMeasuresRequest} from '@/lib/server/moderationMeasures'
export const dynamic='force-dynamic'
export const GET=(request:Request)=>moderationMeasuresRequest(request,'appeals')
export const POST=(request:Request)=>moderationMeasuresRequest(request,'appeals')
