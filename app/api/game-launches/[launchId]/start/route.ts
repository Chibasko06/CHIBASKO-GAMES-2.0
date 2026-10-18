import { onlineRequest } from '@/lib/server/onlineSessions'
export const dynamic='force-dynamic'
export async function POST(request:Request,context:{params:Promise<{launchId:string}>}){return onlineRequest(request,(await context.params).launchId)}
