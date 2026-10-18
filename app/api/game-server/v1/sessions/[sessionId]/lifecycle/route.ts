import { multiplayerLifecycle } from '@/lib/server/multiplayerLifecycle'
export async function POST(request:Request,context:{params:Promise<{sessionId:string}>}) {
 return multiplayerLifecycle(request,(await context.params).sessionId)
}
