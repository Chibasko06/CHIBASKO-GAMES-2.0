import { multiplayerRequest } from '@/lib/server/multiplayerLobbies'
type Context={params:Promise<{segments:string[]}>}
export async function GET(request:Request,context:Context){return multiplayerRequest(request,(await context.params).segments)}
export async function POST(request:Request,context:Context){return multiplayerRequest(request,(await context.params).segments)}
