import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../_utils'

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return NextResponse.json({ isAdmin: false }, { status: 200 })
  }

  return NextResponse.json({
    isAdmin: true,
    email: adminCheck.user.email ?? null,
  })
}
