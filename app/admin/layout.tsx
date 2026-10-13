import { requireAdminPage } from '@/lib/server/adminPage'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const metadata = { robots: { index: false, follow: false } }
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage()
  return children
}
