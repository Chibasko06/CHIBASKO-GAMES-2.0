import { developerUploadRequest } from '@/lib/server/developerUploads'
export const dynamic='force-dynamic'
type Context={params:Promise<{uploadId:string}>}
export async function POST(request: Request, context: Context) {
  return developerUploadRequest(request,'parts',(await context.params).uploadId)
}
export async function GET(request: Request, context: Context) {
  return developerUploadRequest(request,'parts',(await context.params).uploadId)
}
