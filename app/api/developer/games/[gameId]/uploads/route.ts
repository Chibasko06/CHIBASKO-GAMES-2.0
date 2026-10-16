import { developerUploadRequest } from '@/lib/server/developerUploads'
export const dynamic='force-dynamic'
export async function POST(request: Request, context: {params:Promise<{gameId:string}>}) {
  return developerUploadRequest(request,'create',(await context.params).gameId)
}
