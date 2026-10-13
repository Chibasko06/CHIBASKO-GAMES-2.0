import { NextRequest } from 'next/server'
import { requireAdmin, adminJson } from '../_utils'

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminJson({ isAdmin: false }, { status: 200 })
  }

  return adminJson({
    isAdmin: true,
  })
}
