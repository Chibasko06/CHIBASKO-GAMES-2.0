import { onlineRequest } from '@/lib/server/onlineSessions'
export const dynamic='force-dynamic'
export function POST(request:Request){return onlineRequest(request)}
