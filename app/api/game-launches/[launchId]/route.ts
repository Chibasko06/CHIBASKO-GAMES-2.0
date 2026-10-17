import { gameLaunchRequest } from '@/lib/server/gameLaunches'
export const dynamic='force-dynamic'
export async function DELETE(request:Request,context:{params:Promise<{launchId:string}>}){return gameLaunchRequest(request,(await context.params).launchId)}
