import {adminMailRequest} from '@/lib/server/adminMailRequest'

export const dynamic='force-dynamic'
export const GET=(request:Request)=>adminMailRequest(request)
export const POST=(request:Request)=>adminMailRequest(request)
export const DELETE=(request:Request)=>adminMailRequest(request)
