import { NextRequest } from 'next/server'
import { requireAdmin, adminJson } from '../_utils'

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if (adminCheck.error) {
    return adminJson({ isAdmin: false }, { status: adminCheck.error.status })
  }

  return adminJson({
    isAdmin: true,
  })
}
