import { gameServerSession } from '@/lib/server/gameServerSession'
export async function GET(request:Request,context:{params:Promise<{sessionId:string}>}){return gameServerSession(request,(await context.params).sessionId)}
