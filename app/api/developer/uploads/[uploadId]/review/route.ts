import {developerUploadRequest} from '@/lib/server/developerUploads'
export async function GET(request:Request,{params}:{params:Promise<{uploadId:string}>}) {
  return developerUploadRequest(request,'review',(await params).uploadId)
}
