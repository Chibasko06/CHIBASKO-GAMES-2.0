import { developerPreviewRequest } from '@/lib/server/developerPreviews'
export const dynamic='force-dynamic'
export async function POST(request:Request,context:{params:Promise<{versionId:string}>}) {
  return developerPreviewRequest(request,(await context.params).versionId)
}
