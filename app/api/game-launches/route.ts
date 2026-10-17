import { gameLaunchRequest } from '@/lib/server/gameLaunches'
export const dynamic='force-dynamic'
export function POST(request:Request){return gameLaunchRequest(request)}
