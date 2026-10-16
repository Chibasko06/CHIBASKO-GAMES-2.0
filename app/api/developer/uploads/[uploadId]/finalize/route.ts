import { developerUploadRequest } from '@/lib/server/developerUploads'
export const dynamic='force-dynamic'
export async function POST(request: Request, context: {params:Promise<{uploadId:string}>}) {
  return developerUploadRequest(request,'finalize',(await context.params).uploadId)
}
