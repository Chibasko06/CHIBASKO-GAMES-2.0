import { developerUploadRequest } from '@/lib/server/developerUploads'
export const dynamic='force-dynamic'
export async function GET(request: Request, context: {params:Promise<{uploadId:string}>}) {
  return developerUploadRequest(request,'status',(await context.params).uploadId)
}
